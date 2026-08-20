import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/onboarding/complete
 * Body: (optional) { redirect?: "dashboard" | "home" }
 *
 * Phase 17 — Onboarding completion.
 *
 * Marks user.onboardingCompleted=true and returns where the client should
 * navigate next. Default redirect is "/dashboard" if the user has created
 * their onboarding learning path (UserActivePath exists or
 * onboardingPathCreated=true), otherwise "home".
 *
 * 200 = success
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { redirect?: string };

  // Idempotent: setting onboardingCompleted=true is safe to call repeatedly.
  await db.user.update({
    where: { id: user.id },
    data: { onboardingCompleted: true },
  }).catch((e: any) => {
    console.error("onboarding complete update failed:", e?.message);
  });

  // Best-effort: bump activity + small XP bump for finishing onboarding
  await recordActivity(user.id, 10).catch(() => {});
  void awardXp(user.id, 10).catch(() => {});

  // Decide where to send the user next. Default to dashboard when the
  // onboarding path has been created; otherwise home.
  let redirect: string = "home";
  if (body.redirect === "dashboard" || body.redirect === "home") {
    redirect = body.redirect;
  } else {
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: { onboardingPathCreated: true },
    }).catch(() => null);
    const hasActivePath = await db.userActivePath.findFirst({
      where: { userId: user.id },
      select: { id: true },
    }).catch(() => null);
    if (fresh?.onboardingPathCreated || hasActivePath) {
      redirect = "dashboard";
    }
  }

  return NextResponse.json({ redirect });
}
