import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * GET  /api/admin/curriculum/grades — list all grades (admin view, includes coming_soon)
 * POST /api/admin/curriculum/grades — create a new grade
 *        body: { name, level, orderIndex?, status?, description? }
 * PATCH /api/admin/curriculum/grades — update a grade's status
 *        body: { id, status?, name?, description? }
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  try {
    const grades = await db.curriculumGrade.findMany({
      orderBy: [{ level: "asc" }, { orderIndex: "asc" }],
      include: {
        _count: { select: { subjects: true, sourceDocs: true, exams: true } },
      },
    });
    return NextResponse.json({ grades });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ grades: [], tablesMissing: true });
    }
    return NextResponse.json({ error: "Failed to load grades" }, { status: 500 });
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
  const name = (body?.name ?? "").toString().trim();
  const level = (body?.level ?? "primary").toString().trim();
  const orderIndex = Number(body?.orderIndex ?? 0);
  const status = (body?.status ?? "coming_soon").toString().trim();
  const description = (body?.description ?? "").toString().trim() || null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const grade = await db.curriculumGrade.create({
      data: { name, level, orderIndex, status, description },
    });
    return NextResponse.json({ grade });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Grade name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create grade", detail: e?.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? "").toString().trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patch: any = {};
  if (body?.status) patch.status = body.status;
  if (body?.name) patch.name = body.name;
  if (typeof body?.orderIndex === "number") patch.orderIndex = body.orderIndex;
  if (body?.description !== undefined) patch.description = body.description;

  try {
    const updated = await db.curriculumGrade.update({
      where: { id },
      data: patch,
    });
    return NextResponse.json({ grade: updated });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to update grade", detail: e?.message }, { status: 500 });
  }
}
