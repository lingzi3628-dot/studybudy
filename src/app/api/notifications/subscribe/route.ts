import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/notifications/subscribe
 * Body: { email, type }
 *
 * Stores an email for maintenance notification.
 * No auth required — public endpoint for the maintenance screen.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const type = (body.type ?? "maintenance_alert").toString();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Log the subscription (best-effort — no DB write needed since the user
  // isn't authenticated. The email is captured in server logs for the admin
  // to collect + send notifications when maintenance ends.)
  console.log(`[maintenance-subscribe] ${email} requested ${type} notification`);

  return NextResponse.json({
    ok: true,
    message: "You'll be notified when we're back!",
  });
}
