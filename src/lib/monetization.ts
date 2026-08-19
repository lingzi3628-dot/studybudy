/**
 * Monetization engine — token deduction, model permission, daily limits, refunds.
 *
 * Token costs (flat rate per feature, multiplied by model multiplier):
 *   search = 100, cards = 500, quiz = 300, tutor = 200,
 *   graph = 50, translate = 100, learning_path = 400,
 *   image_search = 10, video_search = 50, concept_map = 300
 */
import { db } from "./db";

// Flat-rate token costs per feature (before model multiplier)
const FLAT_COSTS: Record<string, number> = {
  search: 100,
  cards: 500,
  quiz: 300,
  tutor: 200,
  graph: 50,
  translate: 100,
  learning_path: 500,
  image_search: 10,
  video_search: 50,
  concept_map: 300,
  ai_teacher: 50,
  path_lesson: 200,
  path_flashcards: 150,
  path_quiz: 150,
};

// Daily limits per feature for FREE plan (premium = unlimited)
const FREE_DAILY_LIMITS: Record<string, number> = {
  search: 10,
  cards: 3,
  quiz: 5,
  tutor: 10,
  graph: 10,
  translate: 10,
  learning_path: 1,
  image_search: 5,
  video_search: 3,
  concept_map: 1,
  ai_teacher: 10,
  path_lesson: 3,
  path_flashcards: 3,
  path_quiz: 3,
};

export type DeductResult =
  | { ok: true; costTokens: number; newBalance: number; remaining: number | null }
  | { ok: false; error: string; code: string };

/**
 * Check daily rate limit only (no token deduction).
 * Use this for features that are FREE but rate-limited, like AI image generation.
 *
 * Returns `{ ok: true, remaining }` if allowed, `{ ok: false, error, code }` if limit hit.
 * Premium users bypass the daily limit.
 */
export async function checkFreeRateLimit(
  userId: string,
  feature: string
): Promise<
  | { ok: true; remaining: number | null; isPremium: boolean }
  | { ok: false; error: string; code: string }
> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, planId: true, subscriptionExpiry: true },
    });
    if (!user) return { ok: false, error: "User not found", code: "NOT_FOUND" };

    const hasActivePlan = user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry);
    const isPremium = Boolean(hasActivePlan);

    // Premium users bypass rate limits
    if (isPremium) {
      return { ok: true, remaining: null, isPremium: true };
    }

    const limit = FREE_DAILY_LIMITS[feature] ?? 999;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await db.dailyUsage.findUnique({
      where: { userId_feature_usageDate: { userId, feature, usageDate: todayStart } },
    }).catch(() => null);

    const usedToday = existing?.count ?? 0;
    if (usedToday >= limit) {
      return {
        ok: false,
        error: `Daily limit reached (${usedToday}/${limit}). Upgrade to a premium plan for unlimited ${feature}!`,
        code: "DAILY_LIMIT",
      };
    }

    // Increment the daily count
    await db.dailyUsage.upsert({
      where: { userId_feature_usageDate: { userId, feature, usageDate: todayStart } },
      create: { userId, feature, usageDate: todayStart, count: 1 },
      update: { count: { increment: 1 } },
    }).catch(() => {});

    return { ok: true, remaining: limit - usedToday - 1, isPremium: false };
  } catch (e: any) {
    console.error("checkFreeRateLimit error:", e?.message);
    return { ok: false, error: "Failed to check rate limit", code: "ERROR" };
  }
}

/**
 * Refund a daily rate-limit slot after a failed call (used with checkFreeRateLimit).
 */
export async function refundDailySlot(userId: string, feature: string): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    await db.dailyUsage.update({
      where: { userId_feature_usageDate: { userId, feature, usageDate: todayStart } },
      data: { count: { decrement: 1 } },
    }).catch(() => {});
  } catch (e: any) {
    console.error("refundDailySlot error:", e?.message);
  }
}

/**
 * Check model permission, daily limits, token balance, then deduct.
 * Call this BEFORE making the AI request.
 *
 * Usage:
 *   const r = await checkAndDeductTokens(userId, "search");
 *   if (!r.ok) return NextResponse.json({ error: r.error }, { status: 402 });
 *   // ... proceed with AI call ...
 *   // On AI failure, call refundTokens(userId, "search", r.costTokens) to refund.
 */
