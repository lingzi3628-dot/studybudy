import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/plans */
export async function GET() {
  await requireAdminJwt();
  const plans = await db.plan.findMany({ orderBy: { price: "asc" }, include: { _count: { select: { users: true } } } });
  return NextResponse.json({ plans });
}

/** POST /api/admin/plans */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const plan = await db.plan.create({ data: body });
  await logAdminActionViaJwt(admin, "plan.create", { planId: plan.id });
  return NextResponse.json({ plan });
}
