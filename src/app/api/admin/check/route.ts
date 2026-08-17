import { NextResponse } from "next/server";
import { getOptionalAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * GET /api/admin/check — returns whether the current request is authed
 * as an admin (via the JWT cookie). Used by the client to decide whether
 * to show the AdminLogin screen or skip straight to the dashboard.
 *
 * NOTE: This checks the ADMIN JWT cookie, NOT the Clerk user session.
 * The two auth systems are fully separate per the spec.
 */
export async function GET() {
  const admin = await getOptionalAdminSession();
  if (!admin) {
    return NextResponse.json({ isAdmin: false }, { status: 403 });
  }
  return NextResponse.json({
    isAdmin: true,
    admin: { id: admin.adminId, email: admin.adminEmail, name: admin.name },
  });
}
