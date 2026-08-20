/**
 * Monetization engine — Phase 13: Token + Coin + Resting economy.
 *
 * FREE MODEL (study_buddy_free):
 *   - 10 requests per hour, then 30-min cooldown (resting)
 *   - Can be woken early with 5 coins
 *   - Daily limits on heavy features (search, tutor, etc.)
 *
 * TOKENS:
 *   - 50 free tokens/day for free users (auto-reset daily)
 *   - Used for AI-heavy features (tutor=50, concept_map=300, etc.)
 *   - Premium subscribers get monthly allowance (existing)
 *
 * COINS:
 *   - Earned via activities (login, complete quiz, streak, etc.)
 *   - Spent on: model rentals (30min-1day), waking free model
 *
 * XP:
 *   - Earned alongside coins; determines level
 *
 * Token costs (flat rate per feature, multiplied by model multiplier):
 *   search = 100, cards = 500, quiz = 300, tutor = 200,
 *   graph = 50, translate = 100, learning_path = 500,
 *   image_search = 10, video_search = 50, concept_map = 300,
 *   ai_teacher = 50, path_lesson = 200, path_flashcards = 150,
 *   path_quiz = 150, whiteboard_solver = 100, cover_image = 10,
 *   voice_transcribe = 50, tts = 50
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
  // Phase 12b
  whiteboard_solver: 100,
  cover_image: 10,
  voice_transcribe: 50,
  tts: 50,
  // Phase 14
  classroom: 50,
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
  // Phase 12b
  whiteboard_solver: 5,
  cover_image: 5,
  voice_transcribe: 0,
  tts: 0,
  // Phase 14
  classroom: 1,
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
        coinBalance: true,
        freeModelRestingUntil: true,
      },
    });

    if (!user) return { ok: false, error: "User not found", code: "NOT_FOUND" };

    // Phase 13: Check if free model is resting (only for free users using free model)
    const hasActivePlan = user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry);
    const isPremium = Boolean(hasActivePlan);
    const isFreeModel = user.currentModel === "study_buddy_free";

    // Check active rental — if user has rented a premium model, use that instead
    let effectiveModel = user.currentModel;
    if (!isPremium && isFreeModel) {
      const activeRental = await db.modelRental.findFirst({
        where: {
          userId, status: "active",
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: "desc" },
      }).catch(() => null);
      if (activeRental) {
        effectiveModel = activeRental.modelName;
      }
    }

    const isUsingFreeModel = effectiveModel === "study_buddy_free";

    // If using free model AND it's resting, block the request
    if (isUsingFreeModel && user.freeModelRestingUntil && new Date() < user.freeModelRestingUntil) {
      const remainingMs = user.freeModelRestingUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return {
        ok: false,
        error: `🥱 Study Buddy Free is resting. Try again in ${remainingMin} minute${remainingMin === 1 ? "" : "s"}, or spend 5 coins to wake it now, or rent a premium buddy.`,
        code: "MODEL_RESTING",
      };
    }

    // Phase 13: Daily token reset (every 24h, gives 50 free tokens to free users)
    let workingBalance = user.tokenBalance ?? 0;
    if (!isPremium && user.tokenResetDate && new Date() > user.tokenResetDate) {
      // Free users get 50 tokens daily (not 1000 monthly)
      const newBalance = 50;
      const nextReset = new Date();
      nextReset.setDate(nextReset.getDate() + 1); // +1 day
      await db.user.update({
        where: { id: userId },
        data: { tokenBalance: newBalance, tokenResetDate: nextReset },
      }).catch((e: any) => console.error("daily reset failed:", e?.message));
      // Log token transaction
      await db.tokenTransaction.create({
        data: { userId, amount: newBalance - workingBalance, reason: "daily_reset" },
      }).catch(() => {});
      workingBalance = newBalance;
    } else if (isPremium && user.tokenResetDate && new Date() > user.tokenResetDate) {
      // Premium users: monthly reset with plan allowance
      const plan = user.planId ? await db.plan.findUnique({ where: { id: user.planId } }).catch(() => null) : null;
      const newBalance = plan?.tokenLimit ?? 1000;
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      await db.user.update({
        where: { id: userId },
        data: { tokenBalance: newBalance, tokenResetDate: nextReset },
      }).catch((e: any) => console.error("monthly reset failed:", e?.message));
      await db.tokenTransaction.create({
        data: { userId, amount: newBalance - workingBalance, reason: "monthly_reset" },
      }).catch(() => {});
      workingBalance = newBalance;
    } else if (!user.tokenResetDate) {
      // Set initial reset date if missing
      const nextReset = new Date();
      nextReset.setDate(nextReset.getDate() + 1);
      await db.user.update({
        where: { id: userId },
        data: { tokenResetDate: nextReset },
      }).catch(() => {});
    }

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
      where: { modelName: effectiveModel },
    }).catch(() => null);
    const multiplier = mapping?.tokenCostMultiplier ?? 1;

    // Check premium-model permission
    if (mapping?.requiresPremium && !isPremium && !isUsingFreeModel) {
      // User has effective model that requires premium — check if via rental
      const activeRental = await db.modelRental.findFirst({
        where: { userId, modelName: effectiveModel, status: "active", expiresAt: { gt: new Date() } },
      }).catch(() => null);
      if (!activeRental) {
        return {
          ok: false,
          error: `🥲 You need to upgrade to use ${mapping.displayName}. Rent it with coins or get an activation key!`,
          code: "MODEL_LOCKED",
        };
      }
    }

    // Phase 13: Look up token cost from FeatureTokenCost table (admin-configurable)
    // Falls back to FLAT_COSTS hardcoded values if not found
    let flatCost = FLAT_COSTS[feature] ?? 100;
    try {
      const ftc = await db.featureTokenCost.findUnique({ where: { featureName: feature } });
      if (ftc) flatCost = ftc.tokenCost;
    } catch {}

    const costTokens = Math.ceil(flatCost * multiplier);

    // Phase 13: Premium users may have reduced/waived costs (handled by plan features)
    let effectiveCost = costTokens;
    if (isPremium && user.planId) {
      const plan = await db.plan.findUnique({ where: { id: user.planId }, select: { features: true } }).catch(() => null);
      const planFeatures = (plan?.features as any) ?? {};
      // Plans can specify 'tokenDiscount' (e.g., 0.5 = 50% off) or 'freeFeatures' array
      if (typeof planFeatures.tokenDiscount === "number") {
        effectiveCost = Math.ceil(costTokens * planFeatures.tokenDiscount);
      }
      if (Array.isArray(planFeatures.freeFeatures) && planFeatures.freeFeatures.includes(feature)) {
        effectiveCost = 0;
      }
    }

    // Check token balance (only if cost > 0)
    if (effectiveCost > 0 && workingBalance < effectiveCost) {
      return {
        ok: false,
        error: `Not enough tokens (need ${effectiveCost}, have ${workingBalance}). Earn more by completing activities, or upgrade your plan!`,
        code: "INSUFFICIENT_TOKENS",
      };
    }

    // Phase 13: Track hourly usage for free model — if exceeded, set resting
    if (isUsingFreeModel) {
      const hourStart = new Date();
      hourStart.setHours(hourStart.getHours(), Math.floor(hourStart.getMinutes() / 60) * 60, 0, 0);
      // Count requests in the last hour
      let settings: any = await db.restingSettings.findFirst().catch(() => null);
      if (!settings) settings = { freeRequestsPerHour: 10, cooldownMinutes: 30, wakeCostCoins: 5 };
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const hourCount = await db.tokenUsageLog.count({
        where: { userId, createdAt: { gte: hourAgo } },
      }).catch(() => 0);
      if (hourCount >= settings.freeRequestsPerHour) {
        // Trigger resting — set freeModelRestingUntil to now + cooldown
        const restingUntil = new Date(Date.now() + settings.cooldownMinutes * 60 * 1000);
        await db.user.update({
          where: { id: userId },
          data: { freeModelRestingUntil: restingUntil },
        }).catch(() => {});
        return {
          ok: false,
          error: `🥱 You've used Study Buddy Free ${hourCount} times this hour. It's now resting for ${settings.cooldownMinutes} minutes. Spend ${settings.wakeCostCoins} coins to wake it instantly, or rent a premium buddy.`,
          code: "MODEL_RESTING",
        };
      }
    }

    // Deduct tokens
    const newBalance = Math.max(0, workingBalance - effectiveCost);
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

    // Log token transaction
    if (effectiveCost > 0) {
      await db.tokenTransaction.create({
        data: { userId, amount: -effectiveCost, reason: feature },
      }).catch(() => {});
    }

    // Log usage
    await db.tokenUsageLog.create({
      data: { userId, model: effectiveModel, tokensUsed: flatCost, costTokens: effectiveCost, feature },
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

    return { ok: true, costTokens: effectiveCost, newBalance, remaining };
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
