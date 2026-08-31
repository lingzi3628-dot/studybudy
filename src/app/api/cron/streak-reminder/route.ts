import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isPushConfigured, sendPushToUsers } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET|POST /api/cron/streak-reminder — Phase 53
 *
 * Daily push notification to users whose study streak is ALIVE but who
 * haven't studied yet today: "You're on a 6-day streak — 10 minutes today
 * keeps it alive!" Uses the Phase 52 Web Push stack (lib/push.ts + sw.js),
 * which until now had no scheduled trigger.
 *
 * Auth (any one of):
 *   - Authorization: Bearer <CRON_SECRET>     (Vercel Cron sets this automatically)
 *   - ?secret=<CRON_SECRET>                    (simple external cron services)
 *
 * Query params:
 *   - ?dryRun=1   count recipients, send nothing
 *   - ?force=1    also remind users who ALREADY studied today (debug)
 *
 * Vercel Cron (see vercel.json): daily 17:00 UTC (20:00 Nairobi — evening
 * study window). Self-hosted cron example:
 *   0 17 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/streak-reminder
 *
 * Streak semantics (from Phase 12 gamify.ts): UserXp.streakDays counts
 * consecutive active days; lastActivityDate is the last day the user
 * studied. A reminder is due when streakDays >= 1 AND lastActivityDate
 * < today (UTC midnight boundary — matching how updateStreak computes
 * consecutive days).
 */

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured → refuse (no unauthenticated mass pushes)

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

/** UTC midnight of "today" — the boundary used by updateStreak. */
function utcTodayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "push_not_configured",
      hint: "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (see .env.example)",
      ranAt: new Date().toISOString(),
    });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";

  const todayStart = utcTodayStart();

  // Streak alive (>= 1 day) AND no activity yet today AND the user wants
  // notifications AND has at least one push subscription AND isn't banned.
  const candidates = await db.userXp.findMany({
    where: {
      streakDays: { gte: 1 },
      ...(force ? {} : { OR: [{ lastActivityDate: null }, { lastActivityDate: { lt: todayStart } }] }),
      user: {
        notificationsEnabled: true,
        banned: false,
        pushSubscriptions: { some: {} },
      },
    },
    select: {
      streakDays: true,
      user: { select: { id: true } },
    },
    take: 2000, // hard cap — protects the 60s function budget on huge user bases
  });

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      recipients: candidates.length,
      maxStreak: candidates.reduce((m, c) => Math.max(m, c.streakDays), 0),
      ranAt: new Date().toISOString(),
    });
  }

  const userIds = candidates.map((c) => c.user.id);
  const { sent, pruned } = await sendPushToUsers(userIds, {
    title: "🔥 Keep your streak alive!",
    body:
      candidates.length === 1 && candidates[0].streakDays > 1
        ? `You're on a ${candidates[0].streakDays}-day streak — 10 minutes today keeps it alive!`
        : "10 minutes of study today keeps your streak alive. Let's go!",
    url: "/",
    tag: "streak-reminder",
  });

  return NextResponse.json({
    ok: true,
    recipients: userIds.length,
    pushesSent: sent,
    pruned,
    ranAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
