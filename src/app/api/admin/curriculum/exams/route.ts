import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * GET  /api/admin/curriculum/exams?gradeId=...&subjectId=...
 *   List exams (optionally filtered by grade/subject).
 *
 * POST /api/admin/curriculum/exams
 *   body: { gradeId, subjectId, title, description?, durationMinutes?, passThreshold?, schoolId? }
 *   Creates a new exam (draft status by default).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const url = new URL(req.url);
  const gradeId = url.searchParams.get("gradeId") || undefined;
  const subjectId = url.searchParams.get("subjectId") || undefined;

  try {
    const exams = await db.curriculumExam.findMany({
      where: { gradeId, subjectId },
      orderBy: { createdAt: "desc" },
      include: {
        grade: { select: { name: true } },
        subject: { select: { name: true } },
        _count: { select: { questions: true } },
      },
      take: 100,
    });
    return NextResponse.json({ exams });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ exams: [] });
    return NextResponse.json({ error: "Failed to load exams" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const gradeId = (body?.gradeId ?? "").toString().trim();
  const subjectId = (body?.subjectId ?? "").toString().trim();
  const title = (body?.title ?? "").toString().trim();
  const description = (body?.description ?? "").toString().trim() || null;
  const durationMinutes = Number(body?.durationMinutes ?? 30);
  const passThreshold = Number(body?.passThreshold ?? 0.5);
  const schoolId = (body?.schoolId ?? "").toString().trim() || null;

  if (!gradeId || !subjectId || !title) {
    return NextResponse.json(
      { error: "gradeId, subjectId, and title are required" },
      { status: 400 }
    );
  }

  try {
    const exam = await db.curriculumExam.create({
      data: {
        gradeId,
        subjectId,
        title,
        description,
        durationMinutes,
        passThreshold,
        schoolId,
        status: "draft",
      },
    });
    return NextResponse.json({ exam });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to create exam", detail: e?.message },
      { status: 500 }
    );
  }
}
