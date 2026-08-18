import { NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/token-usage?limit=100 — recent token usage logs */
export async function GET() {
  await requireAdminJwt();
  const logs = await db.tokenUsageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } },
  });
  return NextResponse.json({ logs });
}
