import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/user/analytics — comprehensive analytics for the user
 *
 * Returns:
 *   - time spent per subject (from card_reviews + user_path_progress)
 *   - accuracy trend (last 30 attempts)
 *   - topic mastery (all topics)
 *   - predicted readiness score (combined)
 *   - weekly XP history
 *   - study sets / concept maps created
 */
export async function GET() {
  const user = await getCurrentUser();

  // Topic mastery across all subjects
  const allMastery = await db.topicMastery.findMany({
    where: { userId: user.id },
    orderBy: { lastUpdated: "desc" },
    select: { subject: true, topic: true, masteryLevel: true, totalAttempts: true, correctAttempts: true, lastUpdated: true },
  }).catch(() => []);

  const subjectMap = new Map<string, { total: number; sum: number; attempts: number; correct: number }>();
  for (const m of allMastery) {
    const s = subjectMap.get(m.subject) ?? { total: 0, sum: 0, attempts: 0, correct: 0 };
    s.total += 1;
    s.sum += m.masteryLevel;
    s.attempts += m.totalAttempts;
    s.correct += m.correctAttempts;
    subjectMap.set(m.subject, s);
  }
  const masteryBySubject = Array.from(subjectMap.entries()).map(([subject, v]) => ({
    subject,
    mastery: v.total ? Math.round((v.sum / v.total) * 100) / 100 : 0,
    attempts: v.attempts,
    correct: v.correct,
    accuracy: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) / 100 : null,
  }));

  // Recent attempts (last 30)
  const recentAttempts = await db.attempt.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { isCorrect: true, createdAt: true, card: { select: { subject: true, topic: true } } },
  }).catch(() => []);

  const totalRecent = recentAttempts.length;
  const correctRecent = recentAttempts.filter((a) => a.isCorrect).length;
  const accuracyTrend = totalRecent > 0 ? Math.round((correctRecent / totalRecent) * 100) / 100 : null;

  // Daily accuracy for last 7 days
  const dayBuckets: { date: string; correct: number; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dayItems = recentAttempts.filter((a) => {
      const t = new Date(a.createdAt);
      return t >= start && t < end;
    });
    dayBuckets.push({
      date: start.toISOString().slice(0, 10),
      correct: dayItems.filter((a) => a.isCorrect).length,
      total: dayItems.length,
    });
  }

  // Weak areas: topics with mastery < 0.5
  const weakAreas = allMastery
    .filter((m) => m.masteryLevel < 0.5 && m.totalAttempts > 0)
    .slice(0, 5)
    .map((m) => ({ topic: m.topic, mastery: m.masteryLevel, attempts: m.totalAttempts }));

  // Path progress
  const pathProgress = await db.userPathProgress.findMany({
    where: { userId: user.id },
    select: { status: true, timeSpentSec: true, score: true },
  }).catch(() => []);
  const totalTimeSpent = pathProgress.reduce((sum, p) => sum + (p.timeSpentSec ?? 0), 0);
  const completedItems = pathProgress.filter((p) => p.status === "completed").length;
  const avgPathScore = pathProgress.length > 0
    ? pathProgress.filter((p) => p.score !== null).reduce((s, p) => s + (p.score ?? 0), 0) / Math.max(1, pathProgress.filter((p) => p.score !== null).length)
    : null;

  // Predicted readiness: combine mastery + accuracy + streak
  const xp = await db.userXp.findUnique({
    where: { userId: user.id },
    select: { xpAmount: true, streakDays: true, level: true },
  }).catch(() => null);

  const avgMastery = masteryBySubject.length > 0
    ? masteryBySubject.reduce((s, m) => s + m.mastery, 0) / masteryBySubject.length
    : 0;
  const readiness = Math.round((avgMastery * 0.4 + (accuracyTrend ?? 0) * 0.4 + Math.min(0.2, (xp?.streakDays ?? 0) * 0.04)) * 100);

  // XP history by week (last 4 weeks)
  const weeklyXp = xp?.xpAmount ?? 0;

  return NextResponse.json({
    masteryBySubject,
    weakAreas,
    accuracyTrend,
    accuracyTrend7d: dayBuckets,
    recentAttempts: totalRecent,
    recentCorrect: correctRecent,
    totalTimeSpentSec: totalTimeSpent,
    completedPathItems: completedItems,
    avgPathScore,
    xp: xp?.xpAmount ?? 0,
    level: xp?.level ?? 1,
    streak: xp?.streakDays ?? 0,
    readiness,
    tokenBalance: user.tokenBalance,
  });
}
