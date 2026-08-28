import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendPendingNotificationsForUser } from "@/lib/notifications-send";

export const runtime = "nodejs";

/**
 * POST /api/notifications/send
 *
 * Flushes the current user's pending NotificationLog rows via real
 * channels (email via nodemailer if SMTP env vars are set; WhatsApp/SMS
 * is a no-op until a paid gateway is wired up).
 *
 * Body:
 *   { userId?: string }   — admin can pass another user's id
 *
 * Response:
 *   { ok: true, sent, failed, skipped }
 *
 * This endpoint is called:
 *   - On user login (best-effort, so users see real email notifications when
 *     they arrive at the app)
 *   - On a cron schedule (planned)
 *   - Manually from the admin panel
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { userId?: string };
  const targetUserId = body.userId ?? user.id;

  const result = await sendPendingNotificationsForUser(targetUserId);
  return NextResponse.json({ ok: true, ...result });
}
