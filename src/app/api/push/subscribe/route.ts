import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/push/subscribe — Phase 52
 *
 * Saves (or refreshes) a Web Push subscription for the logged-in user.
 * Body: the standard browser PushSubscription JSON:
 * {
 *   endpoint: "https://fcm.googleapis.com/fcm/send/...",
 *   keys: { p256dh: "...", auth: "..." }
 * }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));

  const endpoint = (body?.endpoint ?? "").toString().trim();
  const p256dh = (body?.keys?.p256dh ?? "").toString().trim();
  const auth = (body?.keys?.auth ?? "").toString().trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Invalid subscription — endpoint and keys required" },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh, auth, userAgent },
    update: { userId: user.id, p256dh, auth, userAgent },
  });

  return NextResponse.json({ ok: true });
}
