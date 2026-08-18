import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/user/usage — current user's token usage history (recent 50 entries)
 *
 * Returns: { entries, totalUsedToday, totalUsedThisMonth, byFeature,
 *            tokenBalance, currentModel, planId, subscriptionExpiry, tokenResetDate }
 *
 * All aggregations are best-effort — if any DB call fails, we still return
 * the user's current token balance from the auth context (always a real number).
 */
export async function GET() {
  const user = await getCurrentUser();

  // Default response — always populated with real numbers
  const result: any = {
    entries: [],
    totalUsedToday: 0,
    totalUsedThisMonth: 0,
    byFeature: {},
    tokenBalance: user.tokenBalance ?? 1000,
    currentModel: user.currentModel ?? "study_buddy_free",
    planId: user.planId,
    subscriptionExpiry: user.subscriptionExpiry,
    tokenResetDate: user.tokenResetDate,
  };

  // Recent usage logs (50 entries)
  try {
    result.entries = await db.tokenUsageLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        feature: true,
        model: true,
        tokensUsed: true,
        costTokens: true,
        createdAt: true,
      },
    });
  } catch (e: any) {
    console.error("usage entries fetch failed:", e?.message);
  }

  // Today's totals
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  try {
    const todayEntries = await db.tokenUsageLog.findMany({
      where: { userId: user.id, createdAt: { gte: todayStart } },
      select: { feature: true, costTokens: true },
    });

    result.totalUsedToday = todayEntries
      .filter((e: any) => e.costTokens > 0)
      .reduce((sum: number, e: any) => sum + e.costTokens, 0);

    const byFeature: Record<string, { count: number; cost: number }> = {};
    for (const e of todayEntries) {
      const key = String(e.feature).replace(/_refund$/, "");
      const sign = e.costTokens < 0 ? -1 : 1;
      if (!byFeature[key]) byFeature[key] = { count: 0, cost: 0 };
      byFeature[key].count += 1;
      byFeature[key].cost += sign * Math.abs(e.costTokens);
    }
    result.byFeature = byFeature;
  } catch (e: any) {
    console.error("usage today fetch failed:", e?.message);
  }

  // This month's total
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  try {
    const monthEntries = await db.tokenUsageLog.findMany({
      where: { userId: user.id, createdAt: { gte: monthStart } },
      select: { costTokens: true },
    });
    result.totalUsedThisMonth = monthEntries
      .filter((e: any) => e.costTokens > 0)
      .reduce((sum: number, e: any) => sum + e.costTokens, 0);
  } catch (e: any) {
    console.error("usage month fetch failed:", e?.message);
  }

  return NextResponse.json(result);
}
