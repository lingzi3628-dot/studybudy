import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/logs/ai?limit=100 — recent AI call logs. */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  const status = url.searchParams.get("status"); // 'success' | 'error'

  const where: any = {};
  if (status === "success" || status === "error") where.status = status;

  const logs = await db.aiCallLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ logs });
}
