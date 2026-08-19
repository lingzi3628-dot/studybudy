import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/badges — list of all badges + which ones the user has earned */
export async function GET() {
  const user = await getCurrentUser();

  const [allBadges, earned] = await Promise.all([
    db.badge.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, description: true, icon: true, criteria: true },
    }).catch(() => [] as any[]),
    db.userBadge.findMany({
      where: { userId: user.id },
      select: { badgeId: true, earnedAt: true },
    }).catch(() => [] as any[]),
  ]);

  const earnedMap = new Map(earned.map((b) => [b.badgeId, b.earnedAt] as [string, any]));

  return NextResponse.json({
    badges: allBadges.map((b: any) => ({
      ...b,
      earned: earnedMap.has(b.id),
      earnedAt: earnedMap.get(b.id) ?? null,
    })),
    earnedCount: earned.length,
    totalCount: allBadges.length,
    tokenBalance: user.tokenBalance,
  });
}
