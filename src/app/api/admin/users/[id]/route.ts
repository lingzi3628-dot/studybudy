import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/admin/users/[id]
 * Body: { plan?, role?, banned? }
 * Update user plan / role / ban status.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (body.plan === "free" || body.plan === "pro") data.plan = body.plan;
  if (body.role === "user" || body.role === "admin") data.role = body.role;
  if (typeof body.banned === "boolean") data.banned = body.banned;

  // Prevent self-ban / self-demotion
  if (id === admin.id) {
    if (data.banned === true || data.role === "user") {
      return NextResponse.json(
        { error: "Cannot ban or demote yourself" },
        { status: 400 }
      );
    }
  }

  const updated = await db.user.update({
    where: { id },
    data,
    select: { id: true, email: true, plan: true, role: true, banned: true },
  });

  await logAdminAction(admin.id, "user.update", { userId: id, changes: data });
  return NextResponse.json({ user: updated });
}

/**
 * DELETE /api/admin/users/[id]
 * Cascade delete user + all associated data.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;

  if (id === admin.id) {
    return NextResponse.json(
      { error: "Cannot delete your own admin account" },
      { status: 400 }
    );
  }

  await db.user.delete({ where: { id } });
  await logAdminAction(admin.id, "user.delete", { userId: id });
  return NextResponse.json({ ok: true });
}
