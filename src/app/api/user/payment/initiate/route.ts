import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/user/payment/initiate
 * Body: { planId, paymentMethod }
 *
 * Creates a pending transaction + returns payment instructions.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const planId = (body.planId ?? "").toString();
  const paymentMethod = (body.paymentMethod ?? "").toString();

  if (!planId || !paymentMethod) {
    return NextResponse.json({ error: "Missing planId or paymentMethod" }, { status: 400 });
  }

  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const ps = await db.paymentSetting.findUnique({ where: { method: paymentMethod } });
  if (!ps || !ps.enabled) return NextResponse.json({ error: "Payment method not available" }, { status: 400 });

  // Create pending transaction
  const tx = await db.paymentTransaction.create({
    data: {
      userId: user.id,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency,
      paymentMethod,
      status: "pending",
    },
  });

  return NextResponse.json({
    transactionId: tx.id,
    plan: { name: plan.name, price: plan.price, currency: plan.currency },
    paymentMethod: ps.method,
    label: ps.label,
    instructions: ps.instructions,
    details: ps.details,
  });
}
