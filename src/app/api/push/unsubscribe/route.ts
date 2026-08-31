import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/push/unsubscribe — Phase 52
 *
 * Removes a push subscription (when the user disables notifications or the
 * browser reports the subscription is gone).
 * Body: { endpoint: "https://..." }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const endpoint = (body?.endpoint ?? "").toString().trim();

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  // Only delete if it belongs to this user (don't allow cross-user deletes)
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
