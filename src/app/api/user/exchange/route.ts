import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Admin-defined exchange rate (could be moved to a settings table)
// 10 coins = 100 tokens (and reverse: 100 tokens = 8 coins — 20% fee)
const COIN_TO_TOKEN_RATE = 10;  // 1 coin = 10 tokens
const TOKEN_TO_COIN_RATE = 0.08; // 1 token = 0.08 coins (20% exchange fee)

/**
 * POST /api/user/exchange
 * Body: { from: 'coins'|'tokens', to: 'coins'|'tokens', amount }
 *
 * Converts between coins and tokens. Logs transactions for both.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    from?: "coins" | "tokens";
    to?: "coins" | "tokens";
    amount?: number;
  };

  const from = body.from;
  const to = body.to;
  const amount = Math.max(1, Math.min(10000, Number(body.amount ?? 0)));

  if (!from || !to || !amount) {
    return NextResponse.json({ error: "from, to, and amount required" }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ error: "from and to must be different" }, { status: 400 });
  }
  if ((from === "coins" && to !== "tokens") || (from === "tokens" && to !== "coins")) {
    return NextResponse.json({ error: "Only coins↔tokens exchange supported" }, { status: 400 });
  }

  let receivedAmount = 0;
  let newFromBalance = 0;

  if (from === "coins" && to === "tokens") {
    // Check coin balance
    if ((user.coinBalance ?? 0) < amount) {
      return NextResponse.json(
        { error: `You need ${amount} coins. You have ${user.coinBalance ?? 0}.`, code: "INSUFFICIENT_COINS" },
        { status: 402 }
      );
    }
    receivedAmount = amount * COIN_TO_TOKEN_RATE;
    newFromBalance = (user.coinBalance ?? 0) - amount;

    await db.user.update({
      where: { id: user.id },
      data: {
        coinBalance: { decrement: amount },
        tokenBalance: { increment: receivedAmount },
      },
    });
    await db.coinTransaction.create({
      data: { userId: user.id, amount: -amount, reason: "exchange:coins_to_tokens" },
    }).catch(() => {});
    await db.tokenTransaction.create({
      data: { userId: user.id, amount: receivedAmount, reason: "exchange:coins_to_tokens" },
    }).catch(() => {});
  } else {
    // tokens → coins
    if ((user.tokenBalance ?? 0) < amount) {
      return NextResponse.json(
        { error: `You need ${amount} tokens. You have ${user.tokenBalance ?? 0}.`, code: "INSUFFICIENT_TOKENS" },
        { status: 402 }
      );
    }
    receivedAmount = Math.floor(amount * TOKEN_TO_COIN_RATE);
    if (receivedAmount < 1) {
      return NextResponse.json(
        { error: "Amount too small to exchange for coins. Minimum 13 tokens." },
        { status: 400 }
      );
    }
    newFromBalance = (user.tokenBalance ?? 0) - amount;

    await db.user.update({
      where: { id: user.id },
      data: {
        tokenBalance: { decrement: amount },
        coinBalance: { increment: receivedAmount },
      },
    });
    await db.tokenTransaction.create({
      data: { userId: user.id, amount: -amount, reason: "exchange:tokens_to_coins" },
    }).catch(() => {});
    await db.coinTransaction.create({
      data: { userId: user.id, amount: receivedAmount, reason: "exchange:tokens_to_coins" },
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    from, to, amount,
    received: receivedAmount,
    newCoinBalance: from === "coins" ? newFromBalance : (user.coinBalance ?? 0) + receivedAmount,
    newTokenBalance: from === "tokens" ? newFromBalance : (user.tokenBalance ?? 0) + receivedAmount,
    rate: from === "coins" ? `1 coin = ${COIN_TO_TOKEN_RATE} tokens` : `${Math.round(1 / TOKEN_TO_COIN_RATE)} tokens = 1 coin`,
  });
}
