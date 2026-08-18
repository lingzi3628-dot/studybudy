import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/user/payment/confirm
 * Body: { transactionId, transactionRef }
 *
 * User submits their payment reference. Status stays 'pending' for admin review.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const transactionId = (body.transactionId ?? "").toString();
  const transactionRef = (body.transactionRef ?? "").toString().trim();

  if (!transactionId || !transactionRef) {
    return NextResponse.json({ error: "Missing transactionId or transactionRef" }, { status: 400 });
  }

  const tx = await db.paymentTransaction.findFirst({
    where: { id: transactionId, userId: user.id },
  });
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (tx.status !== "pending") return NextResponse.json({ error: "Transaction already processed" }, { status: 400 });

  await db.paymentTransaction.update({
    where: { id: transactionId },
    data: { transactionRef, status: "confirmed" },
  });

  return NextResponse.json({
    ok: true,
    message: "Payment confirmation submitted! An admin will review and send your activation key.",
    status: "confirmed",
  });
}
