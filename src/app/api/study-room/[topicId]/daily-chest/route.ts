import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/study-room/[topicId]/daily-chest
 *
 * Awards a once-per-day daily chest of:
 *  - random coins (5-20)
 *  - XP (5)
 *  - tokens (2-5)
 *
 * If `lastDailyChestOpened` is today (UTC midnight), returns 409 "already opened".
 * Otherwise:
 *  - deducts/credits the rewards
 *  - logs CoinTransaction (positive) + TokenTransaction (positive)
 *  - awards XP via awardXp
 *  - records activity for streak
 *  - updates lastDailyChestOpened to now
 *
 * Returns the rewards + new balances.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  // Verify topic exists
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Get or create room state
  const room = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: { userId: user.id, topicId, lastVisited: new Date() },
    update: { lastVisited: new Date() },
    select: { id: true, lastDailyChestOpened: true },
  }).catch(() => null);

  if (!room) {
    return NextResponse.json({ error: "Failed to load room state." }, { status: 500 });
  }

  // Check today's chest
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (
    room.lastDailyChestOpened &&
    new Date(room.lastDailyChestOpened).getTime() >= today.getTime()
  ) {
    return NextResponse.json(
      {
        error: "Daily chest already opened today.",
        code: "ALREADY_OPENED",
        alreadyOpened: true,
        nextAvailableAt: new Date(today.getTime() + 24 * 3_600_000),
      },
      { status: 409 }
    );
  }

  // Roll rewards
  const coins = 5 + Math.floor(Math.random() * 16); // 5..20
  const xp = 5;
  const tokens = 2 + Math.floor(Math.random() * 4); // 2..5

  // Credit coins
  await db.user.update({
    where: { id: user.id },
    data: {
      coinBalance: { increment: coins },
      tokenBalance: { increment: tokens },
    },
  }).catch(() => {});

  // Log transactions
  await Promise.all([
    db.coinTransaction.create({
      data: { userId: user.id, amount: coins, reason: "daily_chest" },
    }).catch(() => {}),
    db.tokenTransaction.create({
      data: { userId: user.id, amount: tokens, reason: "daily_chest" },
    }).catch(() => {}),
  ]);

  // Award XP (also bumps streak via recordActivity)
  await recordActivity(user.id, 0).catch(() => {});
  const xpResult = await awardXp(user.id, xp).catch(() => null);

  // Mark chest as opened
  await db.studyRoomState.update({
    where: { id: room.id },
    data: { lastDailyChestOpened: new Date() },
  }).catch(() => {});

  // Fetch fresh balances
  const freshUser = await db.user.findUnique({
    where: { id: user.id },
    select: { coinBalance: true, tokenBalance: true },
  }).catch(() => null);

  return NextResponse.json({
    opened: true,
    rewards: {
      coins,
      xp,
      tokens,
    },
    balances: {
      coins: freshUser?.coinBalance ?? user.coinBalance + coins,
      tokens: freshUser?.tokenBalance ?? user.tokenBalance + tokens,
    },
    xp: xpResult
      ? {
          total: xpResult.xp,
          level: xpResult.level,
          leveledUp: xpResult.leveledUp,
          newBadges: xpResult.newBadges,
        }
      : null,
    nextAvailableAt: new Date(today.getTime() + 24 * 3_600_000),
  });
}
