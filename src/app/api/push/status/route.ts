import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPushConfigured } from "@/lib/push";

export const runtime = "nodejs";

/**
 * GET /api/push/status — Phase 52
 *
 * Client asks: is push configured on the server (VAPID keys present),
 * and how many devices does this user have registered?
 */
export async function GET() {
  let user: any = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Not logged in — still report whether push is configured
  }

  let deviceCount = 0;
  if (user) {
    deviceCount = await db.pushSubscription.count({
      where: { userId: user.id },
    });
  }

  return NextResponse.json({
    configured: isPushConfigured(),
    devices: deviceCount,
    supported: true, // client also checks 'PushManager' in window
  });
}
