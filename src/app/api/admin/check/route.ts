import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/** GET /api/admin/check — returns 200 if user is admin, 403 otherwise. Used by client to show admin entry button. */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ isAdmin: true });
  } catch (e: any) {
    return NextResponse.json({ isAdmin: false, error: e?.message }, { status: 403 });
  }
}
