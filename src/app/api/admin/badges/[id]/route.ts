import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** PUT /api/admin/badges/[id] — update a badge */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminJwt();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.slice(0, 100);
  if (typeof body.description === "string") data.description = body.description.slice(0, 300);
  if (typeof body.icon === "string") data.icon = body.icon.slice(0, 10);
  if (body.criteria !== undefined) data.criteria = body.criteria;

  const updated = await db.badge.update({ where: { id }, data }).catch((e: any) => {
    console.error("badge update failed:", e?.message);
    return null;
  });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await logAdminActionViaJwt(admin, "badge.update", { id, data });
  return NextResponse.json({ badge: updated });
}

/** DELETE /api/admin/badges/[id] — delete a badge (also deletes user_badges via cascade) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminJwt();
  const { id } = await params;

  await db.badge.delete({ where: { id } }).catch(() => null);
  await logAdminActionViaJwt(admin, "badge.delete", { id });
  return NextResponse.json({ ok: true });
}
