/**
 * Test that checkAndDeductTokens actually deducts tokens
 * Run with: bun run scripts/test-deduct.ts
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const FLAT_COSTS: Record<string, number> = {
  search: 100, cards: 500, quiz: 300, tutor: 200,
  graph: 50, translate: 100, learning_path: 400,
  image_search: 10, video_search: 50,
};

const FREE_DAILY_LIMITS: Record<string, number> = {
  search: 10, cards: 3, quiz: 5, tutor: 10,
  graph: 10, translate: 10, learning_path: 1,
  image_search: 5, video_search: 3,
};

async function simulateDeduct(userId: string, feature: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, tokenBalance: true, currentModel: true, planId: true, subscriptionExpiry: true, tokenResetDate: true },
  });
  if (!user) throw new Error("User not found");
  
  console.log(`Before: tokenBalance=${user.tokenBalance}, tokenResetDate=${user.tokenResetDate}`);

  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  const mapping = await db.modelMapping.findUnique({ where: { modelName: user.currentModel } }).catch(() => null);
  const multiplier = mapping?.tokenCostMultiplier ?? 1;
  const flatCost = FLAT_COSTS[feature] ?? 100;
  const costTokens = Math.ceil(flatCost * multiplier);
  console.log(`Cost: ${costTokens} (flat=${flatCost}, multiplier=${multiplier}, premium=${isPremium})`);

  if (!user.tokenResetDate) {
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    await db.user.update({ where: { id: userId }, data: { tokenResetDate: nextReset } });
    console.log(`Set tokenResetDate to ${nextReset}`);
  }

  const newBalance = Math.max(0, (user.tokenBalance ?? 0) - costTokens);
  console.log(`New balance: ${newBalance}`);
  
  await db.user.update({ where: { id: userId }, data: { tokenBalance: newBalance } });
  await db.tokenUsageLog.create({
    data: { userId, model: user.currentModel, tokensUsed: flatCost, costTokens, feature },
  });
  console.log("✓ Deduction committed");
  
  const updated = await db.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, tokenResetDate: true } });
  console.log(`After: tokenBalance=${updated?.tokenBalance}, tokenResetDate=${updated?.tokenResetDate}`);
}

// Get a test user
const user = await db.user.findFirst({ orderBy: { createdAt: "desc" } });
if (!user) {
  console.log("No user found in DB");
  process.exit(0);
}
console.log(`Testing deduction for ${user.email} (${user.id.slice(0, 8)})`);
await simulateDeduct(user.id, "tutor");
await db.$disconnect();
