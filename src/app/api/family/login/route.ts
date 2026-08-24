import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  signUserToken,
  getUserCookieName,
  getUserCookieMaxAge,
} from "@/lib/user-jwt";

export const runtime = "nodejs";

/**
 * POST /api/family/login
 *
 * Child login — uses username + passcode instead of email + password.
 *
 * Body: { username: string, passcode: string }
 *
 * On success: sets user_token HTTP-only cookie for the CHILD's User row,
 * returns the child's profile.
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

  const username = (body?.username ?? "").toString().trim().toLowerCase();
  const passcode = (body?.passcode ?? "").toString();

  if (!username || !passcode) {
    return NextResponse.json(
      { error: "Username and passcode are required" },
      { status: 400 }
    );
  }

  try {
    // Look up the FamilyChild row by username
    const child = await db.familyChild.findUnique({
      where: { username },
      include: {
        family: true,
      },
    });

    if (!child) {
      return NextResponse.json(
        { error: "Wrong username or passcode" },
        { status: 401 }
      );
    }

    // Verify passcode
    const matches = bcrypt.compareSync(passcode, child.passcodeHash);
    if (!matches) {
      return NextResponse.json(
        { error: "Wrong username or passcode" },
        { status: 401 }
      );
    }

    // Fetch the child's User row
    const childUser = await db.user.findUnique({
      where: { id: child.userId },
    });

    if (!childUser) {
      return NextResponse.json(
        { error: "Child account is corrupted. Please ask a parent to contact support." },
        { status: 500 }
      );
    }

    if (childUser.banned) {
      return NextResponse.json(
        { error: "Your account has been paused. Ask a parent to contact support." },
        { status: 403 }
      );
    }

    // Update lastLogin
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

    // Sign JWT for the child's User row
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
      family: {
        id: child.family.id,
        displayName: child.family.displayName,
        parentEmail: child.family.parentEmail,
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
  } catch (e: any) {
    console.error("family child login error:", e?.message, e?.code);

    if (
      e?.code === "P1001" ||
      /connection|timed out|ECONNREFUSED/i.test(e?.message ?? "")
    ) {
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
