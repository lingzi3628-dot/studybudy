import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { levelForXp, xpForLevel } from "@/lib/gamify";

export const runtime = "nodejs";

/** GET /api/user/xp — current XP, level, streak, next-level threshold */
export async function GET() {
  const user = await getCurrentUser();

  const xp = await db.userXp.findUnique({
    where: { userId: user.id },
    select: { xpAmount: true, level: true, streakDays: true, lastActivityDate: true },
  }).catch(() => null);

  const xpAmount = xp?.xpAmount ?? 0;
  const level = xp?.level ?? 1;
  const streak = xp?.streakDays ?? 0;

  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = xpAmount - currentLevelXp;
  const xpForNextLevel = nextLevelXp - currentLevelXp;
  const progressPercent = Math.round((xpIntoLevel / xpForNextLevel) * 100);

  return NextResponse.json({
    xp: xpAmount,
    level,
    streak,
    lastActivityDate: xp?.lastActivityDate,
    nextLevel: level + 1,
    xpForNextLevel,
    xpIntoLevel,
    progressPercent,
    tokenBalance: user.tokenBalance,
  });
}
