import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, forgotPasswordEmail } from "@/lib/email";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Generates a password reset token, saves it to the DB (expires in 1 hour),
 * and sends a beautiful HTML email with a reset link.
 *
 * Security: always returns { ok: true } even if the email doesn't exist —
 * this prevents email enumeration attacks.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  try {
    // Check if user exists
    const user = await db.user.findUnique({ where: { email } });

    if (user) {
      // Generate a secure token
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

      // Delete old tokens for this email
      await db.passwordReset.deleteMany({ where: { email } }).catch(() => {});

      // Save the new token
      await db.passwordReset.create({
        data: { email, token, expiresAt },
      });

      // Build the reset URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://studybudy-chi.vercel.app";
      const resetUrl = `${baseUrl}/?reset=${token}`;

      // Send the email
      const { subject, html } = forgotPasswordEmail({
        name: user.name,
        email,
        resetUrl,
      });

      const result = await sendEmail({ to: email, subject, html });

      if (!result.ok) {
        console.error("Forgot password email failed:", result.error);
        // Still return ok to prevent enumeration
      }
    }

    // Always return ok — even if the email doesn't exist
    return NextResponse.json({
      ok: true,
      message: "If an account exists with that email, a reset link has been sent.",
    });
  } catch (e: any) {
    console.error("forgot-password error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't process your request right now. Please try again." },
      { status: 500 }
    );
  }
}
