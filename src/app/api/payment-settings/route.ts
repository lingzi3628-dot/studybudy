import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const FALLBACK = [
  { id: "mpesa", method: "mpesa", label: "M-Pesa", instructions: "Send money to M-Pesa Paybill:", details: { paybill: "4040404", account: "StudyBuddy" }, enabled: true },
  { id: "binance", method: "binance", label: "Binance Pay", instructions: "Send USDT via Binance Pay ID:", details: { binanceId: "123456789" }, enabled: true },
  { id: "minipay", method: "minipay", label: "MiniPay", instructions: "Send payment via MiniPay:", details: { address: "0x1234...abcd" }, enabled: true },
  { id: "paypal", method: "paypal", label: "PayPal", instructions: "Send payment to PayPal email:", details: { email: "payments@studybuddy.ai" }, enabled: true },
  { id: "bank", method: "bank", label: "Bank Transfer", instructions: "Transfer to bank account:", details: { bank: "Equity Bank", account: "0123456789", name: "StudyBuddy AI Ltd" }, enabled: true },
];

/** GET /api/payment-settings — public endpoint (no auth required) */
export async function GET() {
  try {
    const settings = await db.paymentSetting.findMany({
      where: { enabled: true },
      orderBy: { method: "asc" },
    });
    if (settings.length > 0) {
      return NextResponse.json({ settings });
    }
    return NextResponse.json({ settings: FALLBACK });
  } catch {
    return NextResponse.json({ settings: FALLBACK });
  }
}
