import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyUserToken, getUserCookieName } from "@/lib/user-jwt";

export const runtime = "nodejs";

/**
 * GET /api/auth/me — returns the currently authed user (from JWT cookie)
 * or 401 if not authed.
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getUserCookieName())?.value;
  const payload = verifyUserToken(token);

  if (!payload) {
    return NextResponse.json({ authed: false }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      grade: true,
      subjects: true,
      ambitions: true,
      learningLanguage: true,
      avatarUrl: true,
      onboardingCompleted: true,
      banned: true,
    },
  });

  if (!user || user.banned) {
    return NextResponse.json({ authed: false }, { status: 401 });
  }

  return NextResponse.json({
    authed: true,
    user: {
      ...user,
      hasApiKey: false, // TODO: check encryptedApiKey
    },
  });
}
