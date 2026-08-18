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
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

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

  // Update lastLogin
  await db.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Log session
  await db.userSession.create({
    data: { userId: user.id, sessionType: "login" },
  }).catch(() => {});

  const token = signUserToken(user.id, email!);
  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      onboardingCompleted: user.onboardingCompleted,
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
