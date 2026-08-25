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
    const exams = await db.generatedExam.findMany({
      where: { subjectId, gradeId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        grade: { select: { name: true } },
        subject: { select: { name: true, icon: true, color: true } },
      },
    });
    return NextResponse.json({ exams });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ exams: [] });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
