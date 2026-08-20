import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-room/[topicId]
 *
 * Returns the full Study Room state for the user + topic, including:
 * - room state (cover image, AI teacher persona, last visited)
 * - topic info
 * - resources (lessons, flashcards, quizzes, concept maps, videos)
 * - path modules/items + progress (if a path is linked)
 * - daily review status
 * - gamification stats (XP, streak, level, badges)
 * - analytics summary (time spent, accuracy, mastery, due cards)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  // Verify topic exists
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    include: {
      studySets: {
        where: { userId: user.id },
        select: { id: true, title: true, createdAt: true, _count: { select: { cards: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      lessons: { select: { id: true, level: true }, take: 10 },
      conceptMaps: {
        where: { OR: [{ userId: user.id }, { isPublic: true }] },
        select: { id: true, title: true, isPublic: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      _count: { select: { cards: true } },
    },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Get or create room state
  const room = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: { userId: user.id, topicId, lastVisited: new Date() },
    update: { lastVisited: new Date() },
    include: {
      path: {
        select: {
          id: true, skill: true, level: true, goal: true, status: true,
          modules: {
            orderBy: { orderIndex: "asc" },
            include: {
              items: {
                orderBy: { orderIndex: "asc" },
                include: {
                  userProgress: {
                    where: { userId: user.id },
                    select: { status: true, score: true, completedAt: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Daily review status
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyReview = await db.dailyReview.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
    select: { id: true, status: true, score: true, items: true },
  }).catch(() => null);

  // Gamification
  const xp = await db.userXp.findUnique({
    where: { userId: user.id },
    select: { xpAmount: true, level: true, streakDays: true, lastActivityDate: true },
  }).catch(() => null);
  const earnedBadges = await db.userBadge.findMany({
    where: { userId: user.id },
    include: { badge: { select: { id: true, name: true, icon: true, description: true } } },
    orderBy: { earnedAt: "desc" },
    take: 20,
  }).catch(() => []);

  // Analytics — due cards (use dueDate field)
  const dueCount = await db.cardReview.count({
    where: { userId: user.id, dueDate: { lte: new Date() } },
  }).catch(() => 0);

  const topicMastery = await db.topicMastery.findFirst({
    where: { userId: user.id, topic: topic.name },
    select: { masteryLevel: true, totalAttempts: true, correctAttempts: true, lastUpdated: true },
  }).catch(() => null);

  const recentAttempts = await db.attempt.findMany({
    where: { userId: user.id, card: { topicId } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { isCorrect: true, createdAt: true },
  }).catch(() => []);
  const accuracy = recentAttempts.length > 0
    ? Math.round((recentAttempts.filter((a) => a.isCorrect).length / recentAttempts.length) * 100) / 100
    : null;

  // Predicted readiness
  const masteryScore = topicMastery?.masteryLevel ?? 0;
  const accuracyScore = accuracy ?? 0;
  const streakBonus = Math.min(0.1, (xp?.streakDays ?? 0) * 0.02);
  const readiness = Math.round((masteryScore * 0.5 + accuracyScore * 0.4 + streakBonus) * 100);

  return NextResponse.json({
    room,
    topic: {
      id: topic.id,
      name: topic.name,
      subject: topic.subject,
      description: topic.description,
    },
    resources: {
      studySets: topic.studySets,
      conceptMaps: topic.conceptMaps,
      topicLessons: topic.lessons,
      cardCount: topic._count?.cards ?? 0,
    },
    dailyReview: dailyReview
      ? { ...dailyReview, items: dailyReview.items as any[] }
      : { status: "none", items: [] },
    gamification: {
      xp: xp?.xpAmount ?? 0,
      level: xp?.level ?? 1,
      streak: xp?.streakDays ?? 0,
      badges: earnedBadges.map((b) => b.badge),
      nextLevelXp: ((xp?.level ?? 1) + 1 - 1) * 250,
    },
    analytics: {
      dueCards: dueCount,
      topicMastery: masteryScore,
      accuracy,
      recentAttemptsCount: recentAttempts.length,
      readiness,
    },
    // Phase 12b — extra room data
    bookmarks: await db.bookmark.findMany({
      where: { userId: user.id, groupId: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, resourceType: true, resourceId: true, createdAt: true },
    }).catch(() => []),
    notes: await db.userNote.findMany({
      where: { userId: user.id, OR: [{ topicId }, { topicId: null }] },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, content: true, updatedAt: true },
    }).catch(() => []),
    dailyGoals: await db.dailyGoal.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    }).catch(() => null),
    focusSessionsToday: await db.focusSession.count({
      where: { userId: user.id, startedAt: { gte: today } },
    }).catch(() => 0),
    focusSecondsToday: (await db.focusSession.findMany({
      where: { userId: user.id, startedAt: { gte: today } },
      select: { durationSec: true },
    }).catch(() => []) as any[]).reduce((sum, s) => sum + (s?.durationSec ?? 0), 0),
    studyGroups: await db.studyGroupMember.findMany({
      where: { userId: user.id },
      include: {
        group: {
          select: {
            id: true, name: true, inviteCode: true, topicId: true,
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    }).catch(() => []),
    notifications: await db.notification.findMany({
      where: { userId: user.id, read: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, message: true, createdAt: true },
    }).catch(() => []),
    tokenBalance: user.tokenBalance,
  });
}
