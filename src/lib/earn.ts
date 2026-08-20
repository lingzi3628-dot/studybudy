/**
 * Phase 13 — Earn rules helper.
 *
 * awardAction(userId, action) — checks the earn_rules table, awards
 * coin/xp/token rewards if daily limit not reached, logs transactions.
 *
 * getEarnCenterData(userId) — returns today's earned amounts + available
 * actions with remaining daily limits.
 *
 * All functions are best-effort — failures are logged but never throw.
 */
import { db } from "./db";
import { awardXp, recordActivity } from "./gamify";

export type EarnResult = {
  awarded: boolean;
  coins: number;
  xp: number;
  tokens: number;
  reason: string;
  dailyLimitReached?: boolean;
};

export async function awardAction(userId: string, action: string): Promise<EarnResult> {
  try {
    const rule = await db.earnRule.findUnique({ where: { action } }).catch(() => null);
    if (!rule) {
      return { awarded: false, coins: 0, xp: 0, tokens: 0, reason: `Unknown action: ${action}` };
    }

    // Check daily limit
    if (rule.dailyLimit > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = await db.coinTransaction.count({
        where: {
          userId,
          reason: action,
          createdAt: { gte: todayStart },
          amount: { gt: 0 }, // only count positive (credit) transactions
        },
      }).catch(() => 0);
      if (todayCount >= rule.dailyLimit) {
        return {
          awarded: false,
          coins: 0,
          xp: 0,
          tokens: 0,
          reason: `Daily limit reached for ${action} (${todayCount}/${rule.dailyLimit})`,
          dailyLimitReached: true,
        };
      }
    }

    // Award coins
    if (rule.coinReward > 0) {
      await db.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: rule.coinReward } },
      }).catch(() => {});
      await db.coinTransaction.create({
        data: { userId, amount: rule.coinReward, reason: action },
      }).catch(() => {});
    }

    // Award tokens
    if (rule.tokenReward > 0) {
      await db.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: rule.tokenReward } },
      }).catch(() => {});
      await db.tokenTransaction.create({
        data: { userId, amount: rule.tokenReward, reason: action },
      }).catch(() => {});
    }

    // Award XP
    if (rule.xpReward > 0) {
      await awardXp(userId, rule.xpReward).catch(() => {});
    }

    // Update streak
    await recordActivity(userId, 0).catch(() => {});

    return {
      awarded: true,
      coins: rule.coinReward,
      xp: rule.xpReward,
      tokens: rule.tokenReward,
      reason: action,
    };
  } catch (e: any) {
    console.error("awardAction error:", e?.message);
    return { awarded: false, coins: 0, xp: 0, tokens: 0, reason: e?.message ?? "Failed" };
  }
}

export async function getEarnCenterData(userId: string): Promise<any> {
  try {
    const rules = await db.earnRule.findMany({
      orderBy: { action: "asc" },
    }).catch(() => []);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get today's earned totals
    const todayCoinTxns = await db.coinTransaction.findMany({
      where: { userId, createdAt: { gte: todayStart }, amount: { gt: 0 } },
      select: { amount: true, reason: true },
    }).catch(() => []);
    const todayCoinsEarned = todayCoinTxns.reduce((sum, t) => sum + t.amount, 0);

    const todayTokenTxns = await db.tokenTransaction.findMany({
      where: { userId, createdAt: { gte: todayStart }, amount: { gt: 0 } },
      select: { amount: true, reason: true },
    }).catch(() => []);
    const todayTokensEarned = todayTokenTxns.reduce((sum, t) => sum + t.amount, 0);

    // Get per-action counts today
    const actionCounts: Record<string, number> = {};
    for (const t of todayCoinTxns) {
      actionCounts[t.reason] = (actionCounts[t.reason] ?? 0) + 1;
    }

    // Build available actions list with remaining limits
    const actions = rules.map((r) => {
      const usedToday = actionCounts[r.action] ?? 0;
      const remaining = r.dailyLimit > 0 ? Math.max(0, r.dailyLimit - usedToday) : null;
      return {
        action: r.action,
        coinReward: r.coinReward,
        xpReward: r.xpReward,
        tokenReward: r.tokenReward,
        dailyLimit: r.dailyLimit,
        usedToday,
        remaining,
      };
    });

    // Get user balances
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true, tokenBalance: true, currentModel: true, freeModelRestingUntil: true, planId: true, subscriptionExpiry: true },
    }).catch(() => null);

    const isPremium = Boolean(user?.planId && (!user?.subscriptionExpiry || new Date() < user.subscriptionExpiry));

    // Check daily login status
    const todayLogin = await db.coinTransaction.findFirst({
      where: { userId, reason: "login", createdAt: { gte: todayStart } },
      select: { id: true },
    }).catch(() => null);

    // Active rentals
    const activeRentals = await db.modelRental.findMany({
      where: { userId, status: "active", expiresAt: { gt: new Date() } },
      select: { id: true, modelName: true, expiresAt: true },
      orderBy: { expiresAt: "desc" },
    }).catch(() => []);

    return {
      todayCoinsEarned,
      todayTokensEarned,
      actions,
      balances: {
        coins: user?.coinBalance ?? 0,
        tokens: user?.tokenBalance ?? 0,
        activeModel: user?.currentModel ?? "study_buddy_free",
        isPremium,
        freeModelRestingUntil: user?.freeModelRestingUntil,
      },
      dailyLoginClaimed: Boolean(todayLogin),
      activeRentals,
    };
  } catch (e: any) {
    console.error("getEarnCenterData error:", e?.message);
    return null;
  }
}
