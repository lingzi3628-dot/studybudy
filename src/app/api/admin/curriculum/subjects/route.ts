import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/curriculum/subjects?gradeId=...
 *   Returns all subjects for a grade (admin view).
 *
 * POST /api/admin/curriculum/subjects
 *   body: { gradeId, name, icon?, color?, description? }
 *   Creates a new subject.
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

  const gradeId = new URL(req.url).searchParams.get("gradeId") ?? "";
  if (!gradeId) {
    return NextResponse.json({ error: "gradeId is required" }, { status: 400 });
  }

  try {
    const subjects = await db.curriculumSubject.findMany({
      where: { gradeId },
      orderBy: { orderIndex: "asc" },
      include: {
        _count: { select: { topics: true, sourceDocs: true } },
      },
    });
    return NextResponse.json({ subjects });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ subjects: [] });
    return NextResponse.json({ error: "Failed to load subjects" }, { status: 500 });
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
  const name = (body?.name ?? "").toString().trim();
  const icon = (body?.icon ?? "📚").toString().trim();
  const color = (body?.color ?? "#6366F1").toString().trim();
  const description = (body?.description ?? "").toString().trim() || null;

  if (!gradeId || !name) {
    return NextResponse.json({ error: "gradeId and name are required" }, { status: 400 });
  }

  try {
    const subject = await db.curriculumSubject.create({
      data: { gradeId, name, icon, color, description },
    });
    return NextResponse.json({ subject });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Subject name already exists in this grade" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create subject", detail: e?.message }, { status: 500 });
  }
}
