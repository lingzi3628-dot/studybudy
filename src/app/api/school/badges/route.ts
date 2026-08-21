import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSchoolStudent } from "@/lib/school-auth";

export const runtime = "nodejs";

/**
 * GET /api/school/badges
 *
 * Returns all SchoolBadge rows earned by the current student, joined
 * with the topic (name, badgeIcon) and subject (name).
 *
 * Used to render the "My Badges" gallery in the School dashboard.
 */
export async function GET() {
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

  const badges = await db.schoolBadge.findMany({
    where: { studentId: student.id },
    orderBy: { earnedAt: "desc" },
    select: {
      id: true,
      topicId: true,
      earnedAt: true,
      topic: {
        select: {
          id: true,
          name: true,
          badgeIcon: true,
          subject: {
            select: { id: true, name: true, icon: true, color: true },
          },
        },
      },
    },
  }).catch(() => []);

  return NextResponse.json({
    badges: badges.map((b: any) => ({
      id: b.id,
      topicId: b.topicId,
      topicName: b.topic?.name ?? null,
      badgeIcon: b.topic?.badgeIcon ?? null,
      subjectId: b.topic?.subject?.id ?? null,
      subjectName: b.topic?.subject?.name ?? null,
      subjectIcon: b.topic?.subject?.icon ?? null,
      subjectColor: b.topic?.subject?.color ?? null,
      earnedAt: b.earnedAt,
    })),
    badgeCount: badges.length,
  });
}
