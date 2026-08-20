import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const DEFAULTS = {
  durationMinutes: 30,
  testIntervalMin: 10,
  tokenCost: 50,
  passThreshold: 0.7,
  coinReward: 10,
  xpReward: 20,
  dailyLimit: 1,
};

/**
 * GET /api/admin/classroom-settings
 * Returns current classroom settings (or defaults if none configured).
 */
export async function GET() {
  await requireAdminJwt();
  let settings: any = null;
  try {
    settings = await db.classroomSettings.findFirst();
  } catch (e: any) {
    console.error("ClassroomSettings fetch failed:", e?.message);
  }

  const response = {
    id: settings?.id ?? null,
    durationMinutes: settings?.durationMinutes ?? DEFAULTS.durationMinutes,
    testIntervalMin: settings?.testIntervalMin ?? DEFAULTS.testIntervalMin,
    tokenCost: settings?.tokenCost ?? DEFAULTS.tokenCost,
    passThreshold: settings?.passThreshold ?? DEFAULTS.passThreshold,
    coinReward: settings?.coinReward ?? DEFAULTS.coinReward,
    xpReward: settings?.xpReward ?? DEFAULTS.xpReward,
    dailyLimit: settings?.dailyLimit ?? DEFAULTS.dailyLimit,
    updatedAt: settings?.updatedAt ?? null,
  };

  return NextResponse.json(response);
}

/**
 * PUT /api/admin/classroom-settings
 * Body: { durationMinutes?, testIntervalMin?, tokenCost?, passThreshold?, coinReward?, xpReward?, dailyLimit? }
 * Updates (or creates) the global classroom settings.
 */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.durationMinutes === "number") {
    data.durationMinutes = Math.max(5, Math.min(180, Math.floor(body.durationMinutes)));
  }
  if (typeof body.testIntervalMin === "number") {
    data.testIntervalMin = Math.max(1, Math.min(60, Math.floor(body.testIntervalMin)));
  }
  if (typeof body.tokenCost === "number") {
    data.tokenCost = Math.max(0, Math.min(10000, Math.floor(body.tokenCost)));
  }
  if (typeof body.passThreshold === "number") {
    data.passThreshold = Math.max(0, Math.min(1, body.passThreshold));
  }
  if (typeof body.coinReward === "number") {
    data.coinReward = Math.max(0, Math.min(1000, Math.floor(body.coinReward)));
  }
  if (typeof body.xpReward === "number") {
    data.xpReward = Math.max(0, Math.min(1000, Math.floor(body.xpReward)));
  }
  if (typeof body.dailyLimit === "number") {
    data.dailyLimit = Math.max(0, Math.min(100, Math.floor(body.dailyLimit)));
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Provide at least one setting to update." },
      { status: 400 }
    );
  }

  let settings: any = null;
  try {
    const existing = await db.classroomSettings.findFirst();
    if (existing) {
      settings = await db.classroomSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      settings = await db.classroomSettings.create({
        data: { ...DEFAULTS, ...data },
      });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
  }

  await logAdminActionViaJwt(admin, "classroom_settings.update", data);

  return NextResponse.json({
    ok: true,
    settings: {
      id: settings.id,
      durationMinutes: settings.durationMinutes,
      testIntervalMin: settings.testIntervalMin,
      tokenCost: settings.tokenCost,
      passThreshold: settings.passThreshold,
      coinReward: settings.coinReward,
      xpReward: settings.xpReward,
      dailyLimit: settings.dailyLimit,
      updatedAt: settings.updatedAt,
    },
  });
}
