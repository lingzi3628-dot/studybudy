import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-room/[topicId]/report
 *
 * Returns a comprehensive "report card" data payload that the frontend
 * can render to a PDF/image using html-to-image.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const today = new Date();
  const last7 = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // All data in parallel
  const [mastery, attempts7, attempts30, focusSessions30, userXp, earnedBadges, studySetsCount, conceptMapsCount, completedPathItems] = await Promise.all([
    db.topicMastery.findFirst({
      where: { userId: user.id, topic: topic.name },
      select: { masteryLevel: true, totalAttempts: true, correctAttempts: true },
    }).catch(() => null),
    db.attempt.findMany({
      where: { userId: user.id, createdAt: { gte: last7 }, card: { topicId } },
      select: { isCorrect: true, createdAt: true },
    }).catch(() => []),
    db.attempt.findMany({
      where: { userId: user.id, createdAt: { gte: last30 }, card: { topicId } },
      select: { isCorrect: true, createdAt: true },
    }).catch(() => []),
    db.focusSession.findMany({
      where: { userId: user.id, topicId, startedAt: { gte: last30 } },
      select: { durationSec: true, startedAt: true },
    }).catch(() => []),
    db.userXp.findUnique({
      where: { userId: user.id },
      select: { xpAmount: true, level: true, streakDays: true },
    }).catch(() => null),
    db.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: { select: { id: true, name: true, icon: true } } },
      orderBy: { earnedAt: "desc" },
      take: 10,
    }).catch(() => []),
    db.studySet.count({ where: { userId: user.id, topicId } }).catch(() => 0),
    db.conceptMap.count({ where: { userId: user.id, topicId } }).catch(() => 0),
    db.userPathProgress.count({
      where: { userId: user.id, status: "completed", pathItem: { module: { path: { topicId } } } },
    }).catch(() => 0),
  ]);

  const correct7 = attempts7.filter((a) => a.isCorrect).length;
  const accuracy7 = attempts7.length > 0 ? correct7 / attempts7.length : 0;
  const correct30 = attempts30.filter((a) => a.isCorrect).length;
  const accuracy30 = attempts30.length > 0 ? correct30 / attempts30.length : 0;

  const totalFocusSec = focusSessions30.reduce((sum, s) => sum + s.durationSec, 0);

  const readiness = Math.round(
    (mastery?.masteryLevel ?? 0) * 0.4
    + accuracy30 * 0.4
    + Math.min(0.2, (userXp?.streakDays ?? 0) * 0.04)
  ) * 100 / 100;

  // Daily accuracy buckets for last 7 days
  const dailyBuckets: { date: string; correct: number; total: number; accuracy: number | null }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dayItems = attempts7.filter((a) => {
      const t = new Date(a.createdAt);
      return t >= start && t < end;
    });
    const dayCorrect = dayItems.filter((a) => a.isCorrect).length;
    dailyBuckets.push({
      date: start.toISOString().slice(0, 10),
      correct: dayCorrect,
      total: dayItems.length,
      accuracy: dayItems.length > 0 ? dayCorrect / dayItems.length : null,
    });
  }

  return NextResponse.json({
    report: {
      topic: { name: topic.name, subject: topic.subject },
      user: { name: user.name, email: user.email, level: userXp?.level ?? 1 },
      generatedAt: new Date().toISOString(),
      // Mastery
      mastery: mastery?.masteryLevel ?? 0,
      totalAttempts: mastery?.totalAttempts ?? 0,
      correctAttempts: mastery?.correctAttempts ?? 0,
      // Accuracy
      accuracy7d: accuracy7,
      accuracy30d: accuracy30,
      attempts7d: attempts7.length,
      attempts30d: attempts30.length,
      dailyBuckets,
      // Focus
      focusSessions30d: focusSessions30.length,
      focusSeconds30d: totalFocusSec,
      // Gamification
      xp: userXp?.xpAmount ?? 0,
      streak: userXp?.streakDays ?? 0,
      badges: earnedBadges.map((b) => b.badge),
      // Resources
      studySets: studySetsCount,
      conceptMaps: conceptMapsCount,
      completedPathItems,
      // Readiness
      readiness,
    },
  });
}
