/**
 * Seed Phase 14: classroom settings + classroom badges.
 *
 * Run with: bun run scripts/seed-phase14.ts
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// 1. Classroom settings
const cs = await p.classroomSettings.findFirst();
if (!cs) {
  await p.classroomSettings.create({
    data: {
      durationMinutes: 30,
      testIntervalMin: 10,
      tokenCost: 50,
      passThreshold: 0.7,
      coinReward: 10,
      xpReward: 20,
      dailyLimit: 1,
    },
  });
  console.log("✓ Created classroom settings (30min, 10min tests, 50 tokens, 70% pass, +10c/+20xp)");
} else {
  console.log("  Classroom settings already exist");
}

// 2. Classroom badges
const badges = [
  { name: "First Class", slug: "first_class", description: "Attend your first virtual class", icon: "🎓", criteria: { type: "first_class" } },
  { name: "Perfect Attendance", slug: "perfect_attendance", description: "Complete a class without skipping", icon: "✅", criteria: { type: "perfect_attendance" } },
  { name: "Oral Exam Ace", slug: "oral_exam_ace", description: "Score 90%+ on an oral exam", icon: "🗣️", criteria: { type: "oral_exam_ace" } },
  { name: "Written Exam Champion", slug: "written_exam_champion", description: "Score 90%+ on a written exam", icon: "📝", criteria: { type: "written_exam_champion" } },
  { name: "Class Scholar", slug: "class_scholar", description: "Attend 10 classes", icon: "📚", criteria: { type: "class_count", count: 10 } },
];

for (const b of badges) {
  const existing = await p.badge.findUnique({ where: { slug: b.slug } });
  if (!existing) {
    await p.badge.create({ data: b });
    console.log(`  ✓ Created badge: ${b.icon} ${b.name}`);
  } else {
    console.log(`  Badge already exists: ${b.name}`);
  }
}

// 3. Earn rules for classroom
const earnRules = [
  { action: "class_completed", coinReward: 10, xpReward: 20, tokenReward: 5, dailyLimit: 1 },
  { action: "oral_exam_passed", coinReward: 5, xpReward: 10, tokenReward: 0, dailyLimit: 3 },
  { action: "written_exam_passed", coinReward: 5, xpReward: 10, tokenReward: 0, dailyLimit: 3 },
];
for (const er of earnRules) {
  const existing = await p.earnRule.findUnique({ where: { action: er.action } });
  if (!existing) {
    await p.earnRule.create({ data: er });
    console.log(`  ✓ Created earn rule: ${er.action} (+${er.coinReward}c/+${er.xpReward}xp/+${er.tokenReward}t)`);
  } else {
    console.log(`  Earn rule already exists: ${er.action}`);
  }
}

console.log("\n✓ Phase 14 seed complete");
await p.$disconnect();
