import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSchoolStudent } from "@/lib/school-auth";

export const runtime = "nodejs";

/**
 * POST /api/school/topic/[topicId]/start
 *
 * Returns the topic metadata + the questions for that topic, in a
 * randomized order (so two students sitting next to each other see
 * different question sequences).
 *
 * Correct answers are NOT revealed in the response — the client must
 * submit answers via /api/school/topic/[topicId]/submit-test to grade.
 *
 * Access control:
 *   - The student must be enrolled in the topic's subject.
 *   - The topic must be 'available' — i.e. either it's the first topic
 *     (orderIndex === 0) OR the previous topic is 'completed'.
 *
 * On start: upserts StudentTopicProgress and increments `attempts`.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  let student: any;
  try {
    const r = await requireSchoolStudent();
    student = r.student;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { topicId } = await params;
  if (!topicId) {
    return NextResponse.json(
      { error: "topicId is required" },
      { status: 400 }
    );
  }

  const topic = await db.schoolTopic.findUnique({
    where: { id: topicId },
    include: {
      subject: { select: { id: true, name: true } },
      questions: {
        select: {
          id: true,
          questionText: true,
          options: true,
          // correctIndex & explanation are deliberately NOT selected —
          // we never want to leak them in the start response.
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!topic) {
    return NextResponse.json(
      { error: "Topic not found" },
      { status: 404 }
    );
  }

  // Confirm enrollment in the subject.
  const enrollment = await db.studentSubjectEnrollment.findUnique({
    where: {
      studentId_subjectId: {
        studentId: student.id,
        subjectId: topic.subject.id,
      },
    },
    select: { id: true },
  });
  if (!enrollment) {
    return NextResponse.json(
      { error: "You are not enrolled in this subject" },
      { status: 403 }
    );
  }

  // Get or create the topic progress row, then determine if the topic is
  // currently unlocked for this student.
  const progress = await db.studentTopicProgress.upsert({
    where: {
      studentId_topicId: { studentId: student.id, topicId },
    },
    update: {
      attempts: { increment: 1 },
    },
    create: {
      studentId: student.id,
      topicId,
      status: "locked",
      attempts: 1,
    },
    select: { status: true, attempts: true },
  });

  // Re-evaluate access. Even if the DB says 'available', we want to gate
  // by previous-topic completion in case the previous topic was re-locked
  // somehow. Compute the effective status now.
  const prevTopic = await db.schoolTopic.findFirst({
    where: { subjectId: topic.subject.id, orderIndex: { lt: topic.orderIndex } },
    orderBy: { orderIndex: "desc" },
    select: { id: true },
  });

  let canAccess = false;
  if (progress.status === "completed") {
    // Even if already completed, we allow re-taking it for review/attempts.
    canAccess = true;
  } else if (!prevTopic) {
    // First topic in this subject — always accessible.
    canAccess = true;
  } else {
    const prevProgress = await db.studentTopicProgress.findUnique({
      where: {
        studentId_topicId: { studentId: student.id, topicId: prevTopic.id },
      },
      select: { status: true },
    }).catch(() => null);
    canAccess = prevProgress?.status === "completed";
  }

  if (!canAccess) {
    return NextResponse.json(
      {
        error: "Complete the previous topic first to unlock this one.",
        code: "TOPIC_LOCKED",
        needsUpgrade: true,
      },
      { status: 402 }
    );
  }

  // If the topic is currently 'locked' but we got here (e.g. first topic
  // of the subject), promote it to 'available' so the dashboard reflects
  // the correct state.
  if (progress.status === "locked" && !prevTopic) {
    await db.studentTopicProgress
      .update({
        where: {
          studentId_topicId: { studentId: student.id, topicId },
        },
        data: { status: "available" },
      })
      .catch(() => {});
  }

  // Shuffle questions for variety. Fisher-Yates, deterministic copy so
  // the original array isn't mutated.
  const shuffled = [...topic.questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return NextResponse.json({
    topic: {
      id: topic.id,
      name: topic.name,
      timeLimitMinutes: topic.timeLimitMinutes,
      passThreshold: topic.passThreshold,
      questionCount: topic.questionCount,
      subjectName: topic.subject.name,
      orderIndex: topic.orderIndex,
    },
    questions: shuffled.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      options: q.options, // Prisma returns this as the raw JSON value
    })),
    attempts: progress.attempts,
  });
}
