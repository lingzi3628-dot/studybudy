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

/**
 * POST /api/progress — Award XP for an activity
 *
 * Body: { xp: number, activity?: string }
 *
 * Updates UserXp record:
 *   - Increments xpAmount
 *   - Recalculates level (xp / 200 + 1)
 *   - Updates streak (consecutive days with activity)
 *   - Updates lastActivityDate
 */
export async function POST(req: any) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({})) as { xp?: number; activity?: string };
  const xpGain = Math.min(50, Math.max(1, Number(body.xp) || 5));

  try {
    // Find or create UserXp record
    let userXp = await db.userXp.findUnique({ where: { userId: user.id } }).catch(() => null);
    if (!userXp) {
      userXp = await db.userXp.create({
        data: { userId: user.id, xpAmount: 0, level: 1, streakDays: 0 },
      });
    }

    // Calculate new streak
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const lastActivity = userXp.lastActivityDate ? new Date(userXp.lastActivityDate) : null;
    let newStreak = userXp.streakDays;
    if (lastActivity) {
      const lastDay = new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate());
      if (lastDay.getTime() === today.getTime()) {
        // Already active today — keep streak
      } else if (lastDay.getTime() === yesterday.getTime()) {
        // Active yesterday → increment streak
        newStreak = userXp.streakDays + 1;
      } else {
        // Streak broken → reset to 1
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    const newXp = userXp.xpAmount + xpGain;
    const newLevel = Math.floor(newXp / 200) + 1;

    const updated = await db.userXp.update({
      where: { userId: user.id },
      data: {
        xpAmount: newXp,
        level: newLevel,
        streakDays: newStreak,
        lastActivityDate: now,
      },
    });

    return NextResponse.json({
      ok: true,
      xp: updated.xpAmount,
      level: updated.level,
      streak: updated.streakDays,
      xpGain,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to update XP" }, { status: 500 });
  }
}
