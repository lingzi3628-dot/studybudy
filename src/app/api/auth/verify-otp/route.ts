import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp, purpose: 'signup' | 'family_child' }
 *
 * Verifies the OTP. If correct, marks it as verified + returns the payload
 * (e.g. for family_child, the payload contains the childName so the client
 * knows which child was confirmed).
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const otp = (body?.otp ?? "").toString().trim();
  const purpose = (body?.purpose ?? "signup").toString().trim();

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and OTP code are required" }, { status: 400 });
  }

  try {
    // Find the OTP
    const record = await db.emailOtp.findFirst({
      where: { email, otp, purpose },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    if (record.verifiedAt) {
      return NextResponse.json({ error: "This code has already been used" }, { status: 400 });
    }

    if (new Date() > record.expiresAt) {
      return NextResponse.json({ error: "This code has expired. Please request a new one." }, { status: 400 });
    }

    // Mark as verified
    await db.emailOtp.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      message: "Email verified successfully!",
      payload: record.payload,
    });
  } catch (e: any) {
    console.error("verify-otp error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't verify the code right now. Please try again." },
      { status: 500 }
    );
  }
}
