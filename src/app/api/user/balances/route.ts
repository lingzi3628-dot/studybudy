import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FREE_DAILY_LIMITS } from "@/lib/monetization";

export const runtime = "nodejs";

/**
 * GET /api/user/balances — tokens, coins, xp, level, active model, resting status
 *
 * Phase 21 additions:
 *   - tokenResetDate: when the user's tokens will next refill (ISO string)
 *   - dailyAllowance: the daily token allowance (500 for free, plan.tokenLimit for premium)
 *   - perFeatureRemaining: per-feature daily cap usage for the top features
 */
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

  // Phase 21 — compute per-feature daily usage for the most-used features
  // (so the UI can warn users before they hit a cap)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const topFeatures = ["tutor", "search", "cards", "quiz", "translate", "concept_map", "ai_teacher", "learning_path"];
  const usageRows: Array<{ feature: string; count: number }> = await db.dailyUsage.findMany({
    where: { userId: user.id, feature: { in: topFeatures }, usageDate: todayStart },
    select: { feature: true, count: true },
  }).catch(() => [] as Array<{ feature: string; count: number }>);
  const usageMap = new Map(usageRows.map((u) => [u.feature, u.count]));

  const perFeatureRemaining = topFeatures.map((f) => {
    const limit = FREE_DAILY_LIMITS[f] ?? 999;
    const used = usageMap.get(f) ?? 0;
    return {
      feature: f,
      usedToday: used,
      limit: isPremium ? null : limit, // null = unlimited for premium
      remaining: isPremium ? null : Math.max(0, limit - used),
    };
  });

  // Daily allowance message
  const dailyAllowance = isPremium
    ? null // premium uses monthly allowance, not daily
    : 500; // FREE_DAILY_TOKEN_ALLOWANCE

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
    // Phase 21 — new fields
    tokenResetDate: user.tokenResetDate ?? null,
    dailyAllowance,
    perFeatureRemaining,
  });
}
