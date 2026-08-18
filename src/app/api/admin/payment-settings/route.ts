import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const FALLBACK_SETTINGS = [
  { id: "mpesa", method: "mpesa", label: "M-Pesa", instructions: "Send money to M-Pesa Paybill:", details: { paybill: "4040404", account: "StudyBuddy" }, enabled: true },
  { id: "binance", method: "binance", label: "Binance Pay", instructions: "Send USDT via Binance Pay ID:", details: { binanceId: "123456789" }, enabled: true },
  { id: "minipay", method: "minipay", label: "MiniPay", instructions: "Send payment via MiniPay:", details: { address: "0x1234...abcd" }, enabled: true },
  { id: "paypal", method: "paypal", label: "PayPal", instructions: "Send payment to PayPal email:", details: { email: "payments@studybuddy.ai" }, enabled: true },
  { id: "bank", method: "bank", label: "Bank Transfer", instructions: "Transfer to bank account:", details: { bank: "Equity Bank", account: "0123456789", name: "StudyBuddy AI Ltd" }, enabled: true },
];

/** GET /api/admin/payment-settings — with fallback if DB table missing */
export async function GET() {
  try {
    await requireAdminJwt();
  } catch {
    return NextResponse.json({ error: "Admin auth required" }, { status: 401 });
  }
  try {
    const settings = await db.paymentSetting.findMany({ orderBy: { method: "asc" } });
    if (settings.length > 0) {
      return NextResponse.json({ settings });
    }
    return NextResponse.json({ settings: FALLBACK_SETTINGS });
  } catch (e) {
    console.warn("payment-settings DB failed, using fallback:", e?.message);
    return NextResponse.json({ settings: FALLBACK_SETTINGS });
  }
}

/** PUT /api/admin/payment-settings */
export async function PUT(req: NextRequest) {
  try {
    await requireAdminJwt();
  } catch {
    return NextResponse.json({ error: "Admin auth required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { method, label, instructions, details, enabled } = body;
  if (!method) return NextResponse.json({ error: "Missing method" }, { status: 400 });
  try {
    const setting = await db.paymentSetting.upsert({
      where: { method },
      create: { method, label, instructions, details, enabled },
      update: { label, instructions, details, enabled },
    });
    return NextResponse.json({ setting });
  } catch (e) {
    return NextResponse.json({ error: "DB not synced" }, { status: 500 });
  }
}
