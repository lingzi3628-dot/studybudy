import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/games/playtime — get the user's available play time
 *
 * Calculates earned play time from study sessions:
 *   30 min study → 600s (10 min) play time
 *
 * Returns: { available, totalEarned, totalUsed, studyMinutesToday }
 */
export async function GET() {
  let user;
  try { user = await getCurrentUser(); } catch { return NextResponse.json({ available: 0, studyMinutesToday: 0 }); }

  // Get all study sessions for the user
  const sessions = await db.studySession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []);

  const totalEarned = sessions.reduce((s, sess) => s + (sess.earnedPlaySeconds || 0), 0);
  const totalUsed = 0;

  // Study minutes today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter((s) => new Date(s.createdAt) >= todayStart);
  const studyMinutesToday = todaySessions.reduce((s, sess) => s + Math.floor((sess.durationSec || 0) / 60), 0);

  // Available play time = earned - used
  // For now, let users play if they've studied 30 min today
  const earnedToday = Math.floor(studyMinutesToday / 30) * 600; // 600s per 30 min
  const available = Math.max(0, earnedToday);

  return NextResponse.json({
    available,
    totalEarned,
    totalUsed,
    studyMinutesToday,
  });
}

/**
 * POST /api/games/playtime — consume play time
 * Body: { usedSeconds }
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); } catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({})) as { usedSeconds?: number };
  const usedSeconds = body.usedSeconds || 0;

  // Log the usage (best-effort)
  // In a full implementation, this would deduct from a play_time_balance
  // For now, we just log it
  console.log(`[games] User ${user.id} used ${usedSeconds}s of play time`);

  return NextResponse.json({ ok: true, used: usedSeconds });
}

/**
 * POST /api/games/playtime/study — record a study session (called when user studies)
 * Body: { durationMinutes }
 */
export async function PUT(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); } catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({})) as { durationMinutes?: number };
  const durationMinutes = body.durationMinutes || 0;

  if (durationMinutes < 1) {
    return NextResponse.json({ error: "durationMinutes must be at least 1" }, { status: 400 });
  }

  // Calculate earned play seconds: 30 min study = 600s play
  const earnedPlaySeconds = Math.floor(durationMinutes / 30) * 600;
  const durationSec = durationMinutes * 60;

  const session = await db.studySession.create({
    data: {
      userId: user.id,
      durationSec,
      earnedPlaySeconds,
      endedAt: new Date(),
      status: "completed",
    },
  }).catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Failed to record study session" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    earnedPlaySeconds,
    durationMinutes,
  });
}
