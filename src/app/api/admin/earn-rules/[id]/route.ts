import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** PUT /api/admin/earn-rules/[id] */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdminJwt();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.coinReward === "number") data.coinReward = Math.max(0, body.coinReward);
  if (typeof body.xpReward === "number") data.xpReward = Math.max(0, body.xpReward);
  if (typeof body.tokenReward === "number") data.tokenReward = Math.max(0, body.tokenReward);
  if (typeof body.dailyLimit === "number") data.dailyLimit = Math.max(0, body.dailyLimit);

  const updated = await db.earnRule.update({ where: { id }, data }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rule: updated });
}

/** DELETE /api/admin/earn-rules/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdminJwt();
  const { id } = await params;
  await db.earnRule.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
