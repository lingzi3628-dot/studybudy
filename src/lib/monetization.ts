/**
 * Monetization engine — Phase 21: Daily-friendly token + coin economy.
 *
 * DESIGN GOALS:
 *   - Free users should never hit a "you can't use this today" wall
 *     unexpectedly. The system should let them use each feature many
 *     times per day before asking them to upgrade.
 *   - Tokens refresh daily (500/day for free users) so users can plan
 *     their study without worrying about running out forever.
 *   - Coins reset to a floor of 50 each day (never 0 — they always have
 *     something to spend on model rentals or wake-ups).
 *   - The punishing "free model is resting for 30 minutes" cooldown is
 *     REMOVED entirely. Users can use the free model continuously.
 *
 * TOKENS (free users):
 *   - 500 free tokens/day (auto-reset daily at midnight local)
 *   - Used for AI features — costs are now 5-30 tokens per call
 *   - Unused tokens do NOT roll over (capped at 500 on reset)
 *
 * TOKENS (premium users):
 *   - Monthly allowance from Plan.tokenLimit (default 5000)
 *   - Unused tokens DO roll over (no daily reset for premium)
 *
 * COINS:
 *   - Earned via activities (login, complete quiz, streak, etc.)
 *   - Spent on: model rentals, waking free model (kept for compat)
 *   - DAILY FLOOR: if coinBalance < 50 at midnight, reset to 50
 *
 * XP:
 *   - Earned alongside coins; determines level
 *
 * NEW cost table (per-feature flat cost, before model multiplier):
 *   search = 5, cards = 30, quiz = 20, tutor = 15,
 *   graph = 5, translate = 10, learning_path = 30,
 *   image_search = 2, video_search = 5, concept_map = 25,
 *   ai_teacher = 10, path_lesson = 15, path_flashcards = 10,
 *   path_quiz = 10, whiteboard_solver = 10, cover_image = 2,
 *   voice_transcribe = 10, tts = 10, classroom = 10
 *
 * NEW free daily caps (per-feature, only for non-premium):
 *   Generous — most features allow 20-50 calls/day before being asked
 *   to slow down. Premium users bypass all caps.
 */
import { db } from "./db";

// ---------------------------------------------------------------------
// Phase 21b — Family Mode: child token billing redirection
// ---------------------------------------------------------------------

/**
 * Cache of childUserId → parentUserId lookups (per request lifecycle).
 * This avoids a DB round-trip on every monetization call for a child.
 *
 * Map is per-process; on serverless cold starts it's empty, which is fine
 * because the first call will populate it.
 */
const childParentCache = new Map<string, string>();

/**
 * If the given userId belongs to a FamilyChild, returns the parent's userId
 * (so tokens are billed to the parent). Otherwise returns the same userId.
 *
 * This is the core of "parent pays for everything" — children never see
 * their own token balance because they don't have one to speak of; all
 * AI usage is billed to the parent.
 */
async function resolveBillingUserId(userId: string): Promise<string> {
  // Check cache first
  const cached = childParentCache.get(userId);
  if (cached) return cached;

  try {
    const child = await db.familyChild.findUnique({
      where: { userId },
      select: { parentUserId: true },
    });
    if (child) {
      childParentCache.set(userId, child.parentUserId);
      return child.parentUserId;
    }
  } catch {
    // Family tables might not exist yet — treat as a normal user.
  }
  // Not a child — return as-is
  childParentCache.set(userId, userId);
  return userId;
}

// ---------------------------------------------------------------------
// Phase 21 — new daily-friendly cost table
// ---------------------------------------------------------------------

const FLAT_COSTS: Record<string, number> = {
  // Cheap AI calls (lightweight, frequently used)
  search: 5,
  graph: 5,
  image_search: 2,
  video_search: 5,
  cover_image: 2,
  // Mid-tier
  translate: 10,
  ai_teacher: 10,
  whiteboard_solver: 10,
  voice_transcribe: 10,
  tts: 10,
  classroom: 10,
  // Heavier generation
  tutor: 15,
  path_lesson: 15,
  path_flashcards: 10,
  path_quiz: 10,
  // Heaviest generation (multi-step AI pipelines)
  quiz: 20,
  concept_map: 25,
  cards: 30,
  learning_path: 30,
};