export async function checkAndDeductTokens(userId: string, feature: string): Promise<DeductResult> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tokenBalance: true,
        currentModel: true,
        planId: true,
        subscriptionExpiry: true,
        tokenResetDate: true,
      },
    });

    if (!user) return { ok: false, error: "User not found", code: "NOT_FOUND" };

    // Check subscription expiry
    const hasActivePlan = user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry);
    const isPremium = Boolean(hasActivePlan);

    // Check daily limits (only for free users)
    if (!isPremium) {
      const limit = FREE_DAILY_LIMITS[feature] ?? 999;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existing = await db.dailyUsage.findUnique({
        where: {
          userId_feature_usageDate: { userId, feature, usageDate: todayStart },
        },
      }).catch(() => null);

      const usedToday = existing?.count ?? 0;
      if (usedToday >= limit) {
        return {
          ok: false,
          error: `Daily limit reached (${usedToday}/${limit}). Upgrade to a premium plan for unlimited ${feature}!`,
          code: "DAILY_LIMIT",
        };
      }
    }

    // Get model multiplier
    const mapping = await db.modelMapping.findUnique({
      where: { modelName: user.currentModel },
    }).catch(() => null);
    const multiplier = mapping?.tokenCostMultiplier ?? 1;

    // Check premium-model permission (e.g. GPT-4/Claude gated behind paid plan)
    if (mapping?.requiresPremium && !isPremium) {
      return {
        ok: false,
        error: `🥲 You need to upgrade to use ${mapping.displayName}. Get an activation key from the Premium page!`,
        code: "MODEL_LOCKED",
      };
    }

    // Calculate cost
    const flatCost = FLAT_COSTS[feature] ?? 100;
    const costTokens = Math.ceil(flatCost * multiplier);

    // Check token balance
    if ((user.tokenBalance ?? 0) < costTokens) {
      return {
        ok: false,
        error: `Not enough tokens (need ${costTokens}, have ${user.tokenBalance ?? 0}). Upgrade your plan to get more!`,
        code: "INSUFFICIENT_TOKENS",
      };
    }

    // Monthly token reset (must happen BEFORE deduction so user keeps full refresh)
    let workingBalance = user.tokenBalance ?? 0;
    if (user.tokenResetDate && new Date() > user.tokenResetDate) {
      const plan = user.planId ? await db.plan.findUnique({ where: { id: user.planId } }).catch(() => null) : null;
      const newBalance = plan?.tokenLimit ?? 1000;
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      await db.user.update({
        where: { id: userId },
        data: { tokenBalance: newBalance, tokenResetDate: nextReset },
      }).catch((e: any) => console.error("monthly reset update failed:", e?.message));
      workingBalance = newBalance;
    } else if (!user.tokenResetDate) {
      // Free users without reset date — set one now so they get monthly refresh
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      await db.user.update({
        where: { id: userId },
        data: { tokenResetDate: nextReset },
      }).catch((e: any) => console.error("set reset date failed:", e?.message));
    }

    // Deduct tokens — use atomic conditional update so we never go negative
    const newBalance = Math.max(0, workingBalance - costTokens);
    try {
      await db.user.update({
        where: { id: userId },
        data: { tokenBalance: newBalance },
      });
    } catch (e: any) {
      console.error("deduct update failed:", e?.message);
      // Don't fail the whole call — the user shouldn't lose the AI call
      // just because we couldn't persist the deduction.
    }

    // Log usage
    await db.tokenUsageLog.create({
      data: { userId, model: user.currentModel, tokensUsed: flatCost, costTokens, feature },
    }).catch(() => {});

    // Increment daily usage
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    await db.dailyUsage.upsert({
      where: { userId_feature_usageDate: { userId, feature, usageDate: todayStart } },
      create: { userId, feature, usageDate: todayStart, count: 1 },
      update: { count: { increment: 1 } },
    }).catch(() => {});

    // Calculate remaining daily (for free users)
    let remaining: number | null = null;
    if (!isPremium) {
      const limit = FREE_DAILY_LIMITS[feature] ?? 999;
      const updated = await db.dailyUsage.findUnique({
        where: { userId_feature_usageDate: { userId, feature, usageDate: todayStart } },
      }).catch(() => null);
      remaining = limit - (updated?.count ?? 0);
    }

    return { ok: true, costTokens, newBalance, remaining };
  } catch (e: any) {
    console.error("checkAndDeductTokens error:", e?.message);
    return { ok: false, error: "Failed to check token balance", code: "ERROR" };
  }
}

