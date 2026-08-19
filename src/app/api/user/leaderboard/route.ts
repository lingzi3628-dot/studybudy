import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/leaderboard — top 10 users by weekly XP, plus current user's rank */
export async function GET() {
  const user = await getCurrentUser();

  // Top 10 by monthly XP (more stable than weekly which resets often)
  const top10 = await db.leaderboard.findMany({
    orderBy: { monthXp: "desc" },
    take: 10,
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  }).catch(() => []);

  // Get user's rank
  const userEntry = await db.leaderboard.findUnique({
    where: { userId: user.id },
    select: { xpTotal: true, weeklyXp: true, monthXp: true },
  }).catch(() => null);

  const userRank = userEntry
    ? (await db.leaderboard.count({
        where: { monthXp: { gt: userEntry.monthXp } },
      }).catch(() => 0)) + 1
    : null;

  return NextResponse.json({
    top10: top10.map((entry, idx) => ({
      rank: idx + 1,
      userId: entry.userId,
      name: entry.user?.name ?? entry.user?.email?.split("@")[0] ?? "Anonymous",
      avatarUrl: entry.user?.avatarUrl,
      xpTotal: entry.xpTotal,
      weeklyXp: entry.weeklyXp,
      monthXp: entry.monthXp,
      isCurrentUser: entry.userId === user.id,
    })),
    userRank,
    userEntry,
    tokenBalance: user.tokenBalance,
  });
}
