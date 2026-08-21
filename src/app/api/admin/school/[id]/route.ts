import { NextRequest, NextResponse } from "next/server";
import {
  requireAdminJwt as requireAdmin,
  logAdminActionViaJwt as logAdminAction,
} from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/school/[id]
 *
 * Fetches a single School with its student count. Returns 404 if not found.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;
  const school = await db.school.findUnique({
    where: { id },
    include: { _count: { select: { students: true } } },
  }).catch(() => null);
  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }
  return NextResponse.json({ school });
}

/**
 * PUT /api/admin/school/[id]
 * Body: { name?, level?, county? }
 *
 * Updates one or more fields on a School. `level` (if provided) must be
 * 'primary' or 'secondary'. `name` must remain unique.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    level?: string;
    county?: string;
  };

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.level === "string") {
    const lvl = body.level.trim().toLowerCase();
    if (lvl !== "primary" && lvl !== "secondary") {
      return NextResponse.json(
        { error: "level must be 'primary' or 'secondary'" },
        { status: 400 }
      );
    }
    data.level = lvl;
  }
  if (typeof body.county === "string") data.county = body.county.trim() || null;

  const updated = await db.school
    .update({ where: { id }, data })
    .catch((e) => {
      if ((e as any)?.code === "P2002") return "DUPLICATE";
      if ((e as any)?.code === "P2025") return "NOT_FOUND";
      return null;
    });

  if (updated === "DUPLICATE") {
    return NextResponse.json(
      { error: "A school with that name already exists." },
      { status: 409 }
    );
  }
  if (updated === "NOT_FOUND") {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
  await logAdminAction(admin, "school.update", { schoolId: id, changes: data });
  return NextResponse.json({ school: updated });
}

/**
 * DELETE /api/admin/school/[id]
 *
 * Deletes a School. All SchoolStudent rows referencing this school have
 * their schoolId set to NULL (onDelete: SetNull in the schema). Returns
 * 404 if the school doesn't exist.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const deleted = await db.school.delete({ where: { id } }).catch((e) => {
    if ((e as any)?.code === "P2025") return "NOT_FOUND";
    return null;
  });
  if (deleted === "NOT_FOUND") {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }
  if (!deleted) {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
  await logAdminAction(admin, "school.delete", { schoolId: id });
  return NextResponse.json({ ok: true });
}
