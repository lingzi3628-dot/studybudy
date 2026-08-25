import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 *
 * Verifies the reset token, checks expiry, updates the user's password.
 * Marks the token as used so it can't be reused.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = (body?.token ?? "").toString().trim();
  const newPassword = (body?.newPassword ?? "").toString();

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  try {
    // Find the token
    const reset = await db.passwordReset.findUnique({ where: { token } });

    if (!reset) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    if (reset.usedAt) {
      return NextResponse.json({ error: "This reset link has already been used" }, { status: 400 });
    }

    if (new Date() > reset.expiresAt) {
      return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
    }

    // Find the user
    const user = await db.user.findUnique({ where: { email: reset.email } });
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Hash the new password
    const passwordHash = bcrypt.hashSync(newPassword, 10);

    // Update the password + mark the token as used
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      db.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
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
