/**
 * Seed default badges for Phase 12 gamification.
 *
 * Run with: bun run scripts/seed-badges.ts
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const BADGES = [
  { name: "First Steps", slug: "first_steps", description: "Complete your first learning path item", icon: "🌱", criteria: { type: "first_item" } },
  { name: "Quiz Rookie", slug: "quiz_rookie", description: "Complete your first quiz", icon: "🎯", criteria: { type: "first_quiz" } },
  { name: "Flashcard Fan", slug: "flashcard_fan", description: "Complete your first flashcard set", icon: "🎴", criteria: { type: "first_flashcards" } },
  { name: "Cartographer", slug: "cartographer", description: "Create your first concept map", icon: "🗺️", criteria: { type: "first_concept_map" } },
  { name: "Scholar", slug: "scholar", description: "Complete your first lesson", icon: "📚", criteria: { type: "first_lesson" } },
  { name: "Streak 3", slug: "streak_3", description: "Study 3 days in a row", icon: "🔥", criteria: { type: "streak", days: 3 } },
  { name: "Streak 7", slug: "streak_7", description: "Study 7 days in a row — a full week!", icon: "⚡", criteria: { type: "streak", days: 7 } },
  { name: "Streak 30", slug: "streak_30", description: "Study 30 days in a row — a full month!", icon: "👑", criteria: { type: "streak", days: 30 } },
  { name: "Sharp Shooter", slug: "sharp_shooter", description: "Score 100% on any quiz", icon: "🎯", criteria: { type: "perfect_quiz" } },
  { name: "Path Pioneer", slug: "path_pioneer", description: "Complete your first full learning path", icon: "🚀", criteria: { type: "first_path" } },
  { name: "XP 100", slug: "xp_100", description: "Earn 100 XP", icon: "💎", criteria: { type: "xp", amount: 100 } },
  { name: "XP 500", slug: "xp_500", description: "Earn 500 XP", icon: "💎", criteria: { type: "xp", amount: 500 } },
  { name: "XP 1000", slug: "xp_1000", description: "Earn 1000 XP", icon: "🏆", criteria: { type: "xp", amount: 1000 } },
  { name: "Daily Reviewer", slug: "daily_reviewer", description: "Complete your first daily review", icon: "☀️", criteria: { type: "first_daily_review" } },
  { name: "AI Apprentice", slug: "ai_apprentice", description: "Chat with the AI teacher 10 times", icon: "🤖", criteria: { type: "ai_chat", count: 10 } },
];

let created = 0;
let updated = 0;
for (const b of BADGES) {
  const existing = await p.badge.findUnique({ where: { slug: b.slug } });
  if (!existing) {
    await p.badge.create({ data: b });
    created++;
    console.log(`  ✓ Created: ${b.icon} ${b.name}`);
  } else {
    await p.badge.update({
      where: { id: existing.id },
      data: { name: b.name, description: b.description, icon: b.icon, criteria: b.criteria as any },
    });
    updated++;
    console.log(`  ↻ Updated: ${b.icon} ${b.name}`);
  }
}

console.log(`\n✓ Done. Created ${created}, updated ${updated}.`);
await p.$disconnect();
