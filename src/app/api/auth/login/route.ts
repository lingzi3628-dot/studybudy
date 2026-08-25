import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signUserToken, getUserCookieName, getUserCookieMaxAge } from "@/lib/user-jwt";

export const runtime = "nodejs";

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Verifies bcrypt password against users table.
 * Sets HTTP-only JWT cookie on success.
 * Returns user profile + tokenBalance so client can render immediately.
 *
 * Wrapped in try/catch — handles Neon connection issues gracefully.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const password = (body?.password ?? "").toString();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const matches = bcrypt.compareSync(password, user.passwordHash);
    if (!matches) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (user.banned) {
      return NextResponse.json({ error: "Account banned. Contact support." }, { status: 403 });
    }

    // Phase 23b — Block login if email not verified
    if (!user.emailVerified) {
      // Auto-send a new verification OTP
      const { randomInt } = await import("crypto");
      const { sendEmail, emailVerificationOtp } = await import("@/lib/email");
      const otp = String(randomInt(100000, 999999));
      const otpExpiresAt = new Date();
      otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10);

      await db.emailOtp.deleteMany({
        where: { email, purpose: "signup" },
      }).catch(() => {});

      await db.emailOtp.create({
        data: { email, otp, purpose: "signup", expiresAt: otpExpiresAt },
      }).catch(() => {});

      const { subject, html } = emailVerificationOtp({
        name: user.name,
        email,
        otp,
      });
      sendEmail({ to: email, subject, html }).catch(() => {});

      // Set a temp cookie so the client can access the verification screen
      const tempToken = signUserToken(user.id, email!);
      const res = NextResponse.json({
        ok: false,
        needsEmailVerification: true,
        error: "Please verify your email to continue. We've sent a new code to your email.",
      });
      res.cookies.set(getUserCookieName(), tempToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: getUserCookieMaxAge(),
        path: "/",
      });
      return res;
    }

    // Update lastLogin
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Log session (best-effort)
    await db.userSession.create({
      data: { userId: user.id, sessionType: "login" },
    }).catch((e: any) => console.error("session log failed:", e?.message));

    const token = signUserToken(user.id, email!);
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        onboardingCompleted: user.onboardingCompleted,
        tokenBalance: user.tokenBalance ?? 1000,
        currentModel: user.currentModel ?? "study_buddy_free",
        planId: user.planId,
        subscriptionExpiry: user.subscriptionExpiry,
        hasApiKey: Boolean(user.encryptedApiKey),
      },
    });

    res.cookies.set(getUserCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: getUserCookieMaxAge(),
      path: "/",
    });

    return res;
  } catch (e: any) {
    console.error("login error:", e?.message, e?.code);

    // Prisma connection errors
    if (e?.code === "P1001" || /connection|timed out|ECONNREFUSED/i.test(e?.message ?? "")) {
      return NextResponse.json(
        { error: "Could not connect to the database. Please try again in a moment." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "We couldn't sign you in right now. Please try again.", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
