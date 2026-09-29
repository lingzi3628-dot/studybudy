import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const DAILY_FREE_SECONDS = 20 * 60; // 20 minutes free per day
const DAILY_FREE_ACTION = "daily_free_play";

/**
 * GET /api/games/playtime
 *
 * Returns the user's available play time.
 * Sources:
 *   1. Daily free 20 minutes (claimed once per day)
 *   2. Earned from studying (30 min study = 10 min play)
 *   3. Minus used time (tracked via POST)
 *
 * Returns: { available, dailyFreeClaimed, dailyFreeSeconds, studyMinutesToday, earnedFromStudy }
 */
export async function GET() {
  let user;
  try { user = await getCurrentUser(); } catch { return NextResponse.json({ available: 0, dailyFreeClaimed: false, studyMinutesToday: 0 }); }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Check if daily free time was claimed today
  const dailyClaim = await db.studySession.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: todayStart },
      // We store daily free claims as study sessions with a special marker
      // in the lastScreen field
      lastScreen: DAILY_FREE_ACTION,
    },
  }).catch(() => null);

  const dailyFreeClaimed = !!dailyClaim;

  // Get study sessions today (excluding daily free claims)
  const todaySessions = await db.studySession.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: todayStart },
      lastScreen: { not: DAILY_FREE_ACTION },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  }).catch(() => []);

  const studyMinutesToday = todaySessions.reduce((s, sess) => s + Math.floor((sess.durationSec || 0) / 60), 0);
  const earnedFromStudy = Math.floor(studyMinutesToday / 30) * 600; // 600s per 30 min

  // Get all play time usage today (tracked via a separate log)
  const playUsage = await db.studySession.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: todayStart },
      lastScreen: "play_usage",
    },
  }).catch(() => []);

  const totalUsedToday = playUsage.reduce((s, sess) => s + (sess.durationSec || 0), 0);

  // Available = daily free (if claimed) + earned from study - used
  const dailyFree = dailyFreeClaimed ? DAILY_FREE_SECONDS : 0;
  const totalAvailable = Math.max(0, dailyFree + earnedFromStudy - totalUsedToday);

  return NextResponse.json({
    available: totalAvailable,
    dailyFreeClaimed,
    dailyFreeSeconds: DAILY_FREE_SECONDS,
    studyMinutesToday,
    earnedFromStudy,
    totalUsedToday,
  });
}

/**
 * POST /api/games/playtime — claim daily free time OR consume play time
 *
 * Body: { action: "claim_daily" } → claims the 20 min daily free
 * Body: { action: "use", usedSeconds: N } → deduct N seconds
 * Body: { action: "study", durationMinutes: N } → record study session
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); } catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({})) as {
    action?: string;
    usedSeconds?: number;
    durationMinutes?: number;
  };

  const action = body.action || "use";

  if (action === "claim_daily") {
    // Check if already claimed today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await db.studySession.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: todayStart },
        lastScreen: DAILY_FREE_ACTION,
      },
    }).catch(() => null);

    if (existing) {
      return NextResponse.json({ error: "Daily free time already claimed today." }, { status: 409 });
    }

    // Claim it — create a study session record as the claim marker
    await db.studySession.create({
      data: {
        userId: user.id,
        durationSec: 0,
        earnedPlaySeconds: DAILY_FREE_SECONDS,
        endedAt: new Date(),
        status: "completed",
        lastScreen: DAILY_FREE_ACTION,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      claimed: DAILY_FREE_SECONDS,
      message: "You've claimed 20 minutes of free play time! Enjoy your games.",
    });
  }

  if (action === "study") {
    const durationMinutes = body.durationMinutes || 0;
    if (durationMinutes < 1) {
      return NextResponse.json({ error: "durationMinutes must be at least 1" }, { status: 400 });
    }

    const earnedPlaySeconds = Math.floor(durationMinutes / 30) * 600;
    const durationSec = durationMinutes * 60;

    await db.studySession.create({
      data: {
        userId: user.id,
        durationSec,
        earnedPlaySeconds,
        endedAt: new Date(),
        status: "completed",
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, earnedPlaySeconds, durationMinutes });
  }

  // action === "use" — record used play time
  const usedSeconds = body.usedSeconds || 0;
  if (usedSeconds > 0) {
    await db.studySession.create({
      data: {
        userId: user.id,
        durationSec: usedSeconds, // store used seconds here
        earnedPlaySeconds: 0,
        endedAt: new Date(),
        status: "completed",
        lastScreen: "play_usage",
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, used: usedSeconds });
}
