import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/balances — tokens, coins, xp, level, active model, resting status */
export async function GET() {
  const user = await getCurrentUser();

  const [userXp, activeRental] = await Promise.all([
    db.userXp.findUnique({
      where: { userId: user.id },
      select: { xpAmount: true, level: true, streakDays: true },
    }).catch(() => null),
    db.modelRental.findFirst({
      where: { userId: user.id, status: "active", expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "desc" },
      select: { id: true, modelName: true, expiresAt: true },
    }).catch(() => null),
  ]);

  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  const isResting = Boolean(user.freeModelRestingUntil && new Date() < user.freeModelRestingUntil);

  return NextResponse.json({
    tokens: user.tokenBalance ?? 50,
    coins: user.coinBalance ?? 0,
    xp: userXp?.xpAmount ?? 0,
    level: userXp?.level ?? 1,
    streak: userXp?.streakDays ?? 0,
    activeModel: user.currentModel ?? "study_buddy_free",
    activeRental,
    isPremium,
    isResting,
    freeModelRestingUntil: user.freeModelRestingUntil,
  });
}
