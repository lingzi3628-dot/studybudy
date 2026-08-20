import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/resting-settings */
export async function GET() {
  await requireAdminJwt();
  let settings = await db.restingSettings.findFirst().catch(() => null);
  if (!settings) {
    settings = await db.restingSettings.create({
      data: { freeRequestsPerHour: 10, cooldownMinutes: 30, wakeCostCoins: 5 },
    }).catch(() => null) ?? null;
  }
  return NextResponse.json(settings ?? {
    freeRequestsPerHour: 10,
    cooldownMinutes: 30,
    wakeCostCoins: 5,
  });
}

/** PUT /api/admin/resting-settings */
export async function PUT(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.freeRequestsPerHour === "number") data.freeRequestsPerHour = Math.max(1, Math.min(1000, body.freeRequestsPerHour));
  if (typeof body.cooldownMinutes === "number") data.cooldownMinutes = Math.max(1, Math.min(1440, body.cooldownMinutes));
  if (typeof body.wakeCostCoins === "number") data.wakeCostCoins = Math.max(0, Math.min(1000, body.wakeCostCoins));

  let existing = await db.restingSettings.findFirst().catch(() => null);
  let result;
  if (existing) {
    result = await db.restingSettings.update({ where: { id: existing.id }, data });
  } else {
    result = await db.restingSettings.create({ data });
  }
  return NextResponse.json({ ok: true, settings: result });
}
