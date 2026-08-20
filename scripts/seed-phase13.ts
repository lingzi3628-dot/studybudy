/**
 * Seed Phase 13 defaults: resting settings, feature token costs,
 * model rental prices, earn rules.
 *
 * Run with: bun run scripts/seed-phase13.ts
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// 1. Resting settings
const rs = await p.restingSettings.findUnique({ where: { id: 1 } });
if (!rs) {
  await p.restingSettings.create({
    data: { id: 1, freeRequestsPerHour: 10, cooldownMinutes: 30, wakeCostCoins: 5 },
  });
  console.log("✓ Created resting settings (10 req/hr, 30-min cooldown, 5-coin wake)");
} else {
  console.log("  Resting settings already exist");
}

// 2. Feature token costs
const featureCosts = [
  { featureName: "ai_tutor", tokenCost: 50 },
  { featureName: "concept_map", tokenCost: 300 },
  { featureName: "flashcards", tokenCost: 150 },
  { featureName: "quiz", tokenCost: 150 },
  { featureName: "solver", tokenCost: 100 },
  { featureName: "voice_transcribe", tokenCost: 50 },
  { featureName: "voice_tts", tokenCost: 50 },
  { featureName: "cover_image", tokenCost: 10 },
  { featureName: "search", tokenCost: 100 },
  { featureName: "learning_path", tokenCost: 500 },
];
for (const fc of featureCosts) {
  const existing = await p.featureTokenCost.findUnique({ where: { featureName: fc.featureName } });
  if (!existing) {
    await p.featureTokenCost.create({ data: fc });
    console.log(`  ✓ Created feature cost: ${fc.featureName} = ${fc.tokenCost} tokens`);
  } else {
    await p.featureTokenCost.update({ where: { id: existing.id }, data: { tokenCost: fc.tokenCost } });
    console.log(`  ↻ Updated feature cost: ${fc.featureName} = ${fc.tokenCost}`);
  }
}

// 3. Model rental prices (coins)
const models = [
  { slug: "plus", modelName: "study_buddy_plus" },
  { slug: "pro", modelName: "study_buddy_pro" },
  { slug: "king", modelName: "study_buddy_king" },
  { slug: "ultra", modelName: "study_buddy_ultra" },
  { slug: "teddy", modelName: "study_buddy_teddy" },
  { slug: "photo", modelName: "study_buddy_photo" },
];
const durations = [
  { minutes: 30, baseCost: 20 },
  { minutes: 60, baseCost: 35 },
  { minutes: 360, baseCost: 150 },
  { minutes: 1440, baseCost: 400 },
];
for (const m of models) {
  for (const d of durations) {
    // Higher-tier models cost more
    const tierMultiplier = { plus: 1, pro: 1.5, king: 2, ultra: 3, teddy: 5, photo: 1.2 }[m.slug] ?? 1;
    const cost = Math.round(d.baseCost * tierMultiplier);
    const existing = await p.modelRentalPrice.findUnique({
      where: { modelName_durationMinutes: { modelName: m.modelName, durationMinutes: d.minutes } },
    });
    if (!existing) {
      await p.modelRentalPrice.create({
        data: { modelName: m.modelName, durationMinutes: d.minutes, coinCost: cost },
      });
    }
  }
}
console.log(`  ✓ Seeded ${models.length * durations.length} rental price rows`);

// 4. Earn rules
const earnRules = [
  { action: "login", coinReward: 5, xpReward: 5, tokenReward: 0, dailyLimit: 1 },
  { action: "complete_lesson", coinReward: 3, xpReward: 30, tokenReward: 0, dailyLimit: 5 },
  { action: "complete_quiz", coinReward: 5, xpReward: 50, tokenReward: 5, dailyLimit: 5 },
  { action: "complete_flashcards", coinReward: 3, xpReward: 40, tokenReward: 0, dailyLimit: 5 },
  { action: "complete_concept_map", coinReward: 10, xpReward: 60, tokenReward: 10, dailyLimit: 3 },
  { action: "complete_daily_review", coinReward: 5, xpReward: 30, tokenReward: 5, dailyLimit: 1 },
  { action: "focus_25min", coinReward: 2, xpReward: 10, tokenReward: 0, dailyLimit: 4 },
  { action: "note_created", coinReward: 1, xpReward: 5, tokenReward: 0, dailyLimit: 10 },
  { action: "streak_3", coinReward: 20, xpReward: 0, tokenReward: 20, dailyLimit: 0 },
  { action: "streak_7", coinReward: 50, xpReward: 0, tokenReward: 50, dailyLimit: 0 },
  { action: "streak_30", coinReward: 200, xpReward: 0, tokenReward: 200, dailyLimit: 0 },
  { action: "badge_earned", coinReward: 10, xpReward: 0, tokenReward: 10, dailyLimit: 0 },
  { action: "path_completed", coinReward: 100, xpReward: 0, tokenReward: 50, dailyLimit: 0 },
  { action: "ai_teacher_chat", coinReward: 0, xpReward: 0, tokenReward: 0, dailyLimit: 10 },
  { action: "group_joined", coinReward: 5, xpReward: 0, tokenReward: 0, dailyLimit: 1 },
];
for (const er of earnRules) {
  const existing = await p.earnRule.findUnique({ where: { action: er.action } });
  if (!existing) {
    await p.earnRule.create({ data: er });
    console.log(`  ✓ Created earn rule: ${er.action} (+${er.coinReward}c/+${er.xpReward}xp/+${er.tokenReward}t)`);
  } else {
    await p.earnRule.update({ where: { id: existing.id }, data: er });
    console.log(`  ↻ Updated earn rule: ${er.action}`);
  }
}

console.log("\n✓ Phase 13 seed complete");
await p.$disconnect();
