import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Convert lifetime XP into spendable coins at 100 XP = 1 coin. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { amount?: number };
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100_000 || amount % 100 !== 0) {
    return NextResponse.json({ error: "Choose an XP amount in multiples of 100 (maximum 100,000)." }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const debit = await tx.userXp.updateMany({ where: { userId: user.id, xpAmount: { gte: amount } }, data: { xpAmount: { decrement: amount } } });
      if (debit.count !== 1) throw new Error("NOT_ENOUGH_XP");
      const coins = amount / 100;
      const account = await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: coins } }, select: { coinBalance: true } });
      await tx.coinTransaction.create({ data: { userId: user.id, amount: coins, reason: "exchange:xp_to_coins" } });
      return { coins, xp: amount, coinBalance: account.coinBalance };
    });
    return NextResponse.json({ ok: true, ...result, rate: "100 XP = 1 coin" });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_ENOUGH_XP") return NextResponse.json({ error: "You do not have enough XP for that exchange." }, { status: 402 });
    console.error("[exchange-xp] failed:", error);
    return NextResponse.json({ error: "Could not exchange XP right now. Please try again." }, { status: 500 });
  }
}