// Per-feature daily caps for FREE users (premium = unlimited).
// These are intentionally generous — a free user can use the AI tutor
// 30 times per day before being asked to upgrade.
const FREE_DAILY_LIMITS: Record<string, number> = {
  search: 50,
  cards: 10,
  quiz: 20,
  tutor: 30,
  graph: 50,
  translate: 30,
  learning_path: 5,
  image_search: 30,
  video_search: 20,
  concept_map: 5,
  ai_teacher: 30,
  path_lesson: 15,
  path_flashcards: 15,
  path_quiz: 15,
  whiteboard_solver: 20,
  cover_image: 30,
  voice_transcribe: 10,
  tts: 10,
  classroom: 10,
};

// ---------------------------------------------------------------------
// Daily refill constants
// ---------------------------------------------------------------------

const FREE_DAILY_TOKEN_ALLOWANCE = 500;
const PREMIUM_DEFAULT_MONTHLY_ALLOWANCE = 5000;
const DAILY_COIN_FLOOR = 50; // coins reset to this if below

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export type DeductResult =
  | { ok: true; costTokens: number; newBalance: number; remaining: number | null }
  | { ok: false; error: string; code: string };

// ---------------------------------------------------------------------
// Internal: daily reset helpers
// ---------------------------------------------------------------------

/**
 * Returns true if it's time to reset the user's daily tokens.
 * For free users: reset when now > tokenResetDate (which is set to next midnight).
 * For premium users: tokenResetDate represents the monthly allowance reset.
 */
function isTimeForDailyReset(tokenResetDate: Date | null, isPremium: boolean): boolean {
  if (!tokenResetDate) return true;
  return new Date() > tokenResetDate;
}

/**
 * Compute the next reset date.
 * For free users: next midnight (local time).
 * For premium users: +1 month from now.
 */
function nextResetDate(isPremium: boolean): Date {
  const next = new Date();
  if (isPremium) {
    next.setMonth(next.getMonth() + 1);
  } else {
    // Next midnight local
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  return next;
}

/**
 * Apply daily token reset (and coin floor) if it's time.
 * Mutates the user row in the DB. Returns the new working balance.
 *
 * Exported so /api/auth/me can call this on every page load — that way
 * old accounts (created before Phase 21) get the new generous 500-token
 * allowance immediately on their next visit, without having to wait for
 * their first AI call to trigger the lazy reset.
 */
export async function applyDailyResetIfNeeded(
  userId: string,
  user: {
    tokenBalance: number;
    coinBalance: number;
    tokenResetDate: Date | null;
    planId: string | null;
    subscriptionExpiry: Date | null;
  }
): Promise<{ tokenBalance: number; coinBalance: number; tokenResetDate: Date; isPremium: boolean }> {
  const isPremium = Boolean(
    user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)
  );

  // Initialize reset date if missing
  if (!user.tokenResetDate) {
    const next = nextResetDate(isPremium);
    await db.user.update({
      where: { id: userId },
      data: { tokenResetDate: next },
    }).catch(() => {});
    return {
      tokenBalance: user.tokenBalance,
      coinBalance: user.coinBalance,
      tokenResetDate: next,
      isPremium,
    };
  }

  if (!isTimeForDailyReset(user.tokenResetDate, isPremium)) {
    return {
      tokenBalance: user.tokenBalance,
      coinBalance: user.coinBalance,
      tokenResetDate: user.tokenResetDate,
      isPremium,
    };
  }

  // Time to reset
  const next = nextResetDate(isPremium);

  if (isPremium) {
    // Monthly reset: top up to plan's monthly allowance (doesn't roll over)
    const plan = user.planId
      ? await db.plan.findUnique({ where: { id: user.planId }, select: { tokenLimit: true } }).catch(() => null)
      : null;
    const newBalance = plan?.tokenLimit ?? PREMIUM_DEFAULT_MONTHLY_ALLOWANCE;
    await db.user.update({
      where: { id: userId },
      data: { tokenBalance: newBalance, tokenResetDate: next },
    }).catch(() => {});
    await db.tokenTransaction.create({
      data: { userId, amount: newBalance - user.tokenBalance, reason: "monthly_reset" },
    }).catch(() => {});
    return { tokenBalance: newBalance, coinBalance: user.coinBalance, tokenResetDate: next, isPremium };
  }

  // Free user — daily reset
  // Tokens: refill to FREE_DAILY_TOKEN_ALLOWANCE (don't roll over)
  // Coins: if balance < floor, bump to floor (don't take away earned coins)
  const newTokenBalance = FREE_DAILY_TOKEN_ALLOWANCE;
  const newCoinBalance = Math.max(user.coinBalance, DAILY_COIN_FLOOR);
  const patch: any = { tokenBalance: newTokenBalance, tokenResetDate: next };
  if (newCoinBalance > user.coinBalance) {
    patch.coinBalance = newCoinBalance;
  }
  await db.user.update({ where: { id: userId }, data: patch }).catch(() => {});
  await db.tokenTransaction.create({
    data: { userId, amount: newTokenBalance - user.tokenBalance, reason: "daily_reset" },
  }).catch(() => {});
  if (newCoinBalance > user.coinBalance) {
    await db.coinTransaction.create({
      data: { userId, amount: newCoinBalance - user.coinBalance, reason: "daily_floor" },
    }).catch(() => {});
  }
  return { tokenBalance: newTokenBalance, coinBalance: newCoinBalance, tokenResetDate: next, isPremium };
}

