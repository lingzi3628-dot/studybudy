import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** PUT /api/admin/model-rental-prices/[id] */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdminJwt();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.coinCost === "number") data.coinCost = Math.max(0, body.coinCost);
  if (typeof body.durationMinutes === "number") data.durationMinutes = Math.max(1, Math.min(10080, body.durationMinutes));

  const updated = await db.modelRentalPrice.update({ where: { id }, data }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ price: updated });
}

/** DELETE /api/admin/model-rental-prices/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdminJwt();
  const { id } = await params;
  await db.modelRentalPrice.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
