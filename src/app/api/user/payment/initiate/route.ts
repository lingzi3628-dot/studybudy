import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const FALLBACK_SETTINGS: Record<string, any> = {
  mpesa: { label: "M-Pesa", instructions: "Send money to M-Pesa Paybill:", details: { paybill: "4040404", account: "StudyBuddy" } },
  binance: { label: "Binance Pay", instructions: "Send USDT via Binance Pay ID:", details: { binanceId: "123456789" } },
  minipay: { label: "MiniPay", instructions: "Send payment via MiniPay:", details: { address: "0x1234...abcd" } },
  paypal: { label: "PayPal", instructions: "Send payment to PayPal email:", details: { email: "payments@studybuddy.ai" } },
  bank: { label: "Bank Transfer", instructions: "Transfer to bank account:", details: { bank: "Equity Bank", account: "0123456789", name: "StudyBuddy AI Ltd" } },
};

/**
 * POST /api/user/payment/initiate
 * Body: { planId, paymentMethod }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const planId = (body.planId ?? "").toString();
    const paymentMethod = (body.paymentMethod ?? "").toString();

    if (!planId || !paymentMethod) {
      return NextResponse.json({ error: "Missing planId or paymentMethod" }, { status: 400 });
    }

    // Try to get plan from DB, fall back to hardcoded
    let plan: { id: string; name: string; price: number; currency: string } | null = null;
    try {
      plan = await db.plan.findUnique({ where: { id: planId } });
    } catch { /* table might not exist */ }

    // Fallback plan data
    if (!plan) {
      const FALLBACK_PLANS: Record<string, any> = {
        free: { id: "free", name: "Study Buddy Free", price: 0, currency: "USD" },
        plus: { id: "plus", name: "Study Buddy Plus", price: 4.99, currency: "USD" },
        pro: { id: "pro", name: "Study Buddy Pro", price: 9.99, currency: "USD" },
        king: { id: "king", name: "Study Buddy King", price: 19.99, currency: "USD" },
        ultra: { id: "ultra", name: "Study Buddy Ultra", price: 29.99, currency: "USD" },
        teddy: { id: "teddy", name: "Study Buddy Teddy", price: 39.99, currency: "USD" },
        photo: { id: "photo", name: "Study Buddy Photo", price: 14.99, currency: "USD" },
      };
      plan = FALLBACK_PLANS[planId] ?? { id: planId, name: "Unknown", price: 0, currency: "USD" };
    }

    // Get payment settings (try DB, fall back)
    let ps: any = FALLBACK_SETTINGS[paymentMethod];
    try {
      const dbPs = await db.paymentSetting.findUnique({ where: { method: paymentMethod } });
      if (dbPs) ps = dbPs;
    } catch { /* table might not exist */ }

    if (!ps) {
      return NextResponse.json({ error: "Payment method not available" }, { status: 400 });
    }

    // Create pending transaction (try DB, skip if fails)
    let txId = "fallback-" + Date.now();
    try {
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
      txId = tx.id;
    } catch { /* table might not exist, use fallback ID */ }

    return NextResponse.json({
      transactionId: txId,
      plan: { name: plan.name, price: plan.price, currency: plan.currency },
      paymentMethod: paymentMethod,
      label: ps.label,
      instructions: ps.instructions,
      details: ps.details,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to initiate payment. Please try again." }, { status: 500 });
  }
}
