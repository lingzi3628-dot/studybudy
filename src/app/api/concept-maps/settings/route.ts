import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/concept-maps/settings — public-readable settings for the UI
 *
 * Returns: { enabled, tokenCost, freeDailyLimit, remainingToday, isPremium,
 *            canEdit, canExport, planSlug, planName, tokenBalance }
 *
 * No admin auth required — any logged-in user can read these (they're
 * needed to display the cost badge in the Create menu and Study Room).
 */
export async function GET() {
  const user = await getCurrentUser();

  let settings: any = null;
  try {
    settings = await db.conceptMapSettings.findUnique({ where: { id: 1 } });
  } catch (e: any) {
    console.error("ConceptMapSettings fetch failed:", e?.message);
  }

  const enabled = settings?.enabled ?? true;
  const tokenCost = settings?.tokenCost ?? 300;
  const freeDailyLimit = settings?.freeDailyLimit ?? 1;

  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));

  let remainingToday: number | null = null;
  if (!isPremium) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const usage = await db.dailyUsage.findUnique({
      where: { userId_feature_usageDate: { userId: user.id, feature: "concept_map", usageDate: todayStart } },
    }).catch(() => null);
    const usedToday = usage?.count ?? 0;
    remainingToday = Math.max(0, freeDailyLimit - usedToday);
  }

  const plan = user.planId
    ? await db.plan.findUnique({
        where: { id: user.planId },
        select: { conceptMapEditing: true, conceptMapExport: true, dailyConceptMapLimit: true, slug: true, name: true },
      }).catch(() => null)
    : null;

  return NextResponse.json({
    enabled,
    tokenCost,
    freeDailyLimit,
    isPremium,
    remainingToday,
    planSlug: plan?.slug ?? "free",
    planName: plan?.name ?? "Study Buddy Free",
    canEdit: plan?.conceptMapEditing === true,
    canExport: plan?.conceptMapExport === true,
    planDailyLimit: isPremium ? (plan?.dailyConceptMapLimit ?? null) : freeDailyLimit,
    tokenBalance: user.tokenBalance,
  });
}
