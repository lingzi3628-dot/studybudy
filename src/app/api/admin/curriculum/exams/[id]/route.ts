import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * GET    /api/admin/curriculum/exams/[id] — get exam with questions
 * PATCH  /api/admin/curriculum/exams/[id] — update exam (title, duration, status, etc.)
 * DELETE /api/admin/curriculum/exams/[id] — delete exam
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;

  try {
    const exam = await db.curriculumExam.findUnique({
      where: { id },
      include: {
        grade: { select: { name: true } },
        subject: { select: { name: true, icon: true, color: true } },
        questions: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    return NextResponse.json({ exam });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to load exam" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  if (body?.title) patch.title = body.title;
  if (body?.description !== undefined) patch.description = body.description;
  if (typeof body?.durationMinutes === "number") patch.durationMinutes = body.durationMinutes;
  if (typeof body?.passThreshold === "number") patch.passThreshold = body.passThreshold;
  if (body?.status) patch.status = body.status; // 'draft' | 'published'

  try {
    const updated = await db.curriculumExam.update({
      where: { id },
      data: patch,
    });
    return NextResponse.json({ exam: updated });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to update exam", detail: e?.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;

  try {
    await db.curriculumExam.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to delete exam" }, { status: 500 });
  }
}
