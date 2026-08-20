import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** PUT /api/admin/pets/[id] */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    emoji?: string;
    description?: string;
    coinCost?: number;
    isPremium?: boolean;
    levelRequired?: number;
  };

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.emoji === "string") data.emoji = body.emoji;
  if (typeof body.description === "string") data.description = body.description || null;
  if (typeof body.coinCost === "number") data.coinCost = Math.max(0, body.coinCost);
  if (typeof body.isPremium === "boolean") data.isPremium = body.isPremium;
  if (typeof body.levelRequired === "number") data.levelRequired = Math.max(1, body.levelRequired);

  const updated = await db.pet.update({ where: { id }, data }).catch((e) => {
    if ((e as any)?.code === "P2002") return "DUPLICATE";
    return null;
  });
  if (updated === "DUPLICATE") {
    return NextResponse.json(
      { error: "A pet with that name already exists." },
      { status: 409 }
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Pet not found." }, { status: 404 });
  }
  await logAdminAction(admin, "pet.update", { petId: id, changes: data });
  return NextResponse.json({ pet: updated });
}

/** DELETE /api/admin/pets/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const deleted = await db.pet.delete({ where: { id } }).catch(() => null);
  if (!deleted) {
    return NextResponse.json({ error: "Pet not found." }, { status: 404 });
  }
  await logAdminAction(admin, "pet.delete", { petId: id });
  return NextResponse.json({ ok: true });
}
