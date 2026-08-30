import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyUserToken, getUserCookieName } from "@/lib/user-jwt";
import { getFamilyChild, getFamilyByParent } from "@/lib/family-auth";
import { applyDailyResetIfNeeded } from "@/lib/monetization";

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
 *
 * Phase 21b — triggers the daily token reset check on every page load
 * so old accounts (created before Phase 21) immediately get the new
 * 500-token daily allowance without having to wait for their first AI
 * call. For family children, the reset is applied to the PARENT's
 * account (since children don't have their own token balance).
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
      track: true,  // Phase 51
      subjects: true,
      ambitions: true,
      learningLanguage: true,
      avatarUrl: true,
      onboardingCompleted: true,
      emailVerified: true,
      banned: true,
      // Monetization fields
      tokenBalance: true,
      currentModel: true,
      planId: true,
      subscriptionExpiry: true,
      tokenResetDate: true,
      encryptedApiKey: true,
      coinBalance: true,
      freeModelRestingUntil: true,
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
  let billingUserId = user.id; // for token reset — defaults to self
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
      // Children's tokens are billed to the parent — apply the daily reset
      // to the PARENT's account, not the child's.
      billingUserId = child.parentUserId;
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

  // Phase 21b — apply daily reset check on every page load.
  // For family children, this runs against the PARENT's account (so the
  // parent's tokens get refilled, not the child's).
  // Best-effort: never break the auth check if this fails.
  try {
    if (billingUserId === user.id) {
      // Self — apply reset directly to the user we just fetched
      const reset = await applyDailyResetIfNeeded(user.id, {
        tokenBalance: user.tokenBalance ?? 0,
        coinBalance: user.coinBalance ?? 0,
        tokenResetDate: user.tokenResetDate,
        planId: user.planId,
        subscriptionExpiry: user.subscriptionExpiry,
      });
      // Update the values we return to the client
      (user as any).tokenBalance = reset.tokenBalance;
      (user as any).coinBalance = reset.coinBalance;
      (user as any).tokenResetDate = reset.tokenResetDate;
    } else {
      // Family child — apply reset to the parent (best-effort, don't fetch
      // the parent's new balance into the response — the child shouldn't
      // see the parent's token count).
      const parentUser = await db.user.findUnique({
        where: { id: billingUserId },
        select: {
          tokenBalance: true,
          coinBalance: true,
          tokenResetDate: true,
          planId: true,
          subscriptionExpiry: true,
        },
      });
      if (parentUser) {
        await applyDailyResetIfNeeded(billingUserId, parentUser);
      }
    }
  } catch (e: any) {
    console.error("daily reset check failed:", e?.message);
  }

  // Clear any stale resting state (Phase 21 removed the resting feature entirely)
  if (user.freeModelRestingUntil && new Date() < user.freeModelRestingUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { freeModelRestingUntil: null },
    }).catch(() => {});
    (user as any).freeModelRestingUntil = null;
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
      // Monetization — for family children, these are the CHILD's own (empty)
      // balances; the parent's balance is what actually gets billed and is
      // not exposed to the child via this endpoint.
      tokenBalance: familyContext.isFamilyChild ? 0 : user.tokenBalance ?? 0,
      currentModel: user.currentModel ?? "study_buddy_free",
      planId: user.planId,
      subscriptionExpiry: user.subscriptionExpiry,
      tokenResetDate: familyContext.isFamilyChild ? null : user.tokenResetDate,
      hasApiKey: Boolean(user.encryptedApiKey),
      emailVerified: user.emailVerified,
    },
    // Phase 20 — Family Mode context
    ...familyContext,
  });
}
