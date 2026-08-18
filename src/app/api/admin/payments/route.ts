import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/** GET /api/admin/payments?status=pending */
export async function GET(req: NextRequest) {
  await requireAdminJwt();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const txs = await db.paymentTransaction.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } }, plan: true },
  });
  return NextResponse.json({ transactions: txs });
}

/**
 * POST /api/admin/payments?action=approve
 * Body: { transactionId }
 *
 * Approves a payment: generates an activation key for the user's plan
 * and links it to the transaction.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const action = (body.action ?? "").toString();
  const transactionId = (body.transactionId ?? "").toString();

  if (!transactionId || !action) {
    return NextResponse.json({ error: "Missing transactionId or action" }, { status: 400 });
  }

  const tx = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    include: { plan: true },
  });
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  if (action === "approve") {
    if (!tx.planId) return NextResponse.json({ error: "No plan linked" }, { status: 400 });

    // Generate activation key
    const gen = () => randomBytes(4).toString("hex").toUpperCase().slice(0, 4);
    const key = `SB-${gen()}-${gen()}-${gen()}-${gen()}`;
    const expiresAt = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

    const activationKey = await db.activationKey.create({
      data: {
        key,
        planId: tx.planId,
        userId: tx.userId,
        createdBy: admin.adminId,
        expiresAt,
      },
    });

    await db.paymentTransaction.update({
      where: { id: transactionId },
      data: { status: "confirmed", activationKeyId: activationKey.id },
    });

    await logAdminActionViaJwt(admin, "payment.approve", { transactionId, keyId: activationKey.id, key });
    return NextResponse.json({ ok: true, key, message: "Payment approved! Activation key generated." });
  }

  if (action === "reject") {
    await db.paymentTransaction.update({
      where: { id: transactionId },
      data: { status: "rejected" },
    });
    await logAdminActionViaJwt(admin, "payment.reject", { transactionId });
    return NextResponse.json({ ok: true, message: "Payment rejected." });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
