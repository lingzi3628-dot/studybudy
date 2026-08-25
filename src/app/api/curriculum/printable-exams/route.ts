import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/printable-exams?subjectId=...&gradeId=...
 *
 * Returns generated exams for printing.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId") || undefined;
  const gradeId = url.searchParams.get("gradeId") || undefined;

  try {
    // Fetch exams without include (avoids relation errors if tables are missing)
    const exams = await db.generatedExam.findMany({
      where: { subjectId, gradeId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Fetch grade + subject names separately (best-effort)
    let gradeName = "";
    let subjectName = "";
    if (exams.length > 0) {
      const first = exams[0];
      try {
        if (first.gradeId) {
          const grade = await db.curriculumGrade.findUnique({
            where: { id: first.gradeId },
            select: { name: true },
          });
          gradeName = grade?.name ?? "";
        }
        if (first.subjectId) {
          const subject = await db.curriculumSubject.findUnique({
            where: { id: first.subjectId },
            select: { name: true, icon: true, color: true },
          });
          subjectName = subject?.name ?? "";
        }
      } catch {}
    }

    return NextResponse.json({
      exams: exams.map((e) => ({
        ...e,
        grade: { name: gradeName },
        subject: { name: subjectName },
      })),
    });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ exams: [] });
    console.error("printable-exams error:", e?.message);
    return NextResponse.json({ exams: [], error: e?.message }, { status: 200 });
  }
}
