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
