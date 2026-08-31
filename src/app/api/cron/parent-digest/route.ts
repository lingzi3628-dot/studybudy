import { NextRequest, NextResponse } from "next/server";
import { runWeeklyParentDigest } from "@/lib/parent-digest";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET|POST /api/cron/parent-digest — Phase 52
 *
 * Sends the weekly parent progress digest to every registered family.
 *
 * Auth (any one of):
 *   - Authorization: Bearer <CRON_SECRET>     (Vercel Cron sets this automatically
 *                                              when the CRON_SECRET env var is defined)
 *   - ?secret=<CRON_SECRET>                    (for simple external cron services)
 *   - ?force=1 with auth                       (email even families with no activity)
 *
 * Vercel Cron (see vercel.json): Mondays 07:00 UTC.
 * Self-hosted cron example:
 *   0 7 * * 1 curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/parent-digest
 */
function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured → refuse (don't allow unauthenticated mass emails)

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const result = await runWeeklyParentDigest({ force });

  return NextResponse.json({
    ok: result.errors.length === 0,
    ...result,
    ranAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
