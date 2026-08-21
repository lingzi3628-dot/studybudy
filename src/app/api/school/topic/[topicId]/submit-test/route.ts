import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSchoolStudent } from "@/lib/school-auth";

export const runtime = "nodejs";

/**
 * POST /api/school/topic/[topicId]/submit-test
 *
 * Body: { answers: [{ questionId, selectedIndex }] }
 *
 * Grades each answer against SchoolQuestion.correctIndex, computes the
 * raw score as a 0-1 fraction (correct / total). If score >= topic's
 * passThreshold:
 *   - Updates StudentTopicProgress to status='completed', saves the score,
 *     sets completedAt=now() (and increments attempts).
 *   - Creates a SchoolBadge for this student/topic (idempotent — if
 *     already exists, no new badge is created).
 *   - Unlocks the NEXT topic in the subject (by orderIndex) — i.e. sets
 *     its StudentTopicProgress status to 'available' (upserting the row
 *     if it doesn't yet exist).
 *
 * If the score is below passThreshold:
 *   - Increments attempts but keeps status as-is (still 'available').
 *   - Saves the score for display.
 *
 * Response:
 *   {
 *     score: number (0-1),
 *     passed: boolean,
 *     correctAnswers: [{ questionId, correctIndex, explanation }],
 *     badgeEarned?: boolean,
 *     nextTopicUnlocked?: boolean
 *   }
 */
export async function POST(
  req: NextRequest,
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const answersRaw = Array.isArray(body?.answers) ? body.answers : [];
  const answers = answersRaw
    .map((a: any) => ({
      questionId: (a?.questionId ?? "").toString(),
      selectedIndex: typeof a?.selectedIndex === "number" ? a.selectedIndex : -1,
    }))
    .filter((a: any) => a.questionId);

  if (answers.length === 0) {
    return NextResponse.json(
      { error: "No answers submitted" },
      { status: 400 }
    );
  }

  // Load the topic + all questions so we can grade.
  const topic = await db.schoolTopic.findUnique({
    where: { id: topicId },
    include: {
      subject: { select: { id: true } },
      questions: {
        select: {
          id: true,
          correctIndex: true,
          explanation: true,
        },
      },
    },
  });
  if (!topic) {
    return NextResponse.json(
      { error: "Topic not found" },
      { status: 404 }
    );
  }

  // Verify enrollment.
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

  // Grade.
  const questionById = new Map(topic.questions.map((q) => [q.id, q]));
  let correct = 0;
  const gradedAnswers: any[] = [];
  for (const ans of answers) {
    const q = questionById.get(ans.questionId);
    if (!q) continue;
    const isCorrect = q.correctIndex === ans.selectedIndex;
    if (isCorrect) correct += 1;
    gradedAnswers.push({
      questionId: q.id,
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? null,
      yourAnswer: ans.selectedIndex,
      correct: isCorrect,
    });
  }

  const total = topic.questions.length || 1;
  const score = correct / total;
  const passed = score >= topic.passThreshold;

  // Find or create the progress row.
  const progress = await db.studentTopicProgress.upsert({
    where: {
      studentId_topicId: { studentId: student.id, topicId },
    },
    update: {
      score,
      ...(passed ? { status: "completed", completedAt: new Date() } : {}),
      attempts: { increment: 1 },
    },
    create: {
      studentId: student.id,
      topicId,
      status: passed ? "completed" : "available",
      score,
      attempts: 1,
      ...(passed ? { completedAt: new Date() } : {}),
    },
    select: { id: true, status: true, attempts: true },
  });

  let badgeEarned = false;
  let nextTopicUnlocked = false;

  if (passed) {
    // Create a SchoolBadge if not already earned. Idempotent on the
    // unique (studentId, topicId) constraint.
    try {
      await db.schoolBadge.create({
        data: { studentId: student.id, topicId },
      });
      badgeEarned = true;
    } catch (e: any) {
      if (e?.code === "P2002") {
        // Already had the badge — that's fine.
        badgeEarned = false;
      } else {
        console.error("badge create failed:", e?.message);
      }
    }

    // Unlock the next topic in this subject (by orderIndex). Only promote
    // to 'available' if the row is currently 'locked' — never downgrade a
    // 'completed' topic back to 'available'.
    const nextTopic = await db.schoolTopic.findFirst({
      where: {
        subjectId: topic.subject.id,
        orderIndex: { gt: topic.orderIndex },
      },
      orderBy: { orderIndex: "asc" },
      select: { id: true, name: true, orderIndex: true },
    });

    if (nextTopic) {
      try {
        // Read current state of the next topic's progress row, if any.
        const existing = await db.studentTopicProgress.findUnique({
          where: {
            studentId_topicId: {
              studentId: student.id,
              topicId: nextTopic.id,
            },
          },
          select: { status: true },
        });

        if (!existing || existing.status === "locked") {
          await db.studentTopicProgress.upsert({
            where: {
              studentId_topicId: {
                studentId: student.id,
                topicId: nextTopic.id,
              },
            },
            update: { status: "available" },
            create: {
              studentId: student.id,
              topicId: nextTopic.id,
              status: "available",
            },
          });
          nextTopicUnlocked = true;
        } else {
          // Already 'available' or 'completed' — no status change, but flag
          // as unlocked since the student can now (still) progress to it.
          nextTopicUnlocked = existing.status === "available";
        }
      } catch (e: any) {
        console.error("unlock next topic failed:", e?.message);
      }
    }
  }

  return NextResponse.json({
    score,
    passed,
    attempts: progress.attempts,
    correctAnswers: gradedAnswers,
    badgeEarned,
    nextTopicUnlocked,
  });
}
