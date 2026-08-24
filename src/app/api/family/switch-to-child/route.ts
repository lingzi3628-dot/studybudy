import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  signUserToken,
  getUserCookieName,
  getUserCookieMaxAge,
} from "@/lib/user-jwt";
import { getFamilyByParent } from "@/lib/family-auth";

export const runtime = "nodejs";

/**
 * POST /api/family/switch-to-child
 *
 * Used by a Family Parent to "unlock" a child's room. The parent must be
 * currently authenticated. The endpoint verifies the child's passcode, then
 * swaps the user_token cookie to point to the CHILD's User row — so the child
 * sees their own learning dashboard, progress, tokens, etc.
 *
 * Body: { childId: string, passcode: string }
 *
 * The "Lock My Room" action (separate endpoint) reverses this: it swaps the
 * cookie back to the parent's User row.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const childId = (body?.childId ?? "").toString().trim();
  const passcode = (body?.passcode ?? "").toString();

  if (!childId || !passcode) {
    return NextResponse.json(
      { error: "Child ID and passcode are required" },
      { status: 400 }
    );
  }

  // Verify the current user is a family parent
  const { getCurrentUser } = await import("@/lib/auth");
  let parentUser;
  try {
    parentUser = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const family = await getFamilyByParent(parentUser.id);
  if (!family) {
    return NextResponse.json(
      { error: "Your account is not a family parent account." },
      { status: 403 }
    );
  }

  // Find the child row — it must belong to this family
  const child = await db.familyChild.findUnique({
    where: { id: childId },
  });

  if (!child || child.familyId !== family.id) {
    return NextResponse.json(
      { error: "Child not found in your family." },
      { status: 404 }
    );
  }

  // Verify the passcode
  const matches = bcrypt.compareSync(passcode, child.passcodeHash);
  if (!matches) {
    return NextResponse.json(
      { error: "Wrong passcode. Try again." },
      { status: 401 }
    );
  }

  // Fetch the child's User row
  const childUser = await db.user.findUnique({
    where: { id: child.userId },
  });

  if (!childUser) {
    return NextResponse.json(
      { error: "Child account is corrupted. Please contact support." },
      { status: 500 }
    );
  }

  if (childUser.banned) {
    return NextResponse.json(
      { error: "This child's account has been paused." },
      { status: 403 }
    );
  }

  // Update lastLogin timestamps
  await db.user.update({
    where: { id: childUser.id },
    data: { lastLogin: new Date() },
  });
  await db.familyChild.update({
    where: { id: child.id },
    data: { lastLogin: new Date() },
  }).catch(() => {});

  // Log session (best-effort)
  await db.userSession
    .create({ data: { userId: childUser.id, sessionType: "login" } })
    .catch((e: any) => console.error("session log failed:", e?.message));

  // Sign a new JWT for the CHILD's User row — this swaps the session.
  const token = signUserToken(childUser.id, childUser.email ?? "");

  const res = NextResponse.json({
    ok: true,
    isFamilyChild: true,
    child: {
      id: child.id,
      username: child.username,
      displayName: child.displayName,
      gradeLevel: child.gradeLevel,
      avatarEmoji: child.avatarEmoji,
      familyId: child.familyId,
    },
    user: {
      id: childUser.id,
      email: childUser.email,
      name: childUser.name,
      onboardingCompleted: childUser.onboardingCompleted,
      tokenBalance: childUser.tokenBalance ?? 200,
      currentModel: childUser.currentModel ?? "study_buddy_free",
      hasApiKey: Boolean(childUser.encryptedApiKey),
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
