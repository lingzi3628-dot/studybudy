import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/user/wake-free-model
 *
 * Spends coins to instantly wake the resting free model.
 * Resets freeModelRestingUntil to null.
 */
export async function POST() {
  const user = await getCurrentUser();

  const settings = await db.restingSettings.findFirst().catch(() => null) ?? {
    wakeCostCoins: 5,
  };

  // Check if actually resting
  if (!user.freeModelRestingUntil || new Date() >= user.freeModelRestingUntil) {
    return NextResponse.json({
      ok: true,
      alreadyAwake: true,
      message: "Free model is already awake.",
    });
  }

  // Check coin balance
  if ((user.coinBalance ?? 0) < settings.wakeCostCoins) {
    return NextResponse.json(
      {
        error: `You need ${settings.wakeCostCoins} coins to wake the free model. You have ${user.coinBalance ?? 0}.`,
        needsUpgrade: true,
        code: "INSUFFICIENT_COINS",
      },
      { status: 402 }
    );
  }

  // Deduct coins
  await db.user.update({
    where: { id: user.id },
    data: {
      coinBalance: { decrement: settings.wakeCostCoins },
      freeModelRestingUntil: null,
    },
  });

  await db.coinTransaction.create({
    data: { userId: user.id, amount: -settings.wakeCostCoins, reason: "wake_free_model" },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    coinsSpent: settings.wakeCostCoins,
    newCoinBalance: (user.coinBalance ?? 0) - settings.wakeCostCoins,
    message: "Study Buddy Free is awake! 🎉",
  });
}
