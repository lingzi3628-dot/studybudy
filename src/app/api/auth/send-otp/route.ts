import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, emailVerificationOtp } from "@/lib/email";
import { randomInt } from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/auth/send-otp
 * Body: { email, purpose: 'signup' | 'family_child', payload?: { childName } }
 *
 * Generates a 6-digit OTP, saves it to the DB (expires in 10 min),
 * and sends a beautiful HTML email with the code.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const purpose = (body?.purpose ?? "signup").toString().trim();
  const payload = body?.payload ?? null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  if (!["signup", "family_child"].includes(purpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }

  try {
    // Generate a 6-digit OTP
    const otp = String(randomInt(100000, 999999));
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 min expiry

    // Delete old OTPs for this email + purpose
    await db.emailOtp.deleteMany({
      where: { email, purpose },
    }).catch(() => {});

    // Save the new OTP
    await db.emailOtp.create({
      data: { email, otp, purpose, payload, expiresAt },
    });

    // Send the email
    if (purpose === "signup") {
      const { subject, html } = emailVerificationOtp({
        name: null,
        email,
        otp,
      });
      await sendEmail({ to: email, subject, html });
    } else if (purpose === "family_child") {
      const childName = (payload as any)?.childName ?? "your child";
      const { subject, html } = emailVerificationOtp({
        name: null,
        email,
        otp,
      });
      // Use the family child confirmation template
      const { sendEmail: sendMail2 } = await import("@/lib/email");
      const { familyChildConfirmationOtp } = await import("@/lib/email");
      const template = familyChildConfirmationOtp({
        parentName: null,
        parentEmail: email,
        childName,
        otp,
      });
      await sendMail2({ to: email, subject: template.subject, html: template.html });
    }

    return NextResponse.json({
      ok: true,
      message: `A verification code has been sent to ${email}`,
    });
  } catch (e: any) {
    console.error("send-otp error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't send the verification code right now. Please try again." },
      { status: 500 }
    );
  }
}
