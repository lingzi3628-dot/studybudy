import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/exams?gradeId=...
 *
 * Public — returns all PUBLISHED exams for a grade. Used by the student
 * exam list view.
 */
export async function GET(req: NextRequest) {
  // Best-effort auth — we need the user's grade if gradeId isn't passed
  let gradeId = new URL(req.url).searchParams.get("gradeId") ?? "";

  if (!gradeId) {
    try {
      const user = await getCurrentUser();
      if (user.grade) {
        // Find the curriculum grade matching the user's grade name
        const matchingGrade = await db.curriculumGrade.findFirst({
          where: {
            name: { equals: user.grade, mode: "insensitive" },
            status: "ready",
          },
        });
        if (matchingGrade) gradeId = matchingGrade.id;
      }
    } catch {
      // not authed — return empty
    }
  }

  if (!gradeId) {
    return NextResponse.json({ exams: [] });
  }

  try {
    const exams = await db.curriculumExam.findMany({
      where: { gradeId, status: "published" },
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { name: true, icon: true, color: true } },
        grade: { select: { name: true } },
        _count: { select: { questions: true } },
      },
    });
    return NextResponse.json({
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        durationMinutes: e.durationMinutes,
        passThreshold: e.passThreshold,
        subject: e.subject,
        grade: e.grade,
        questionCount: e._count.questions,
        createdAt: e.createdAt,
      })),
    });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ exams: [] });
    return NextResponse.json({ error: "Failed to load exams" }, { status: 500 });
  }
}
