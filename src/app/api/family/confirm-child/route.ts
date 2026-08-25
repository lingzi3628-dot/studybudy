import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, familyChildConfirmationOtp } from "@/lib/email";
import { randomInt } from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/family/confirm-child
 *
 * Two modes:
 *
 * 1. SEND mode (no `otp` in body):
 *    Body: { parentEmail, childName }
 *    Sends an OTP to the parent's email to confirm the child account.
 *
 * 2. VERIFY mode (with `otp` in body):
 *    Body: { parentEmail, childName, otp }
 *    Verifies the OTP. If correct, marks the child as confirmed.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parentEmail = (body?.parentEmail ?? "").toString().trim().toLowerCase();
  const childName = (body?.childName ?? "").toString().trim();
  const otp = (body?.otp ?? "").toString().trim();

  if (!parentEmail || !childName) {
    return NextResponse.json({ error: "parentEmail and childName are required" }, { status: 400 });
  }

  try {
    // ---- SEND mode ----
    if (!otp) {
      // Generate a 6-digit OTP
      const code = String(randomInt(100000, 999999));
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      // Delete old OTPs for this email + purpose
      await db.emailOtp.deleteMany({
        where: { email: parentEmail, purpose: "family_child" },
      }).catch(() => {});

      // Save the new OTP
      await db.emailOtp.create({
        data: {
          email: parentEmail,
          otp: code,
          purpose: "family_child",
          payload: { childName },
          expiresAt,
        },
      });

      // Send the email
      const { subject, html } = familyChildConfirmationOtp({
        parentName: null,
        parentEmail,
        childName,
        otp: code,
      });

      await sendEmail({ to: parentEmail, subject, html });

      return NextResponse.json({
        ok: true,
        message: `A confirmation code has been sent to ${parentEmail}. Enter it below to confirm ${childName}'s account.`,
      });
    }

    // ---- VERIFY mode ----
    const record = await db.emailOtp.findFirst({
      where: { email: parentEmail, otp, purpose: "family_child" },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return NextResponse.json({ error: "Invalid confirmation code" }, { status: 400 });
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
      message: `${childName}'s account has been confirmed!`,
      childName,
    });
  } catch (e: any) {
    console.error("confirm-child error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't process the confirmation right now. Please try again." },
      { status: 500 }
    );
  }
}
