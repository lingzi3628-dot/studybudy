import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/payment-settings */
export async function GET() {
  await requireAdminJwt();
  const settings = await db.paymentSetting.findMany({ orderBy: { method: "asc" } });
  return NextResponse.json({ settings });
}

/** PUT /api/admin/payment-settings — update a payment method's details */
export async function PUT(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const { method, label, instructions, details, enabled } = body;
  if (!method) return NextResponse.json({ error: "Missing method" }, { status: 400 });

  const setting = await db.paymentSetting.upsert({
    where: { method },
    create: { method, label, instructions, details, enabled },
    update: { label, instructions, details, enabled },
  });
  return NextResponse.json({ setting });
}