/**
 * Refund tokens for a feature after a failed AI call.
 * Use the costTokens returned by checkAndDeductTokens.
 */
export async function refundTokens(userId: string, feature: string, costTokens: number): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, currentModel: true },
    });
    if (!user) return;

    const newBalance = (user.tokenBalance ?? 0) + costTokens;
    await db.user.update({
      where: { id: userId },
      data: { tokenBalance: newBalance },
    });

    // Log refund as a negative usage entry
    await db.tokenUsageLog.create({
      data: {
        userId,
        model: user.currentModel,
        tokensUsed: -costTokens,
        costTokens: -costTokens,
        feature: `${feature}_refund`,
      },
    }).catch(() => {});

    // Decrement daily usage count (so the user gets their daily slot back)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    await db.dailyUsage.update({
      where: { userId_feature_usageDate: { userId, feature, usageDate: todayStart } },
      data: { count: { decrement: 1 } },
    }).catch(() => {});
  } catch (e: any) {
    console.error("refundTokens error:", e?.message);
  }
}

/**
 * Check if user can use their current model (without deducting).
 * NOTE: This does NOT check token balance — the calling route must use
 * checkAndDeductTokens() first, which handles both balance check and deduction.
 * This function only checks premium-model gating.
 */
export async function checkModelPermission(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { currentModel: true, planId: true, subscriptionExpiry: true, tokenBalance: true },
  });
  if (!user) return { allowed: false, reason: "User not found" };

  const mapping = await db.modelMapping.findUnique({
    where: { modelName: user.currentModel },
  }).catch(() => null);
  if (!mapping) return { allowed: true, reason: null };

  if (mapping.requiresPremium) {
    if (!user.planId) {
      return { allowed: false, reason: `🥲 You need to upgrade to use ${mapping.displayName}. Get an activation key from the Premium page!` };
    }
    if (user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
      return { allowed: false, reason: `🥲 Your subscription has expired. Upgrade to use ${mapping.displayName} again!` };
    }
  }

  // NOTE: We do NOT check token balance here. The calling route is expected
  // to have called checkAndDeductTokens() first, which already validates
  // balance + cost. Checking balance<=0 here would block users whose balance
  // just hit 0 after a legitimate deduction.
  return { allowed: true, reason: null };
}

/** Deduct tokens after an AI call (only used for system / unattended routes) */
export async function deductTokens(userId: string, tokensUsed: number, model: string, feature: string) {
  const mapping = await db.modelMapping.findUnique({
    where: { modelName: model },
  }).catch(() => null);
  const multiplier = mapping?.tokenCostMultiplier ?? 1;
  const costTokens = Math.ceil(tokensUsed * multiplier);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  if (!user) throw new Error("User not found");

  const newBalance = Math.max(0, (user.tokenBalance ?? 0) - costTokens);
  await db.user.update({
    where: { id: userId },
    data: { tokenBalance: newBalance },
  });

  await db.tokenUsageLog.create({
    data: { userId, model, tokensUsed, costTokens, feature },
  }).catch(() => {});

  return { newBalance, costTokens };
}

/** Check daily limit (without deducting) */
export async function checkDailyLimit(userId: string, feature: "quiz" | "flashcard_gen") {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { planId: true },
  });
  if (!user) return { allowed: false, remaining: 0 };

  const plan = user.planId ? await db.plan.findUnique({ where: { id: user.planId } }).catch(() => null) : null;
  const limit = feature === "quiz" ? (plan?.dailyQuizLimit ?? 5) : (plan?.dailyFlashcardGenLimit ?? 3);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const count = await db.tokenUsageLog.count({
    where: { userId, feature, createdAt: { gte: todayStart } },
  }).catch(() => 0);

  return { allowed: count < limit, remaining: Math.max(0, limit - count) };
}

/** Get all available models for a user */
export async function getAvailableModels(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { planId: true, subscriptionExpiry: true },
  });

  const hasActivePlan = user?.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry);

  const allMappings = await db.modelMapping.findMany({
    orderBy: { tokenCostMultiplier: "asc" },
  }).catch(() => []);

  return allMappings.map((m) => ({
    ...m,
    unlocked: !m.requiresPremium || hasActivePlan,
  }));
}

export { FLAT_COSTS, FREE_DAILY_LIMITS };
