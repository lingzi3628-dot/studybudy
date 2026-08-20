import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/free-model-status — resting state + remaining cooldown */
export async function GET() {
  const user = await getCurrentUser();

  const settings = await db.restingSettings.findFirst().catch(() => null) ?? {
    freeRequestsPerHour: 10,
    cooldownMinutes: 30,
    wakeCostCoins: 5,
  };

  const restingUntil = user.freeModelRestingUntil;
  const isResting = Boolean(restingUntil && new Date() < restingUntil);
  const remainingSec = isResting ? Math.ceil((restingUntil!.getTime() - Date.now()) / 1000) : 0;

  // Count requests in the last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const hourCount = await db.tokenUsageLog.count({
    where: { userId: user.id, createdAt: { gte: hourAgo } },
  }).catch(() => 0);

  return NextResponse.json({
    isResting,
    restingUntil,
    remainingSec,
    remainingMin: Math.ceil(remainingSec / 60),
    hourCount,
    freeRequestsPerHour: settings.freeRequestsPerHour,
    cooldownMinutes: settings.cooldownMinutes,
    wakeCostCoins: settings.wakeCostCoins,
    canUse: !isResting && hourCount < settings.freeRequestsPerHour,
  });
}
