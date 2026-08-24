import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  signUserToken,
  getUserCookieName,
  getUserCookieMaxAge,
} from "@/lib/user-jwt";
import { getFamilyChild } from "@/lib/family-auth";

export const runtime = "nodejs";

/**
 * POST /api/family/lock-room
 *
 * Used by a Family Child to "Lock My Room" — ends the child's learning
 * session and swaps the user_token cookie back to the PARENT's User row, so
 * the Family Dashboard (with all children portals) is shown again.
 *
 * No body required — the current child user is identified from the JWT cookie.
 *
 * The reverse of /api/family/switch-to-child.
 */
export async function POST() {
  // Verify current user is a family child
  const { getCurrentUser } = await import("@/lib/auth");
  let childUser;
  try {
    childUser = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const child = await getFamilyChild(childUser.id);
  if (!child) {
    return NextResponse.json(
      { error: "Your account is not a family child account." },
      { status: 403 }
    );
  }

  // Fetch the parent's User row
  const parentUser = await db.user.findUnique({
    where: { id: child.parentUserId },
  });

  if (!parentUser) {
    return NextResponse.json(
      { error: "Parent account not found. Please contact support." },
      { status: 500 }
    );
  }

  // Log session logout for the child (best-effort)
  await db.userSession
    .create({ data: { userId: childUser.id, sessionType: "logout" } })
    .catch((e: any) => console.error("session log failed:", e?.message));

  // Sign a new JWT for the PARENT — this swaps the session back to parent.
  const token = signUserToken(parentUser.id, parentUser.email ?? "");

  const res = NextResponse.json({
    ok: true,
    isFamilyParent: true,
    family: {
      id: child.familyId,
    },
    user: {
      id: parentUser.id,
      email: parentUser.email,
      name: parentUser.name,
      onboardingCompleted: parentUser.onboardingCompleted,
      tokenBalance: parentUser.tokenBalance ?? 1000,
      currentModel: parentUser.currentModel ?? "study_buddy_free",
      hasApiKey: Boolean(parentUser.encryptedApiKey),
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
