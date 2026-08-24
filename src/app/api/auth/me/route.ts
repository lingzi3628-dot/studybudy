import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyUserToken, getUserCookieName } from "@/lib/user-jwt";
import { getFamilyChild, getFamilyByParent } from "@/lib/family-auth";

export const runtime = "nodejs";

/**
 * GET /api/auth/me — returns the currently authed user (from JWT cookie)
 * or 401 if not authed.
 *
 * Includes monetization fields so the UI can show token balance etc.
 *
 * Also includes family context (best-effort, never throws):
 *   - isFamilyParent: bool  → user owns a Family row
 *   - isFamilyChild: bool   → user is a FamilyChild row
 *   - childProfile / parentFamily summary when applicable
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
      // Monetization fields
      tokenBalance: true,
      currentModel: true,
      planId: true,
      subscriptionExpiry: true,
      tokenResetDate: true,
      encryptedApiKey: true,
    },
  });

  if (!user || user.banned) {
    return NextResponse.json({ authed: false }, { status: 401 });
  }

  // Best-effort family context — never break the auth check if family tables
  // don't exist yet (e.g. right after a deploy before db push ran).
  let familyContext: any = {
    isFamilyParent: false,
    isFamilyChild: false,
  };
  try {
    const child = await getFamilyChild(user.id);
    if (child) {
      familyContext = {
        isFamilyParent: false,
        isFamilyChild: true,
        child: {
          id: child.id,
          username: child.username,
          displayName: child.displayName,
          gradeLevel: child.gradeLevel,
          avatarEmoji: child.avatarEmoji,
          familyId: child.familyId,
        },
      };
    } else {
      const family = await getFamilyByParent(user.id);
      if (family) {
        familyContext = {
          isFamilyParent: true,
          isFamilyChild: false,
          family: {
            id: family.id,
            displayName: family.displayName,
            parentEmail: family.parentEmail,
          },
        };
      }
    }
  } catch (e: any) {
    // Likely P2021 — family tables not yet created. Just skip — the client
    // will treat the user as a normal personal-mode user.
    console.error("family context lookup failed:", e?.message);
  }

  return NextResponse.json({
    authed: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      role: user.role,
      grade: user.grade,
      subjects: user.subjects,
      ambitions: user.ambitions,
      learningLanguage: user.learningLanguage,
      avatarUrl: user.avatarUrl,
      onboardingCompleted: user.onboardingCompleted,
      // Monetization
      tokenBalance: user.tokenBalance ?? 1000,
      currentModel: user.currentModel ?? "study_buddy_free",
      planId: user.planId,
      subscriptionExpiry: user.subscriptionExpiry,
      tokenResetDate: user.tokenResetDate,
      hasApiKey: Boolean(user.encryptedApiKey),
    },
    // Phase 20 — Family Mode context
    ...familyContext,
  });
}
