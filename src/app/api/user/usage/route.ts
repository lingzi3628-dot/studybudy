import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/user/usage — current user's token usage history (recent 50 entries)
 *
 * Returns: { entries: TokenUsageLog[], totalUsedToday, totalUsedThisMonth, byFeature }
 */
export async function GET() {
  const user = await getCurrentUser();

  // Recent usage logs (50 entries)
  const entries = await db.tokenUsageLog.findMany({
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
  }).catch(() => []);

  // Today's totals
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEntries = await db.tokenUsageLog.findMany({
    where: { userId: user.id, createdAt: { gte: todayStart } },
    select: { feature: true, costTokens: true },
  }).catch(() => []);

  const totalUsedToday = todayEntries
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

  // This month's total
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEntries = await db.tokenUsageLog.findMany({
    where: { userId: user.id, createdAt: { gte: monthStart } },
    select: { costTokens: true },
  }).catch(() => []);
  const totalUsedThisMonth = monthEntries
    .filter((e: any) => e.costTokens > 0)
    .reduce((sum: number, e: any) => sum + e.costTokens, 0);

  return NextResponse.json({
    entries,
    totalUsedToday,
    totalUsedThisMonth,
    byFeature,
    tokenBalance: user.tokenBalance,
    currentModel: user.currentModel,
    planId: user.planId,
    subscriptionExpiry: user.subscriptionExpiry,
    tokenResetDate: user.tokenResetDate,
  });
}
