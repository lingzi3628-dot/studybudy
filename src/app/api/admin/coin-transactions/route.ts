import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/coin-transactions?userId=... — view coin ledger */
export async function GET(req: NextRequest) {
  await requireAdminJwt();
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 100));

  const where: any = {};
  if (userId) where.userId = userId;

  const transactions = await db.coinTransaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, userId: true, amount: true, reason: true, createdAt: true,
      user: { select: { email: true, name: true } },
    },
  }).catch(() => []);

  return NextResponse.json({ transactions });
}
