import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signUserToken, getUserCookieName, getUserCookieMaxAge } from "@/lib/user-jwt";

export const runtime = "nodejs";

/**
 * POST /api/auth/register
 * Body: { email, password, name? }
 *
 * Creates a new user with bcrypt-hashed password.
 * - Default tokenBalance: 1000 (from schema)
 * - Sets tokenResetDate to +1 month so free users get monthly refresh
 * Sets HTTP-only JWT cookie.
 *
 * Wrapped in try/catch — handles Neon connection issues, unique
 * constraint violations, and other DB errors gracefully.
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
  const name = (body?.name ?? "").toString().trim() || null;
  const phoneNumber = (body?.phoneNumber ?? "").toString().trim() || null;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Phone number validation (basic — accepts +254712345678 or 0712345678)
  if (phoneNumber && !/^\+?\d{9,15}$/.test(phoneNumber.replace(/[\s\-()]/g, ""))) {
    return NextResponse.json(
      { error: "Please enter a valid phone number (e.g. +254712345678 or 0712345678)" },
      { status: 400 }
    );
  }

  try {
    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists. Try signing in." }, { status: 409 });
    }

    // Check clerkUserId uniqueness — use direct-{email} as the clerkUserId for direct-auth users
    const clerkUserId = `direct-${email}`;
    const existingClerk = await db.user.findUnique({ where: { clerkUserId } });
    if (existingClerk) {
      return NextResponse.json({ error: "An account with this email already exists. Try signing in." }, { status: 409 });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    // Free users get monthly token reset (1 month from now)
    const tokenResetDate = new Date();
    tokenResetDate.setMonth(tokenResetDate.getMonth() + 1);

    const user = await db.user.create({
      data: {
        clerkUserId,
        email,
        name,
        phoneNumber,
        passwordHash,
        lastLogin: new Date(),
        tokenBalance: 1000,
        currentModel: "study_buddy_free",
        tokenResetDate,
      },
    });

    // Log session (best-effort)
    await db.userSession.create({
      data: { userId: user.id, sessionType: "login" },
    }).catch((e: any) => console.error("session log failed:", e?.message));

    const token = signUserToken(user.id, email);
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        onboardingCompleted: user.onboardingCompleted,
        tokenBalance: user.tokenBalance,
        currentModel: user.currentModel,
        planId: user.planId,
        subscriptionExpiry: user.subscriptionExpiry,
        hasApiKey: false,
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
    console.error("registration error:", e?.message, e?.code, e?.meta);

    // Prisma unique constraint violation
    if (e?.code === "P2002") {
      const field = e?.meta?.target?.[0] ?? "field";
      return NextResponse.json(
        { error: `An account with this ${field} already exists. Try signing in.` },
        { status: 409 }
      );
    }

    // Prisma connection errors
    if (e?.code === "P1001" || /connection|timed out|ECONNREFUSED/i.test(e?.message ?? "")) {
      return NextResponse.json(
        { error: "Could not connect to the database. Please try again in a moment." },
        { status: 503 }
      );
    }

    // Generic fallback
    return NextResponse.json(
      { error: "We couldn't create your account right now. Please try again.", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
