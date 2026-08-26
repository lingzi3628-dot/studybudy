import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/exam-papers/[id]
 *
 * Edit a published exam paper's metadata.
 * Body: any subset of { title, description, category, paperType, gradeLevel,
 *   subjectName, schoolName, year, coverImage, durationMin, isPublished, isTrending }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
  if (body.category !== undefined) patch.category = String(body.category);
  if (body.paperType !== undefined) patch.paperType = body.paperType ? String(body.paperType).trim() : null;
  if (body.gradeLevel !== undefined) patch.gradeLevel = body.gradeLevel ? String(body.gradeLevel).trim() : null;
  if (body.subjectName !== undefined) patch.subjectName = body.subjectName ? String(body.subjectName).trim() : null;
  if (body.schoolName !== undefined) patch.schoolName = body.schoolName ? String(body.schoolName).trim() : null;
  if (body.year !== undefined) patch.year = body.year ? Number(body.year) : null;
  if (body.coverImage !== undefined) patch.coverImage = body.coverImage ? String(body.coverImage).trim() : null;
  if (body.durationMin !== undefined) patch.durationMin = Number(body.durationMin) || 60;
  if (body.isPublished !== undefined) patch.isPublished = Boolean(body.isPublished);
  if (body.isTrending !== undefined) patch.isTrending = Boolean(body.isTrending);

  try {
    const updated = await db.examPaper.update({ where: { id }, data: patch });
    return NextResponse.json({ ok: true, paper: updated });
  } catch (e: any) {
    console.error("exam edit error:", e?.message);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
