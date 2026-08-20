import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/focus-sessions
 * Body: { topicId?, durationSec, startedAt, endedAt? }
 *
 * Logs a focus (Pomodoro) session. Awards XP based on duration:
 *  - 10 XP per 25-min block completed (capped at 50 XP per session)
 * Free feature, no token cost.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    topicId?: string;
    durationSec: number;
    startedAt?: string;
    endedAt?: string;
  };

  const durationSec = Math.max(60, Math.min(7200, Number(body.durationSec ?? 0)));
  if (!durationSec) {
    return NextResponse.json({ error: "durationSec required" }, { status: 400 });
  }

  const session = await db.focusSession.create({
    data: {
      userId: user.id,
      topicId: body.topicId ?? null,
      durationSec,
      startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
      endedAt: body.endedAt ? new Date(body.endedAt) : new Date(),
    },
  });

  // Award XP: 10 XP per 25-min block, capped at 50
  const xpGained = Math.min(50, Math.floor(durationSec / (25 * 60)) * 10);
  const xpResult = xpGained > 0 ? await awardXp(user.id, xpGained) : { leveledUp: false, newBadges: [] };
  if (xpGained > 0) await recordActivity(user.id, 0);

  return NextResponse.json({
    session,
    xpGained,
    leveledUp: xpResult.leveledUp,
    newBadges: xpResult.newBadges,
  });
}

/**
 * GET /api/focus-sessions — list user's focus sessions + total time
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 30));

  const sessions = await db.focusSession.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true, topicId: true, durationSec: true, startedAt: true, endedAt: true },
  }).catch(() => []);

  const totalSec = sessions.reduce((sum, s) => sum + s.durationSec, 0);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaySec = sessions
    .filter((s) => new Date(s.startedAt) >= todayStart)
    .reduce((sum, s) => sum + s.durationSec, 0);

  return NextResponse.json({
    sessions,
    totalSessions: sessions.length,
    totalSec,
    todaySec,
  });
}