// ---------------------------------------------------------------------
// Public: check daily rate limit only (no token deduction)
// ---------------------------------------------------------------------

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
    // Phase 21b — if this is a family child, bill + check against the PARENT
    const billingUserId = await resolveBillingUserId(userId);

    const user = await db.user.findUnique({
      where: { id: billingUserId },
      select: { id: true, planId: true, subscriptionExpiry: true },
    });
    if (!user) return { ok: false, error: "User not found", code: "NOT_FOUND" };

    const hasActivePlan = user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry);
    const isPremium = Boolean(hasActivePlan);

    if (isPremium) {
      return { ok: true, remaining: null, isPremium: true };
    }

    const limit = FREE_DAILY_LIMITS[feature] ?? 999;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Use the billing user's daily-usage counter (parent's, if child)
    const existing = await db.dailyUsage.findUnique({
      where: { userId_feature_usageDate: { userId: billingUserId, feature, usageDate: todayStart } },
    }).catch(() => null);

    const usedToday = existing?.count ?? 0;
    if (usedToday >= limit) {
      return {
        ok: false,
        error: `You've used ${feature} ${usedToday} times today (daily cap: ${limit}). Come back tomorrow, or upgrade to Premium for unlimited use.`,
        code: "DAILY_LIMIT",
      };
    }

    await db.dailyUsage.upsert({
      where: { userId_feature_usageDate: { userId: billingUserId, feature, usageDate: todayStart } },
      create: { userId: billingUserId, feature, usageDate: todayStart, count: 1 },
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
    const billingUserId = await resolveBillingUserId(userId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    await db.dailyUsage.update({
      where: { userId_feature_usageDate: { userId: billingUserId, feature, usageDate: todayStart } },
      data: { count: { decrement: 1 } },
    }).catch(() => {});
  } catch (e: any) {
    console.error("refundDailySlot error:", e?.message);
  }
}

// ---------------------------------------------------------------------
// Public: main check + deduct
// ---------------------------------------------------------------------

/**
 * Check model permission, daily caps, token balance, then deduct.
 * Call this BEFORE making the AI request.
 *
 * Usage:
 *   const r = await checkAndDeductTokens(userId, "search");
 *   if (!r.ok) return NextResponse.json({ error: r.error }, { status: 402 });
 *   // ... proceed with AI call ...
 *   // On AI failure, call refundTokens(userId, "search", r.costTokens) to refund.
 *
 * Phase 21 changes:
 *   - The 30-min free-model "resting" cooldown is REMOVED.
 *   - Daily refill is 500 tokens (was 50).
 *   - Costs are 5-30 tokens per call (was 100-500).
 *   - Per-feature daily caps are 10-50 (was 1-10).
 *   - Coin floor: coins never go below 50 on daily reset.
 */
export async function checkAndDeductTokens(userId: string, feature: string): Promise<DeductResult> {
  try {
    // Phase 21b — if this is a family child, bill the PARENT (not the child).
    // Children never see their own token balance; all usage is billed to the
    // parent who registered the family.
    const billingUserId = await resolveBillingUserId(userId);

    const user = await db.user.findUnique({
      where: { id: billingUserId },
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

    // Apply daily reset if it's time (mutates user row + writes ledgers)
    const reset = await applyDailyResetIfNeeded(billingUserId, user);
    let workingBalance = reset.tokenBalance;
    const isPremium = reset.isPremium;

    // Clear any stale resting state (the resting feature is removed in Phase 21,
    // but old rows may still have a future freeModelRestingUntil — clear it on
    // every call so users aren't blocked by legacy state)
    if (user.freeModelRestingUntil && new Date() < user.freeModelRestingUntil) {
      await db.user.update({
        where: { id: billingUserId },
        data: { freeModelRestingUntil: null },
      }).catch(() => {});
    }

    // Active rental — if free + using free model, check for an active rental
    let effectiveModel = user.currentModel;
    if (!isPremium && effectiveModel === "study_buddy_free") {
      const activeRental = await db.modelRental.findFirst({
        where: { userId: billingUserId, status: "active", expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "desc" },
      }).catch(() => null);
      if (activeRental) {
        effectiveModel = activeRental.modelName;
      }
    }

    // Per-feature daily cap (free users only)
    if (!isPremium) {
      const limit = FREE_DAILY_LIMITS[feature] ?? 999;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const existing = await db.dailyUsage.findUnique({
        where: { userId_feature_usageDate: { userId: billingUserId, feature, usageDate: todayStart } },
      }).catch(() => null);
      const usedToday = existing?.count ?? 0;
      if (usedToday >= limit) {
        return {
          ok: false,
          error: `You've used ${feature} ${usedToday} times today (cap: ${limit}). Come back tomorrow, or upgrade to Premium for unlimited use.`,
          code: "DAILY_LIMIT",
        };
      }
    }

    // Model multiplier
    const mapping = await db.modelMapping.findUnique({
      where: { modelName: effectiveModel },
    }).catch(() => null);
    const multiplier = mapping?.tokenCostMultiplier ?? 1;

    // Premium-model permission check
    // OVERRIDE: when UNLOCK_ALL_MODELS=true env var is set, all models are
    // unlocked for all users (used for testing/comparison/beta phases).
    // The check is bypassed entirely — no premium/rental requirement.
    const unlockAll = process.env.UNLOCK_ALL_MODELS === "true";
    if (!unlockAll && mapping?.requiresPremium && !isPremium && effectiveModel !== "study_buddy_free") {
      const activeRental = await db.modelRental.findFirst({
        where: { userId: billingUserId, modelName: effectiveModel, status: "active", expiresAt: { gt: new Date() } },
      }).catch(() => null);
      if (!activeRental) {
        return {
          ok: false,
          error: `🥲 You need to upgrade to use ${mapping.displayName}. Rent it with coins or get an activation key!`,
          code: "MODEL_LOCKED",
        };
      }
    }

    // Cost lookup — admin FeatureTokenCost overrides FLAT_COSTS
    let flatCost = FLAT_COSTS[feature] ?? 10;
    try {
      const ftc = await db.featureTokenCost.findUnique({ where: { featureName: feature } });
      if (ftc) flatCost = ftc.tokenCost;
    } catch {}

    const costTokens = Math.ceil(flatCost * multiplier);

    // Premium plan cost discounts
    let effectiveCost = costTokens;
    if (isPremium && user.planId) {
      const plan = await db.plan.findUnique({ where: { id: user.planId }, select: { features: true } }).catch(() => null);
      const planFeatures = (plan?.features as any) ?? {};
      if (typeof planFeatures.tokenDiscount === "number") {
        effectiveCost = Math.ceil(costTokens * planFeatures.tokenDiscount);
      }
      if (Array.isArray(planFeatures.freeFeatures) && planFeatures.freeFeatures.includes(feature)) {
        effectiveCost = 0;
      }
    }

    // Insufficient tokens
    if (effectiveCost > 0 && workingBalance < effectiveCost) {
      return {
        ok: false,
        error: `Not enough tokens (need ${effectiveCost}, have ${workingBalance}). Your tokens refill to ${FREE_DAILY_TOKEN_ALLOWANCE} tomorrow — or you can exchange coins for tokens in the Earn Center.`,
        code: "INSUFFICIENT_TOKENS",
      };
    }

    // Deduct
    const newBalance = Math.max(0, workingBalance - effectiveCost);
    try {
      await db.user.update({
        where: { id: billingUserId },
        data: { tokenBalance: newBalance },
      });
    } catch (e: any) {
      console.error("deduct update failed:", e?.message);
      // Don't fail the whole call — let the user keep their AI response.
    }

    // Ledger entries (best-effort) — log against the billing user (parent)
    if (effectiveCost > 0) {
      await db.tokenTransaction.create({
        data: { userId: billingUserId, amount: -effectiveCost, reason: feature },
      }).catch(() => {});
    }
    await db.tokenUsageLog.create({
      data: { userId: billingUserId, model: effectiveModel, tokensUsed: flatCost, costTokens: effectiveCost, feature },
    }).catch(() => {});

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    await db.dailyUsage.upsert({
      where: { userId_feature_usageDate: { userId: billingUserId, feature, usageDate: todayStart } },
      create: { userId: billingUserId, feature, usageDate: todayStart, count: 1 },
      update: { count: { increment: 1 } },
    }).catch(() => {});

    // Remaining for today (null = unlimited for premium)
    let remaining: number | null = null;
    if (!isPremium) {
      const limit = FREE_DAILY_LIMITS[feature] ?? 999;
      const updated = await db.dailyUsage.findUnique({
        where: { userId_feature_usageDate: { userId: billingUserId, feature, usageDate: todayStart } },
      }).catch(() => null);
      remaining = limit - (updated?.count ?? 0);
    }

    return { ok: true, costTokens: effectiveCost, newBalance, remaining };
  } catch (e: any) {
    console.error("checkAndDeductTokens error:", e?.message);
    return { ok: false, error: "Failed to check token balance", code: "ERROR" };
  }
}

// ---------------------------------------------------------------------
// Public: refund
// ---------------------------------------------------------------------

/**
 * Refund tokens for a feature after a failed AI call.
 * Use the costTokens returned by checkAndDeductTokens.
 *
 * Phase 21b — if the original call was for a child, this refunds the PARENT
 * (since that's where the tokens were deducted from).
 */
export async function refundTokens(userId: string, feature: string, costTokens: number): Promise<void> {
  try {
    const billingUserId = await resolveBillingUserId(userId);

    const user = await db.user.findUnique({
      where: { id: billingUserId },
      select: { tokenBalance: true, currentModel: true },
    });
    if (!user) return;

    const newBalance = (user.tokenBalance ?? 0) + costTokens;
    await db.user.update({
      where: { id: billingUserId },
      data: { tokenBalance: newBalance },
    });

    await db.tokenUsageLog.create({
      data: {
        userId: billingUserId,
        model: user.currentModel,
        tokensUsed: -costTokens,
        costTokens: -costTokens,
        feature: `${feature}_refund`,
      },
    }).catch(() => {});

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    await db.dailyUsage.update({
      where: { userId_feature_usageDate: { userId: billingUserId, feature, usageDate: todayStart } },
      data: { count: { decrement: 1 } },
    }).catch(() => {});
  } catch (e: any) {
    console.error("refundTokens error:", e?.message);
  }
}

// ---------------------------------------------------------------------
// Public: misc helpers (kept for backwards compat)
// ---------------------------------------------------------------------

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
    // OVERRIDE: when UNLOCK_ALL_MODELS=true, all premium models are unlocked.
    const unlockAll = process.env.UNLOCK_ALL_MODELS === "true";
    if (unlockAll) {
      return { allowed: true, reason: null };
    }
    if (!user.planId) {
      return { allowed: false, reason: `🥲 You need to upgrade to use ${mapping.displayName}. Get an activation key from the Premium page!` };
    }
    if (user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
      return { allowed: false, reason: `🥲 Your subscription has expired. Upgrade to use ${mapping.displayName} again!` };
    }
  }

  return { allowed: true, reason: null };
}

/** Deduct tokens after an AI call (only used for system / unattended routes) */
export async function deductTokens(userId: string, tokensUsed: number, model: string, feature: string) {
  // Phase 21b — bill parent if this is a child
  const billingUserId = await resolveBillingUserId(userId);

  const mapping = await db.modelMapping.findUnique({
    where: { modelName: model },
  }).catch(() => null);
  const multiplier = mapping?.tokenCostMultiplier ?? 1;
  const costTokens = Math.ceil(tokensUsed * multiplier);

  const user = await db.user.findUnique({
    where: { id: billingUserId },
    select: { tokenBalance: true },
  });
  if (!user) throw new Error("User not found");

  const newBalance = Math.max(0, (user.tokenBalance ?? 0) - costTokens);
  await db.user.update({
    where: { id: billingUserId },
    data: { tokenBalance: newBalance },
  });

  await db.tokenUsageLog.create({
    data: { userId: billingUserId, model, tokensUsed, costTokens, feature },
  }).catch(() => {});

  return { newBalance, costTokens };
}

/** Check daily limit (without deducting) — legacy helper kept for compat */
export async function checkDailyLimit(userId: string, feature: "quiz" | "flashcard_gen") {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { planId: true },
  });
  if (!user) return { allowed: false, remaining: 0 };

  const plan = user.planId ? await db.plan.findUnique({ where: { id: user.planId } }).catch(() => null) : null;
  const limit = feature === "quiz" ? (plan?.dailyQuizLimit ?? 20) : (plan?.dailyFlashcardGenLimit ?? 10);

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

// ---------------------------------------------------------------------
// Public: constants exposed for UI / testing
// ---------------------------------------------------------------------

export {
  FLAT_COSTS,
  FREE_DAILY_LIMITS,
  FREE_DAILY_TOKEN_ALLOWANCE,
  DAILY_COIN_FLOOR,
};
