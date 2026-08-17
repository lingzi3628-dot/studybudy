import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/logs/actions?limit=100 — recent admin action logs. */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

  const logs = await db.adminLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      adminUser: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ logs });
}
