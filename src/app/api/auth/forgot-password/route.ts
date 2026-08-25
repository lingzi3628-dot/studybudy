import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { randomInt } from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Generates a 6-digit magic code, saves it to EmailOtp table (purpose='forgot_password',
 * 10-min expiry), and sends a beautiful HTML email with the code.
 *
 * The user enters the code on the forgot-password screen (no link to click).
 *
 * Security: always returns { ok: true } even if the email doesn't exist.
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
    const user = await db.user.findUnique({ where: { email } });

    if (user) {
      // Generate a 6-digit magic code
      const code = String(randomInt(100000, 999999));
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      // Delete old codes for this email + purpose
      await db.emailOtp.deleteMany({
        where: { email, purpose: "forgot_password" },
      }).catch(() => {});

      // Save the new code
      await db.emailOtp.create({
        data: { email, otp: code, purpose: "forgot_password", expiresAt },
      });

      // Send the email
      const { subject, html } = forgotPasswordMagicCodeEmail({
        name: user.name,
        email,
        code,
      });

      const result = await sendEmail({ to: email, subject, html });
      if (!result.ok) {
        console.error("Forgot password email failed:", result.error);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "If an account exists with that email, a reset code has been sent.",
    });
  } catch (e: any) {
    console.error("forgot-password error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't process your request right now. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * Beautiful HTML email for the magic code password reset.
 */
function forgotPasswordMagicCodeEmail(opts: {
  name: string | null;
  email: string;
  code: string;
}): { subject: string; html: string } {
  return {
    subject: "🔐 Your StudyBuddy AI password reset code",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:32px 24px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:16px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:28px;font-weight:bold;color:#ffffff;">S</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">StudyBuddy AI</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Your AI study companion</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1f2937;font-weight:600;">Hi ${opts.name || "there"}!</p>
              <p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
                We received a request to reset your password. Use the code below to set a new password:
              </p>
              <div style="text-align:center;margin:24px 0;">
                <div style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:20px 40px;border-radius:16px;">
                  <span style="font-size:36px;font-weight:bold;color:#ffffff;letter-spacing:8px;font-family:'Courier New',monospace;">${opts.code}</span>
                </div>
              </div>
              <p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
                Enter this 6-digit code in the app to reset your password. This code expires in <strong>10 minutes</strong>.
              </p>
              <p style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;padding:12px;font-size:13px;color:#92400E;margin:16px 0;">
                🔒 If you didn't request this, you can safely ignore this email — your password won't change.
              </p>
              <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;">
                This email was sent to ${opts.email} because a password reset was requested.
              </div>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">© 2026 StudyBuddy AI · Nairobi, Kenya</p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
