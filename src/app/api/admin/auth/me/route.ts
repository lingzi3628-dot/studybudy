import { NextResponse } from "next/server";
import { getOptionalAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * GET /api/admin/auth/me — returns the currently authed admin (from JWT)
 * or 401 if not authed. Used by the AdminLogin screen to decide whether
 * to show the form or skip to the dashboard.
 */
export async function GET() {
  const admin = await getOptionalAdminSession();
  if (!admin) {
    return NextResponse.json({ authed: false }, { status: 401 });
  }
  return NextResponse.json({
    authed: true,
    admin: { id: admin.adminId, email: admin.adminEmail, name: admin.name },
  });
}
