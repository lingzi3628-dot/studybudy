import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSchoolStudent } from "@/lib/school-auth";

export const runtime = "nodejs";

/**
 * GET /api/school/dashboard
 *
 * Returns the school student's dashboard summary:
 *   - The SchoolStudent record (or `{ isSchoolStudent: false }` for
 *     non-school users — used by the client to decide whether to show the
 *     school onboarding flow).
 *   - Enrolled subjects with: totalTopics, completedTopics, badgeCount,
 *     and an optional firstAvailableTopic (the next topic the student can
 *     start). The first topic with status='available' across all subjects
 *     is returned as the "Start here" highlight.
 */
export async function GET() {
  // Import here so we can throw with a 401 if the user isn't authenticated.
  // We use a lazy import pattern because we want to handle that error
  // differently than the "not a school student" case below.
  const { getCurrentUser } = await import("@/lib/auth");
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const student = await getSchoolStudent(user.id);
  if (!student) {
    return NextResponse.json({ isSchoolStudent: false });
  }

  // Pull all enrolled subjects with their topics and progress rows.
  const enrollments = await db.studentSubjectEnrollment.findMany({
    where: { studentId: student.id },
    select: {
      subject: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
          level: true,
          topics: {
            orderBy: { orderIndex: "asc" },
            select: { id: true },
          },
        },
      },
    },
  });

  const topicIds = enrollments.flatMap((en) => en.subject.topics.map((t) => t.id));

  const [progressRows, badgeRows] = await Promise.all([
    db.studentTopicProgress.findMany({
      where: { studentId: student.id, topicId: { in: topicIds } },
      select: { topicId: true, status: true, score: true },
    }).catch(() => [] as any[]),
    db.schoolBadge.findMany({
      where: { studentId: student.id, topicId: { in: topicIds } },
      select: { topicId: true },
    }).catch(() => [] as any[]),
  ]);

  const progressByTopic = new Map(
    progressRows.map((p: any) => [p.topicId, p] as [string, any])
  );
  const badgeTopicIds = new Set(badgeRows.map((b: any) => b.topicId));

  // For the "Start here" highlight: first available topic across all
  // subjects. We need its name + subjectId for the client to deep-link.
  // We re-fetch topic names lazily only if we found one (to avoid N+1).
  let firstAvailableTopic: any = null;
  const subjects = enrollments.map((en) => {
    const subj = en.subject;
    const totalTopics = subj.topics.length;
    const completed = subj.topics.filter(
      (t) => progressByTopic.get(t.id)?.status === "completed"
    ).length;
    const badgeCount = subj.topics.filter((t) => badgeTopicIds.has(t.id)).length;

    if (!firstAvailableTopic) {
      for (const t of subj.topics) {
        if (progressByTopic.get(t.id)?.status === "available") {
          firstAvailableTopic = {
            id: t.id,
            subjectId: subj.id,
            subjectName: subj.name,
            // topic name is fetched separately below to avoid N+1
          };
          break;
        }
      }
    }

    return {
      id: subj.id,
      name: subj.name,
      icon: subj.icon,
      color: subj.color,
      level: subj.level,
      totalTopics,
      completedTopics: completed,
      badgeCount,
    };
  });

  if (firstAvailableTopic) {
    const t = await db.schoolTopic.findUnique({
      where: { id: firstAvailableTopic.id },
      select: { name: true, badgeIcon: true },
    });
    if (t) {
      firstAvailableTopic.topicName = t.name;
      firstAvailableTopic.badgeIcon = t.badgeIcon;
    }
  }

  return NextResponse.json({
    isSchoolStudent: true,
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNumber: student.admissionNumber,
      gradeLevel: student.gradeLevel,
      schoolId: student.schoolId,
    },
    subjects,
    firstAvailableTopic: firstAvailableTopic ?? null,
    totalBadges: badgeTopicIds.size,
  });
}
