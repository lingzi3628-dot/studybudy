/**
 * Phase 12 — Gamification helper.
 *
 * awardXp(userId, amount)        — adds XP, updates level, returns new XP/level
 * updateStreak(userId)           — bumps streakDays if last activity was yesterday, resets if older
 * checkAndAwardBadges(userId)    — checks all badge criteria, awards missing badges
 * recordActivity(userId)         — updates streak + lastActivityDate (call after any user action)
 *
 * All functions are best-effort — failures are logged but never throw.
 */
import { db } from "./db";

// XP per level: 100 XP needed for level 2, 250 for level 3, 500 for level 4, etc.
// Using a simple curve: level N requires (N-1) * 250 XP cumulative
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) * 250;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

export async function awardXp(userId: string, amount: number): Promise<{ xp: number; level: number; leveledUp: boolean; newBadges: any[] }> {
  try {
    const existing = await db.userXp.upsert({
      where: { userId },
      create: { userId, xpAmount: amount, level: 1, lastActivityDate: new Date() },
      update: { xpAmount: { increment: amount } },
    });

    const newLevel = levelForXp(existing.xpAmount);
    const leveledUp = newLevel > existing.level;

    if (leveledUp) {
      await db.userXp.update({
        where: { userId },
        data: { level: newLevel },
      });
    }

    // Update leaderboard (best-effort)
    await db.leaderboard.upsert({
      where: { userId },
      create: { userId, xpTotal: existing.xpAmount },
      update: { xpTotal: existing.xpAmount },
    }).catch(() => {});

    // Check badges
    const newBadges = await checkAndAwardBadges(userId);

    return { xp: existing.xpAmount, level: newLevel, leveledUp, newBadges };
  } catch (e: any) {
    console.error("awardXp error:", e?.message);
    return { xp: 0, level: 1, leveledUp: false, newBadges: [] };
  }
}

export async function updateStreak(userId: string): Promise<{ streak: number; bumped: boolean; newBadges: any[] }> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const existing = await db.userXp.findUnique({ where: { userId } });
    const lastDate = existing?.lastActivityDate ? new Date(existing.lastActivityDate) : null;
    if (lastDate) lastDate.setHours(0, 0, 0, 0);

    let newStreak = existing?.streakDays ?? 0;
    let bumped = false;

    if (!lastDate || lastDate.getTime() === today.getTime()) {
      // First activity ever OR already studied today — don't bump
      if (!lastDate) newStreak = 1;
    } else if (lastDate.getTime() === yesterday.getTime()) {
      newStreak += 1;
      bumped = true;
    } else {
      // Streak broken — reset
      newStreak = 1;
      bumped = false;
    }

    await db.userXp.upsert({
      where: { userId },
      create: { userId, streakDays: newStreak, lastActivityDate: today, xpAmount: 0, level: 1 },
      update: { streakDays: newStreak, lastActivityDate: today },
    });

    const newBadges = await checkAndAwardBadges(userId);

    return { streak: newStreak, bumped, newBadges };
  } catch (e: any) {
    console.error("updateStreak error:", e?.message);
    return { streak: 0, bumped: false, newBadges: [] };
  }
}

export async function recordActivity(userId: string, xpGained: number = 0): Promise<void> {
  // Update streak first, then award XP (so streak-based badges fire correctly)
  await updateStreak(userId);
  if (xpGained > 0) {
    await awardXp(userId, xpGained);
  }
}

export async function checkAndAwardBadges(userId: string): Promise<any[]> {
  try {
    const allBadges = await db.badge.findMany();
    const earned = await db.userBadge.findMany({
      where: { userId },
      select: { badgeId: true },
    });
    const earnedIds = new Set(earned.map((b) => b.badgeId));

    // Gather user stats
    const xp = await db.userXp.findUnique({ where: { userId } });
    const xpAmount = xp?.xpAmount ?? 0;
    const streak = xp?.streakDays ?? 0;

    const [firstPathProgress] = await Promise.all([
      db.userPathProgress.findFirst({
        where: { userId, status: "completed" },
        orderBy: { completedAt: "asc" },
      }),
    ]);

    const itemStats = await db.userPathProgress.groupBy({
      by: ["status"],
      where: { userId },
      _count: true,
    });

    const completedCount = itemStats.find((s) => s.status === "completed")?._count ?? 0;

    const firstQuiz = await db.userPathProgress.findFirst({
      where: { userId, status: "completed" },
      include: { pathItem: { select: { type: true } } },
    });

    const earnedBadges: any[] = [];

    for (const badge of allBadges) {
      if (earnedIds.has(badge.id)) continue;
      const criteria = badge.criteria as any;
      if (!criteria) continue;

      let shouldAward = false;
      if (criteria.type === "first_item") shouldAward = completedCount >= 1;
      else if (criteria.type === "first_quiz" || criteria.type === "first_flashcards" || criteria.type === "first_lesson" || criteria.type === "first_concept_map") {
        const targetType = criteria.type.replace("first_", "");
        if (criteria.type === "first_concept_map") {
          const cmCount = await db.conceptMap.count({ where: { userId } });
          shouldAward = cmCount >= 1;
        } else if (criteria.type === "first_quiz") {
          // Any quiz attempt with passing score
          const quizAttempts = await db.attempt.count({
            where: { userId, isCorrect: true },
          });
          shouldAward = quizAttempts >= 1;
        } else if (criteria.type === "first_flashcards") {
          const fcSets = await db.studySet.count({
            where: { userId, sourceType: "flashcards" },
          });
          shouldAward = fcSets >= 1;
        } else if (criteria.type === "first_lesson") {
          shouldAward = completedCount >= 1; // any first completed item counts
        }
      } else if (criteria.type === "streak") {
        shouldAward = streak >= (criteria.days ?? 0);
      } else if (criteria.type === "xp") {
        shouldAward = xpAmount >= (criteria.amount ?? 0);
      } else if (criteria.type === "first_path") {
        const completedPaths = await db.learningPath.count({
          where: { userId, status: "completed" },
        });
        shouldAward = completedPaths >= 1;
      } else if (criteria.type === "perfect_quiz") {
        // At least one quiz attempt with score=1.0
        const perfect = await db.userPathProgress.findFirst({
          where: { userId, status: "completed", score: 1.0 },
        });
        shouldAward = Boolean(perfect);
      } else if (criteria.type === "first_daily_review") {
        const dr = await db.dailyReview.findFirst({
          where: { userId, status: "completed" },
        });
        shouldAward = Boolean(dr);
      }

      if (shouldAward) {
        try {
          await db.userBadge.create({
            data: { userId, badgeId: badge.id },
          });
          earnedBadges.push(badge);
        } catch {
          // already earned (race)
        }
      }
    }

    return earnedBadges;
  } catch (e: any) {
    console.error("checkAndAwardBadges error:", e?.message);
    return [];
  }
}
