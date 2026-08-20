import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * PUT /api/admin/themes/[id]
 * Body: { name?, description?, backgroundGradient?, accentColor?, secondaryColor?, iconStyle?, isPremium?, coinCost? }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    description?: string;
    backgroundGradient?: string;
    accentColor?: string;
    secondaryColor?: string;
    iconStyle?: string;
    isPremium?: boolean;
    coinCost?: number;
  };

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description || null;
  if (typeof body.backgroundGradient === "string") data.backgroundGradient = body.backgroundGradient;
  if (typeof body.accentColor === "string") data.accentColor = body.accentColor;
  if (typeof body.secondaryColor === "string") data.secondaryColor = body.secondaryColor;
  if (typeof body.iconStyle === "string") data.iconStyle = body.iconStyle;
  if (typeof body.isPremium === "boolean") data.isPremium = body.isPremium;
  if (typeof body.coinCost === "number") data.coinCost = Math.max(0, body.coinCost);

  const updated = await db.roomTheme.update({ where: { id }, data }).catch((e) => {
    if ((e as any)?.code === "P2002") return "DUPLICATE";
    return null;
  });
  if (updated === "DUPLICATE") {
    return NextResponse.json(
      { error: "A theme with that name already exists." },
      { status: 409 }
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Theme not found." }, { status: 404 });
  }
  await logAdminAction(admin, "theme.update", { themeId: id, changes: data });
  return NextResponse.json({ theme: updated });
}

/**
 * DELETE /api/admin/themes/[id]
 * Removes a RoomTheme row. User-room states that reference it by name will
 * fall back to the default ("cozy_library") on the client side.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const deleted = await db.roomTheme.delete({ where: { id } }).catch(() => null);
  if (!deleted) {
    return NextResponse.json({ error: "Theme not found." }, { status: 404 });
  }
  await logAdminAction(admin, "theme.delete", { themeId: id });
  return NextResponse.json({ ok: true });
}
