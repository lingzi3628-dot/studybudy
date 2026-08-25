import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/auth/reset-password
 * Body: { email, code, newPassword }
 *
 * Verifies the 6-digit magic code, checks expiry, updates the user's password.
 * Marks the code as used so it can't be reused.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const code = (body?.code ?? "").toString().trim();
  const newPassword = (body?.newPassword ?? "").toString();

  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: "Email, code, and new password are required" }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  try {
    // Find the OTP record
    const record = await db.emailOtp.findFirst({
      where: { email, otp: code, purpose: "forgot_password" },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return NextResponse.json({ error: "Invalid reset code" }, { status: 400 });
    }

    if (record.verifiedAt) {
      return NextResponse.json({ error: "This code has already been used" }, { status: 400 });
    }

    if (new Date() > record.expiresAt) {
      return NextResponse.json({ error: "This code has expired. Please request a new one." }, { status: 400 });
    }

    // Find the user
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Hash the new password
    const passwordHash = bcrypt.hashSync(newPassword, 10);

    // Update the password + mark the code as used
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      db.emailOtp.update({
        where: { id: record.id },
        data: { verifiedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message: "Your password has been reset. You can now log in with your new password.",
    });
  } catch (e: any) {
    console.error("reset-password error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't reset your password right now. Please try again." },
      { status: 500 }
    );
  }
}
