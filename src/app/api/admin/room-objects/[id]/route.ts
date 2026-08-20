import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const VALID_TYPES = ["furniture", "decoration", "special"];

/** PUT /api/admin/room-objects/[id] */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    type?: string;
    icon?: string;
    description?: string;
    coinCost?: number;
    isPremium?: boolean;
    levelRequired?: number;
  };

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.type === "string") {
    if (!VALID_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    data.type = body.type;
  }
  if (typeof body.icon === "string") data.icon = body.icon;
  if (typeof body.description === "string") data.description = body.description || null;
  if (typeof body.coinCost === "number") data.coinCost = Math.max(0, body.coinCost);
  if (typeof body.isPremium === "boolean") data.isPremium = body.isPremium;
  if (typeof body.levelRequired === "number") data.levelRequired = Math.max(1, body.levelRequired);

  const updated = await db.roomObject.update({ where: { id }, data }).catch((e) => {
    if ((e as any)?.code === "P2002") return "DUPLICATE";
    return null;
  });
  if (updated === "DUPLICATE") {
    return NextResponse.json(
      { error: "An object with that name already exists." },
      { status: 409 }
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Object not found." }, { status: 404 });
  }
  await logAdminAction(admin, "room_object.update", { objectId: id, changes: data });
  return NextResponse.json({ object: updated });
}

/** DELETE /api/admin/room-objects/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const deleted = await db.roomObject.delete({ where: { id } }).catch(() => null);
  if (!deleted) {
    return NextResponse.json({ error: "Object not found." }, { status: 404 });
  }
  await logAdminAction(admin, "room_object.delete", { objectId: id });
  return NextResponse.json({ ok: true });
}
