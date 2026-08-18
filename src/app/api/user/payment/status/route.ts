import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/payment/status — check payment + activation status + billing history */
export async function GET() {
  const user = await getCurrentUser();
  const txs = await db.paymentTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      amount: true,
      currency: true,
      transactionRef: true,
      planId: true,
      createdAt: true,
      activationKeyId: true,
      plan: { select: { name: true, slug: true } },
    },
  });
  return NextResponse.json({
    transactions: txs,
    hasActivePlan: Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)),
    currentPlanId: user.planId,
    subscriptionExpiry: user.subscriptionExpiry,
    tokenBalance: user.tokenBalance,
    tokenResetDate: user.tokenResetDate,
  });
}
