import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardAction } from "@/lib/earn";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/classroom/[sessionId]/complete
 *
 * Marks a classroom session as completed.
 *  - Sets status='completed', endTime=now
 *  - Awards XP/coins/tokens via awardAction(user.id, "class_completed")
 *  - Updates TopicMastery based on average test scores
 *  - If pathItemId provided, marks the path item as completed via upserting UserPathProgress
 *  - Checks for classroom-related badges (first_class, perfect_attendance)
 *
 * Returns: { summary: { xpGained, coinsGained, tokensGained, avgScore, masteryIncrease, newBadges } }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;

  // 1. Fetch session + verify ownership
  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      topic: { select: { id: true, name: true, subject: true, description: true } },
      tests: { select: { id: true, testType: true, score: true } },
    },
  }).catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.userId !== user.id) {
    return NextResponse.json({ error: "You don't have access to this session." }, { status: 403 });
  }
  if (session.status === "completed") {
    return NextResponse.json({ error: "This class has already been completed." }, { status: 400 });
  }

  // 2. Compute average test score
  const validScores = session.tests
    .map((t) => t.score)
    .filter((s): s is number => typeof s === "number" && !isNaN(s));
  const avgScore = validScores.length > 0
    ? validScores.reduce((sum, s) => sum + s, 0) / validScores.length
    : 0;

  // 3. Mark session as completed
  await db.classSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      endTime: new Date(),
      progress: 1.0,
    },
  }).catch(() => {});

  // 4. Award XP/coins/tokens via awardAction("class_completed")
  const earned = await awardAction(user.id, "class_completed");
  const xpGained = earned.xp;
  const coinsGained = earned.coins;
  const tokensGained = earned.tokens;

  // 5. Update TopicMastery (increment by avgScore * 0.15, capped at 1.0)
  let masteryIncrease = 0;
  try {
    const inc = Math.min(0.15, avgScore * 0.15);
    const existing = await db.topicMastery.findUnique({
      where: {
        userId_subject_topic: {
          userId: user.id,
          subject: session.topic.subject,
          topic: session.topic.name,
        },
      },
    });
    const oldLevel = existing?.masteryLevel ?? 0;
    const newLevel = Math.min(1, oldLevel + inc);
    await db.topicMastery.upsert({
      where: {
        userId_subject_topic: {
          userId: user.id,
          subject: session.topic.subject,
          topic: session.topic.name,
        },
      },
      create: {
        userId: user.id,
        subject: session.topic.subject,
        topic: session.topic.name,
        masteryLevel: newLevel,
        totalAttempts: 1,
        correctAttempts: avgScore >= 0.7 ? 1 : 0,
      },
      update: {
        masteryLevel: newLevel,
        totalAttempts: { increment: 1 },
        correctAttempts: avgScore >= 0.7 ? { increment: 1 } : undefined,
      },
    });
    masteryIncrease = newLevel - oldLevel;
  } catch (e: any) {
    console.error("TopicMastery update failed:", e?.message);
  }

  // 6. Mark the path item as completed (if pathItemId was provided)
  if (session.pathItemId) {
    try {
      await db.userPathProgress.upsert({
        where: {
          userId_pathItemId: { userId: user.id, pathItemId: session.pathItemId },
        },
        create: {
          userId: user.id,
          pathItemId: session.pathItemId,
          status: "completed",
          score: avgScore > 0 ? avgScore : null,
          attempts: 1,
          completedAt: new Date(),
        },
        update: {
          status: "completed",
          score: avgScore > 0 ? avgScore : undefined,
          completedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } catch (e: any) {
      console.error("PathItem completion failed:", e?.message);
    }
  }

  // 7. Update streak
  await recordActivity(user.id, 0).catch(() => {});

  // 8. Check badges — first_class (first completed session) + perfect_attendance
  const newBadges: any[] = [];
  try {
    const allBadges = await db.badge.findMany();
    const earnedBadgeIds = await db.userBadge.findMany({
      where: { userId: user.id },
      select: { badgeId: true },
    });
    const earnedSet = new Set(earnedBadgeIds.map((b) => b.badgeId));

    // first_class: this is the user's first completed class
    const firstClassBadge = allBadges.find((b) => (b.criteria as any)?.type === "first_class");
    if (firstClassBadge && !earnedSet.has(firstClassBadge.id)) {
      const completedCount = await db.classSession.count({
        where: { userId: user.id, status: "completed" },
      });
      if (completedCount >= 1) {
        try {
          await db.userBadge.create({ data: { userId: user.id, badgeId: firstClassBadge.id } });
          newBadges.push(firstClassBadge);
        } catch { /* already earned */ }
      }
    }

    // perfect_attendance: completed without any skipped tests
    // (we treat "no test attempted" as not perfect — require at least one test taken)
    const perfectBadge = allBadges.find((b) => (b.criteria as any)?.type === "perfect_attendance");
    if (perfectBadge && !earnedSet.has(perfectBadge.id)) {
      const testsTaken = session.tests.length;
      const allPassed = session.tests.every((t) => (t.score ?? 0) >= 0.7);
      if (testsTaken > 0 && allPassed) {
        try {
          await db.userBadge.create({ data: { userId: user.id, badgeId: perfectBadge.id } });
          newBadges.push(perfectBadge);
        } catch { /* already earned */ }
      }
    }

    // oral_exam_ace / written_exam_champion: score 90%+ on oral / written
    const oralAceBadge = allBadges.find((b) => (b.criteria as any)?.type === "oral_exam_ace");
    if (oralAceBadge && !earnedSet.has(oralAceBadge.id)) {
      const hasAcedOral = session.tests.some((t) => t.testType === "oral" && (t.score ?? 0) >= 0.9);
      if (hasAcedOral) {
        try {
          await db.userBadge.create({ data: { userId: user.id, badgeId: oralAceBadge.id } });
          newBadges.push(oralAceBadge);
        } catch { /* already earned */ }
      }
    }

    const writtenChampBadge = allBadges.find((b) => (b.criteria as any)?.type === "written_exam_champion");
    if (writtenChampBadge && !earnedSet.has(writtenChampBadge.id)) {
      const hasAcedWritten = session.tests.some((t) => t.testType === "written" && (t.score ?? 0) >= 0.9);
      if (hasAcedWritten) {
        try {
          await db.userBadge.create({ data: { userId: user.id, badgeId: writtenChampBadge.id } });
          newBadges.push(writtenChampBadge);
        } catch { /* already earned */ }
      }
    }

    // class_scholar: attended 10 classes
    const scholarBadge = allBadges.find((b) => (b.criteria as any)?.type === "class_count");
    if (scholarBadge && !earnedSet.has(scholarBadge.id)) {
      const countNeeded = (scholarBadge.criteria as any)?.count ?? 10;
      const completedCount = await db.classSession.count({
        where: { userId: user.id, status: "completed" },
      });
      if (completedCount >= countNeeded) {
        try {
          await db.userBadge.create({ data: { userId: user.id, badgeId: scholarBadge.id } });
          newBadges.push(scholarBadge);
        } catch { /* already earned */ }
      }
    }
  } catch (e: any) {
    console.error("Badge check failed:", e?.message);
  }

  // 9. Bonus XP from gamify (in case awardAction didn't award XP — best-effort)
  if (xpGained === 0) {
    // No earn rule configured — award a default 20 XP
    await awardXp(user.id, 20).catch(() => {});
  }

  return NextResponse.json({
    summary: {
      xpGained,
      coinsGained,
      tokensGained,
      avgScore,
      masteryIncrease: Math.round(masteryIncrease * 1000) / 1000,
      newBadges: newBadges.map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
        description: b.description,
      })),
      sessionId: session.id,
      topicId: session.topic.id,
    },
  });
}
