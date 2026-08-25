import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/auth/verify-email
 * Body: { email, otp }
 *
 * Verifies the 6-digit OTP sent during signup. If correct, marks the
 * user as emailVerified=true so they can use the app.
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

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and verification code are required" }, { status: 400 });
  }

  try {
    // Find the OTP record
    const record = await db.emailOtp.findFirst({
      where: { email, otp, purpose: "signup" },
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

    // Mark OTP as verified
    await db.emailOtp.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() },
    });

    // Mark user as emailVerified
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Email verified! Welcome to StudyBuddy AI 🎉",
    });
  } catch (e: any) {
    console.error("verify-email error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't verify the code right now. Please try again." },
      { status: 500 }
    );
  }
}
