import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/user-balances?userId=... — list all users with balances (or specific user) */
export async function GET(req: NextRequest) {
  await requireAdminJwt();
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const q = url.searchParams.get("q"); // search by email

  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true,
        tokenBalance: true, coinBalance: true,
        currentModel: true, planId: true, subscriptionExpiry: true,
        freeModelRestingUntil: true, tokenResetDate: true,
      },
    }).catch(() => null);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ user });
  }

  const where: any = {};
  if (q) where.email = { contains: q, mode: "insensitive" };

  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, email: true, name: true,
      tokenBalance: true, coinBalance: true,
      currentModel: true, planId: true, subscriptionExpiry: true,
    },
  }).catch(() => []);

  return NextResponse.json({ users });
}

/**
 * POST /api/admin/user-balances — manually adjust coins/tokens
 * Body: { userId, coinAdjust?, tokenAdjust?, reason? }
 */
export async function POST(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({})) as {
    userId?: string;
    coinAdjust?: number;
    tokenAdjust?: number;
    reason?: string;
  };

  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: body.userId },
    select: { id: true, coinBalance: true, tokenBalance: true, email: true },
  }).catch(() => null);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: any = {};
  if (typeof body.coinAdjust === "number" && body.coinAdjust !== 0) {
    data.coinBalance = { increment: body.coinAdjust };
    await db.coinTransaction.create({
      data: { userId: user.id, amount: body.coinAdjust, reason: body.reason ?? "admin_adjust" },
    }).catch(() => {});
  }
  if (typeof body.tokenAdjust === "number" && body.tokenAdjust !== 0) {
    data.tokenBalance = { increment: body.tokenAdjust };
    await db.tokenTransaction.create({
      data: { userId: user.id, amount: body.tokenAdjust, reason: body.reason ?? "admin_adjust" },
    }).catch(() => {});
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Provide coinAdjust or tokenAdjust" }, { status: 400 });
  }

  const updated = await db.user.update({ where: { id: user.id }, data, select: { tokenBalance: true, coinBalance: true } });
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, ...updated } });
}
