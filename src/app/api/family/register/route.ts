import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  signUserToken,
  getUserCookieName,
  getUserCookieMaxAge,
} from "@/lib/user-jwt";
import {
  synthChildEmail,
  validateUsername,
  validatePasscode,
} from "@/lib/family-auth";

export const runtime = "nodejs";

/**
 * POST /api/family/register
 *
 * Registers a Family Mode parent account. The parent provides their email +
 * password (creating a normal User row), then a list of 2+ children to create.
 * Each child gets their own User row + FamilyChild row, so progress is tracked
 * independently.
 *
 * Body:
 *   {
 *     email: string,            // parent's email
 *     password: string,         // parent's password (>= 6 chars)
 *     displayName?: string,     // "The Smith Family" — optional
 *     children: Array<{
 *       username: string,       // 3-20 chars, [a-zA-Z0-9_]
 *       passcode: string,       // 4-20 chars
 *       displayName: string,    // "Alex"
 *       gradeLevel?: string,    // "Grade 3"
 *       avatarEmoji?: string,   // "🦊"
 *     }>
 *   }
 *
 * On success: sets user_token HTTP-only cookie for the PARENT user.
 * Returns the created family + children (with usernames, so the parent can
 * tell each child what to type at the login screen).
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

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const password = (body?.password ?? "").toString();
  const displayName = (body?.displayName ?? "").toString().trim() || null;
  const childrenRaw = Array.isArray(body?.children) ? body.children : [];

  // --- Basic parent validation ---
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  // --- Children validation ---
  if (childrenRaw.length < 2) {
    return NextResponse.json(
      { error: "Family Mode requires at least 2 children" },
      { status: 400 }
    );
  }
  if (childrenRaw.length > 10) {
    return NextResponse.json(
      { error: "Family Mode supports at most 10 children" },
      { status: 400 }
    );
  }

  // Normalize + validate each child
  const children: Array<{
    username: string;
    passcode: string;
    displayName: string;
    gradeLevel: string | null;
    avatarEmoji: string | null;
  }> = [];

  const seenUsernames = new Set<string>();
  for (let i = 0; i < childrenRaw.length; i++) {
    const c = childrenRaw[i] ?? {};
    const username = (c.username ?? "").toString().trim();
    const passcode = (c.passcode ?? "").toString();
    const childDisplayName = (c.displayName ?? "").toString().trim();
    const gradeLevel = (c.gradeLevel ?? "").toString().trim() || null;
    const avatarEmoji = (c.avatarEmoji ?? "").toString().trim() || null;

    const usernameErr = validateUsername(username);
    if (usernameErr) {
      return NextResponse.json(
        { error: `Child ${i + 1}: ${usernameErr}` },
        { status: 400 }
      );
    }
    const passcodeErr = validatePasscode(passcode);
    if (passcodeErr) {
      return NextResponse.json(
        { error: `Child ${i + 1}: ${passcodeErr}` },
        { status: 400 }
      );
    }
    if (!childDisplayName) {
      return NextResponse.json(
        { error: `Child ${i + 1}: Display name is required` },
        { status: 400 }
      );
    }

    const lower = username.toLowerCase();
    if (seenUsernames.has(lower)) {
      return NextResponse.json(
        { error: `Child ${i + 1}: Username "${username}" is used twice in your list — please make each child's username unique` },
        { status: 400 }
      );
    }
    seenUsernames.add(lower);

    children.push({
      username: lower,
      passcode,
      displayName: childDisplayName,
      gradeLevel,
      avatarEmoji,
    });
  }

  try {
    // --- Check email uniqueness ---
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 }
      );
    }
    const clerkUserId = `direct-${email}`;
    const existingClerk = await db.user.findUnique({
      where: { clerkUserId },
    });
    if (existingClerk) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 }
      );
    }

    // --- Check username uniqueness across the platform ---
    const childUsernames = children.map((c) => c.username);
    const conflictingUsernames = await db.familyChild.findMany({
      where: { username: { in: childUsernames } },
      select: { username: true },
    });
    if (conflictingUsernames.length > 0) {
      const taken = conflictingUsernames.map((c) => c.username).join(", ");
      return NextResponse.json(
        {
          error: `Sorry, these usernames are already taken by another family: ${taken}. Please pick different ones.`,
          takenUsernames: taken,
        },
        { status: 409 }
      );
    }

    // --- Create the parent User row (same pattern as /api/auth/register) ---
    const parentPasswordHash = bcrypt.hashSync(password, 10);
    const tokenResetDate = new Date();
    tokenResetDate.setMonth(tokenResetDate.getMonth() + 1);

    const parentUser = await db.user.create({
      data: {
        clerkUserId,
        email,
        name: displayName ?? email.split("@")[0],
        passwordHash: parentPasswordHash,
        lastLogin: new Date(),
        tokenBalance: 1000,
        currentModel: "study_buddy_free",
        tokenResetDate,
        onboardingCompleted: true,
        // Mark this user's role as a family parent
        role: "family_parent",
      },
    });

    // --- Log session (best-effort) ---
    await db.userSession
      .create({ data: { userId: parentUser.id, sessionType: "login" } })
      .catch((e: any) => console.error("session log failed:", e?.message));

    // --- Create the Family row ---
    const family = await db.family.create({
      data: {
        parentUserId: parentUser.id,
        parentEmail: email,
        displayName,
      },
    });

    // --- Create each child: User row + FamilyChild row ---
    const createdChildren: Array<{
      id: string;
      username: string;
      displayName: string;
      gradeLevel: string | null;
      avatarEmoji: string | null;
    }> = [];

    for (const c of children) {
      const childEmail = synthChildEmail(c.username, family.id);
      const childClerkId = `family-child-${c.username}-${family.id.slice(0, 8)}`;
      const childPasswordHash = bcrypt.hashSync(c.passcode, 10);
      const childTokenReset = new Date();
      childTokenReset.setMonth(childTokenReset.getMonth() + 1);

      const childUser = await db.user.create({
        data: {
          clerkUserId: childClerkId,
          email: childEmail,
          name: c.displayName,
          passwordHash: childPasswordHash,
          lastLogin: new Date(),
          tokenBalance: 200, // smaller allowance for children
          currentModel: "study_buddy_free",
          tokenResetDate: childTokenReset,
          onboardingCompleted: true,
          grade: c.gradeLevel,
          role: "family_child",
        },
      });

      const childRow = await db.familyChild.create({
        data: {
          familyId: family.id,
          userId: childUser.id,
          parentUserId: parentUser.id,
          username: c.username,
          displayName: c.displayName,
          passcodeHash: childPasswordHash,
          gradeLevel: c.gradeLevel,
          avatarEmoji: c.avatarEmoji,
        },
      });

      createdChildren.push({
        id: childRow.id,
        username: childRow.username,
        displayName: childRow.displayName,
        gradeLevel: childRow.gradeLevel,
        avatarEmoji: childRow.avatarEmoji,
      });
    }

    // --- Sign JWT + set HTTP-only cookie for the PARENT ---
    const token = signUserToken(parentUser.id, email);
    const res = NextResponse.json({
      ok: true,
      family: {
        id: family.id,
        displayName: family.displayName,
        parentEmail: family.parentEmail,
      },
      children: createdChildren,
      user: {
        id: parentUser.id,
        email: parentUser.email,
        name: parentUser.name,
        onboardingCompleted: parentUser.onboardingCompleted,
      },
      // Hint to the client — send the parent to a "manage children" screen
      isFamilyParent: true,
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
    console.error("family registration error:", e?.message, e?.code, e?.meta);

    if (e?.code === "P2002") {
      const field = e?.meta?.target?.[0] ?? "field";
      return NextResponse.json(
        {
          error: `An account with this ${field} already exists. Try signing in.`,
        },
        { status: 409 }
      );
    }

    if (
      e?.code === "P1001" ||
      /connection|timed out|ECONNREFUSED/i.test(e?.message ?? "")
    ) {
      return NextResponse.json(
        {
          error:
            "Could not connect to the database. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error:
          "We couldn't create your family account right now. Please try again.",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
