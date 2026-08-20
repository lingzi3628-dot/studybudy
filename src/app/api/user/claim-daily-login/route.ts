import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { awardAction } from "@/lib/earn";

export const runtime = "nodejs";

/**
 * POST /api/user/claim-daily-login
 *
 * Awards daily login bonus (5 coins + 5 XP) once per day.
 * Also awards streak milestone bonuses if applicable.
 */
export async function POST() {
  const user = await getCurrentUser();

  // Check if already claimed today
  const result = await awardAction(user.id, "login");
  if (result.dailyLimitReached) {
    return NextResponse.json({
      ok: false,
      alreadyClaimed: true,
      message: "You've already claimed today's login bonus. Come back tomorrow!",
    });
  }
  if (!result.awarded) {
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  // Check streak milestones (separately, since these are one-time per milestone)
  const { awardXp, updateStreak } = await import("@/lib/gamify");
  await updateStreak(user.id).catch(() => {});
  const userXp = await (await import("@/lib/db")).db.userXp.findUnique({
    where: { userId: user.id },
    select: { streakDays: true },
  }).catch(() => null);
  const streak = userXp?.streakDays ?? 0;

  let streakBonus: { coins: number; tokens: number } | null = null;
  if (streak >= 3 && streak < 7) {
    const r = await awardAction(user.id, "streak_3");
    if (r.awarded) streakBonus = { coins: r.coins, tokens: r.tokens };
  } else if (streak >= 7 && streak < 30) {
    const r = await awardAction(user.id, "streak_7");
    if (r.awarded) streakBonus = { coins: r.coins, tokens: r.tokens };
  } else if (streak >= 30) {
    const r = await awardAction(user.id, "streak_30");
    if (r.awarded) streakBonus = { coins: r.coins, tokens: r.tokens };
  }

  return NextResponse.json({
    ok: true,
    coins: result.coins,
    xp: result.xp,
    tokens: result.tokens,
    streakBonus,
    streak,
    message: `+${result.coins} coins +${result.xp} XP${streakBonus ? ` +${streakBonus.coins} bonus coins (${streak}-day streak!)` : ""}`,
  });
}
