/**
 * Monetization engine — token deduction, model permission, daily limits.
 */
import { db } from "./db";

/** Check if user can use their current model. Returns { allowed, reason } */
export async function checkModelPermission(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { currentModel: true, planId: true, subscriptionExpiry: true, tokenBalance: true },
  });
  if (!user) return { allowed: false, reason: "User not found" };

  const mapping = await db.modelMapping.findUnique({
    where: { modelName: user.currentModel },
  });
  if (!mapping) return { allowed: true, reason: null }; // unmapped model = free pass

  if (mapping.requiresPremium) {
    // Check if user has an active plan
    if (!user.planId) {
      return { allowed: false, reason: `🥲 You need to upgrade to use ${mapping.displayName}. Get an activation key from the Premium page!` };
    }
    if (user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
      return { allowed: false, reason: `🥲 Your subscription has expired. Upgrade to use ${mapping.displayName} again!` };
    }
  }

  if (user.tokenBalance <= 0) {
    return { allowed: false, reason: "Not enough tokens. Upgrade your plan to get more!" };
  }

  return { allowed: true, reason: null };
}

/** Deduct tokens after an AI call. Returns new balance. */
export async function deductTokens(userId: string, tokensUsed: number, model: string, feature: string) {
  const mapping = await db.modelMapping.findUnique({
    where: { modelName: model },
  });
  const multiplier = mapping?.tokenCostMultiplier ?? 1;
  const costTokens = Math.ceil(tokensUsed * multiplier);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true, tokenResetDate: true, planId: true },
  });
  if (!user) throw new Error("User not found");

  // Check if tokens need reset (monthly)
  if (user.tokenResetDate && new Date() > user.tokenResetDate) {
    const plan = user.planId ? await db.plan.findUnique({ where: { id: user.planId } }) : null;
    const newBalance = plan?.tokenLimit ?? 1000;
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    await db.user.update({
      where: { id: userId },
      data: { tokenBalance: newBalance, tokenResetDate: nextReset },
    });
  }

  // Deduct
  const newBalance = Math.max(0, user.tokenBalance - costTokens);
  await db.user.update({
    where: { id: userId },
    data: { tokenBalance: newBalance },
  });

  // Log usage
  await db.tokenUsageLog.create({
    data: { userId, model, tokensUsed, costTokens, feature },
  });

  return { newBalance, costTokens };
}

/** Check daily limit for a feature. Returns { allowed, remaining } */
export async function checkDailyLimit(userId: string, feature: "quiz" | "flashcard_gen") {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { planId: true },
  });
  if (!user) return { allowed: false, remaining: 0 };

  const plan = user.planId ? await db.plan.findUnique({ where: { id: user.planId } }) : null;
  const limit = feature === "quiz" ? (plan?.dailyQuizLimit ?? 5) : (plan?.dailyFlashcardGenLimit ?? 3);

  // Count today's usage
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const count = await db.tokenUsageLog.count({
    where: {
      userId,
      feature,
      createdAt: { gte: todayStart },
    },
  });

  return { allowed: count < limit, remaining: Math.max(0, limit - count) };
}

/** Get all available models for a user (free + their plan's models) */
export async function getAvailableModels(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { planId: true, subscriptionExpiry: true },
  });

  const hasActivePlan = user?.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry);

  const allMappings = await db.modelMapping.findMany({
    orderBy: { tokenCostMultiplier: "asc" },
  });

  return allMappings.map((m) => ({
    ...m,
    unlocked: !m.requiresPremium || hasActivePlan,
  }));
}
