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
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();
  const name = (body.name ?? "").toString().trim() || null;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Check if email already exists
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Check clerkUserId uniqueness — use direct-{email} as the clerkUserId for direct-auth users
  const clerkUserId = `direct-${email}`;
  const existingClerk = await db.user.findUnique({ where: { clerkUserId } });
  if (existingClerk) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
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
      passwordHash,
      lastLogin: new Date(),
      tokenBalance: 1000,
      currentModel: "study_buddy_free",
      tokenResetDate,
    },
  });

  // Log session
  await db.userSession.create({
    data: { userId: user.id, sessionType: "login" },
  }).catch(() => {});

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
}
