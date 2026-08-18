import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/payment/status — check payment + activation status */
export async function GET() {
  const user = await getCurrentUser();
  const txs = await db.paymentTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, status: true, paymentMethod: true, amount: true, planId: true, createdAt: true, activationKeyId: true },
  });
  return NextResponse.json({
    transactions: txs,
    hasActivePlan: Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)),
    currentPlanId: user.planId,
    subscriptionExpiry: user.subscriptionExpiry,
  });
}
