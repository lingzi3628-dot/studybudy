import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFamilyParent } from "@/lib/family-auth";

export const runtime = "nodejs";

/**
 * GET /api/family/insights?childId=...
 *
 * Returns analytics for a single child — mirrors the queries in
 * /api/user/analytics but runs them against the child's userId.
 *
 * Auth: the caller must be a Family Parent, and the child must belong
 * to their family.
 *
 * Output shape (same as /api/user/analytics plus child profile fields):
 *   { child: {id, username, displayName, gradeLevel, avatarEmoji, lastLogin},
 *     family: {id, displayName},
 *     xp, level, streak,
 *     masteryBySubject: [{subject, mastery, attempts, correct, accuracy}],
 *     weakAreas: [{topic, mastery, attempts}],
 *     accuracyTrend, accuracyTrend7d: [{date, correct, total}],
 *     recentAttempts, recentCorrect,
 *     totalTimeSpentSec, completedPathItems, avgPathScore,
 *     readiness, tokenBalance, coinBalance,
 *     recentActivity: [{type, description, createdAt, subject?, score?}],
 *     lastLogin }
 */
export async function GET(req: NextRequest) {
  // Verify parent auth
  let parentCtx;
  try {
    parentCtx = await requireFamilyParent();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const childId = new URL(req.url).searchParams.get("childId") ?? "";

  if (!childId) {
    return NextResponse.json(
      { error: "childId query param is required" },
      { status: 400 }
    );
  }

  // Fetch the child — must belong to this parent's family
  const child = await db.familyChild.findUnique({
    where: { id: childId },
  });

  if (!child || child.parentUserId !== parentCtx.userId) {
    return NextResponse.json(
      { error: "Child not found in your family." },
      { status: 404 }
    );
  }

  const childUserId = child.userId;

  // ---- Run the same queries as /api/user/analytics, against childUserId ----

  // Topic mastery
  const allMastery = await db.topicMastery.findMany({
    where: { userId: childUserId },
    orderBy: { lastUpdated: "desc" },
    select: {
      subject: true, topic: true, masteryLevel: true,
      totalAttempts: true, correctAttempts: true, lastUpdated: true,
    },
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
    where: { userId: childUserId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      isCorrect: true, createdAt: true,
      card: { select: { subject: true, topic: true } },
    },
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

  // Weak areas
  const weakAreas = allMastery
    .filter((m) => m.masteryLevel < 0.5 && m.totalAttempts > 0)
    .slice(0, 5)
    .map((m) => ({
      topic: m.topic,
      mastery: m.masteryLevel,
      attempts: m.totalAttempts,
      subject: m.subject,
    }));

  // Path progress
  const pathProgress = await db.userPathProgress.findMany({
    where: { userId: childUserId },
    select: { status: true, timeSpentSec: true, score: true },
  }).catch(() => []);
  const totalTimeSpent = pathProgress.reduce((sum, p) => sum + (p.timeSpentSec ?? 0), 0);
  const completedItems = pathProgress.filter((p) => p.status === "completed").length;
  const scoredItems = pathProgress.filter((p) => p.score !== null);
  const avgPathScore = scoredItems.length > 0
    ? scoredItems.reduce((s, p) => s + (p.score ?? 0), 0) / scoredItems.length
    : null;

  // XP / streak
  const xp = await db.userXp.findUnique({
    where: { userId: childUserId },
    select: { xpAmount: true, streakDays: true, level: true, lastActivityDate: true },
  }).catch(() => null);

  const avgMastery = masteryBySubject.length > 0
    ? masteryBySubject.reduce((s, m) => s + m.mastery, 0) / masteryBySubject.length
    : 0;
  const readiness = Math.round(
    (avgMastery * 0.4 + (accuracyTrend ?? 0) * 0.4 + Math.min(0.2, (xp?.streakDays ?? 0) * 0.04)) * 100
  );

  // ---- Recent activity feed ----
  // Combine: recent attempts, recent study sets, recent path progress completions
  const [recentStudySets, recentPathCompletions] = await Promise.all([
    db.studySet.findMany({
      where: { userId: childUserId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, subject: true, topic: true, createdAt: true },
    }).catch(() => []),
    db.userPathProgress.findMany({
      where: { userId: childUserId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: { pathItemId: true, score: true, timeSpentSec: true, completedAt: true },
    }).catch(() => []),
  ]);

  type Activity = {
    type: "quiz" | "studyset" | "path_complete" | "login";
    description: string;
    createdAt: string;
    subject?: string | null;
    score?: number | null;
  };
  const recentActivity: Activity[] = [];

  // Add recent quiz attempts (deduped by day+subject)
  for (const a of recentAttempts.slice(0, 8)) {
    recentActivity.push({
      type: "quiz",
      description: a.isCorrect ? "Quiz answer correct" : "Quiz answer incorrect",
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      subject: a.card?.subject ?? null,
    });
  }
  for (const s of recentStudySets) {
    recentActivity.push({
      type: "studyset",
      description: `Created study set: ${s.title}`,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
      subject: s.subject ?? null,
    });
  }
  for (const p of recentPathCompletions) {
    recentActivity.push({
      type: "path_complete",
      description: "Completed a learning path item",
      createdAt: p.completedAt instanceof Date ? p.completedAt.toISOString() : String(p.completedAt),
      score: p.score ?? null,
    });
  }

  // Sort by createdAt desc, take 10
  recentActivity.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const trimmedActivity = recentActivity.slice(0, 10);

  // Fetch child's User row for token/coin balances
  const childUser = await db.user.findUnique({
    where: { id: childUserId },
    select: { tokenBalance: true, coinBalance: true, lastLogin: true, createdAt: true },
  }).catch(() => null);

  // Family info
  const family = await db.family.findUnique({
    where: { id: child.familyId },
    select: { id: true, displayName: true, parentEmail: true },
  });

  return NextResponse.json({
    child: {
      id: child.id,
      username: child.username,
      displayName: child.displayName,
      gradeLevel: child.gradeLevel,
      avatarEmoji: child.avatarEmoji,
      lastLogin: child.lastLogin,
      createdAt: child.createdAt,
    },
    family: family
      ? { id: family.id, displayName: family.displayName, parentEmail: family.parentEmail }
      : null,
    // Core metrics
    xp: xp?.xpAmount ?? 0,
    level: xp?.level ?? 1,
    streak: xp?.streakDays ?? 0,
    lastActivityDate: xp?.lastActivityDate ?? null,
    tokenBalance: childUser?.tokenBalance ?? 0,
    coinBalance: childUser?.coinBalance ?? 0,
    // Analytics
    masteryBySubject,
    weakAreas,
    accuracyTrend,
    accuracyTrend7d: dayBuckets,
    recentAttempts: totalRecent,
    recentCorrect: correctRecent,
    totalTimeSpentSec: totalTimeSpent,
    completedPathItems: completedItems,
    avgPathScore,
    readiness,
    recentActivity: trimmedActivity,
    lastLogin: childUser?.lastLogin ?? null,
  });
}
