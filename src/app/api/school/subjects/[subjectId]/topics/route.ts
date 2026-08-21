import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSchoolStudent } from "@/lib/school-auth";

export const runtime = "nodejs";

/**
 * GET /api/school/subjects/[subjectId]/topics
 *
 * Lists the topics of a subject the current student is enrolled in,
 * ordered by orderIndex. For each topic returns:
 *   { id, name, orderIndex, badgeIcon, status, score?, timeLimitMinutes,
 *     questionCount }
 *
 * `status` is determined by StudentTopicProgress if it exists; otherwise
 * it's computed from the previous topic's completion state:
 *   - The first topic (orderIndex === 0) is 'available'.
 *   - Any other topic is 'locked' if the previous topic isn't 'completed'.
 *
 * Returns 403 if the student isn't enrolled in this subject, and 404 if
 * the subject doesn't exist.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
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

  const { subjectId } = await params;
  if (!subjectId) {
    return NextResponse.json(
      { error: "subjectId is required" },
      { status: 400 }
    );
  }

  // Confirm subject exists.
  const subject = await db.schoolSubject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true, icon: true, color: true, level: true },
  });
  if (!subject) {
    return NextResponse.json(
      { error: "Subject not found" },
      { status: 404 }
    );
  }

  // Confirm enrollment.
  const enrollment = await db.studentSubjectEnrollment.findUnique({
    where: {
      studentId_subjectId: { studentId: student.id, subjectId },
    },
    select: { id: true },
  });
  if (!enrollment) {
    return NextResponse.json(
      { error: "You are not enrolled in this subject" },
      { status: 403 }
    );
  }

  // Pull topics ordered by orderIndex.
  const topics = await db.schoolTopic.findMany({
    where: { subjectId },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      name: true,
      orderIndex: true,
      badgeIcon: true,
      timeLimitMinutes: true,
      questionCount: true,
      passThreshold: true,
    },
  });

  // Pull all progress rows for these topics.
  const progressRows = await db.studentTopicProgress.findMany({
    where: { studentId: student.id, topicId: { in: topics.map((t) => t.id) } },
    select: { topicId: true, status: true, score: true },
  }).catch(() => []);
  const progressByTopic = new Map(
    progressRows.map((p: any) => [p.topicId, p] as [string, any])
  );

  // Determine effective status per topic. The DB row may have been left as
  // 'available' after a previous topic was re-locked (rare), so we always
  // recompute the gating: if the previous topic (by orderIndex) isn't
  // 'completed', this topic must be 'locked'. The first topic is always
  // at least 'available' unless it's already 'completed'.
  const result = topics.map((t, i) => {
    const p = progressByTopic.get(t.id);
    let status = p?.status ?? "locked";

    // Already completed — keep.
    if (status === "completed") {
      // ok
    } else if (i === 0) {
      // First topic: allow 'available'.
      status = status === "available" ? "available" : "available";
    } else {
      // Otherwise, gate by the previous topic's completion.
      const prev = progressByTopic.get(topics[i - 1].id);
      const prevCompleted = prev?.status === "completed";
      status = prevCompleted ? "available" : "locked";
    }

    return {
      id: t.id,
      name: t.name,
      orderIndex: t.orderIndex,
      badgeIcon: t.badgeIcon,
      status,
      score: p?.score ?? null,
      timeLimitMinutes: t.timeLimitMinutes,
      questionCount: t.questionCount,
      passThreshold: t.passThreshold,
    };
  });

  return NextResponse.json({
    subject,
    topics: result,
  });
}
