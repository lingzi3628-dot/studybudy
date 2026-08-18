import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { countDueCards } from "@/lib/progression";

export const runtime = "nodejs";

/**
 * GET /api/progress
 *
 * Returns: { xp, level, streak, badges[], mastery[], weakAreas[], recentAttempts[] }
 */
export async function GET() {
  const user = await getCurrentUser();

  // mastery per subject — average across topics
  const allMastery = await db.topicMastery.findMany({
    where: { userId: user.id },
    orderBy: { lastUpdated: "desc" },
  });

  const subjectMap = new Map<string, { total: number; sum: number }>();
  for (const m of allMastery) {
    const s = subjectMap.get(m.subject) ?? { total: 0, sum: 0 };
    s.total += 1;
    s.sum += m.masteryLevel;
    subjectMap.set(m.subject, s);
  }
  const masteryBySubject = Array.from(subjectMap.entries()).map(([subject, v]) => ({
    subject,
    mastery: v.total ? Math.round((v.sum / v.total) * 100) / 100 : 0,
    topics: allMastery
      .filter((m) => m.subject === subject)
      .map((m) => ({
        topic: m.topic,
        mastery: m.masteryLevel,
        totalAttempts: m.totalAttempts,
        correctAttempts: m.correctAttempts,
      })),
  }));

  // weak areas: topics with mastery < 0.6 and at least 1 attempt
  const weakAreas = allMastery
    .filter((m) => m.masteryLevel < 0.6 && m.totalAttempts >= 1)
    .map((m) => ({
      subject: m.subject,
      topic: m.topic,
      mastery: m.masteryLevel,
      totalAttempts: m.totalAttempts,
      correctAttempts: m.correctAttempts,
    }))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 6);

  // recent attempts
  const recentAttempts = await db.attempt.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      card: { select: { subject: true, topic: true, front: true, question: true } },
    },
  });

  // XP: 10 per correct, 5 per attempt
  const [totalAttempts, correctAttempts] = await Promise.all([
    db.attempt.count({ where: { userId: user.id } }),
    db.attempt.count({ where: { userId: user.id, isCorrect: true } }),
  ]);
  const xp = correctAttempts * 10 + totalAttempts * 5;
  const level = Math.floor(xp / 200) + 1;

  // streak: consecutive days with at least one attempt, ending today or yesterday
  const dayStart = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const days = await db.attempt.findMany({
    where: { userId: user.id },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const dayStamps = Array.from(
    new Set(days.map((d) => dayStart(new Date(d.createdAt))))
  ).sort((a, b) => b - a);
  let streak = 0;
  const todayStart = dayStart(new Date());
  const oneDay = 24 * 60 * 60 * 1000;
  if (dayStamps.length) {
    if (dayStamps[0] >= todayStart - oneDay) {
      streak = 1;
      for (let i = 1; i < dayStamps.length; i++) {
        if (dayStamps[i] === dayStamps[i - 1] - oneDay) streak += 1;
        else break;
      }
    }
  }

  // badges: derived from activity
  const badges: { label: string; icon: string; earned: boolean }[] = [
    { label: "First Quiz", icon: "star", earned: totalAttempts >= 1 },
    {
      label: "Math Master",
      icon: "trophy",
      earned:
        (masteryBySubject.find(
          (m) => m.subject === "Mathematics" || m.subject === "Math"
        )?.mastery ?? 0) >= 0.8,
    },
    { label: "Streak 3", icon: "flame", earned: streak >= 3 },
    { label: "Streak 7", icon: "flame", earned: streak >= 7 },
    { label: "Quiz Champion", icon: "award", earned: totalAttempts >= 10 },
    { label: "50 Correct", icon: "medal", earned: correctAttempts >= 50 },
    {
      label: "Language Explorer",
      icon: "globe",
      earned: masteryBySubject.some((m) =>
        /language|swahili|chinese|english|french|spanish|arabic/i.test(m.subject)
      ),
    },
    { label: "Trailblazer", icon: "rocket", earned: level >= 5 },
  ];

  const dueCount = await countDueCards(user.id);

  return NextResponse.json({
    user: {
      name: user.name,
      email: user.email,
      plan: user.plan,
      tokenBalance: user.tokenBalance,
      currentModel: user.currentModel,
      planId: user.planId,
      subscriptionExpiry: user.subscriptionExpiry,
      tokenResetDate: user.tokenResetDate,
      hasApiKey: user.hasApiKey,
    },
    xp,
    level,
    streak,
    dueCount,
    mastery: masteryBySubject,
    weakAreas,
    recentAttempts: recentAttempts.map((a) => ({
      id: a.id,
      cardId: a.cardId,
      isCorrect: a.isCorrect,
      selectedIndex: a.selectedIndex,
      createdAt: a.createdAt,
      card: a.card,
    })),
    badges,
    totalAttempts,
    correctAttempts,
  });
}
