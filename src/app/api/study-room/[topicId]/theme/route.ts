import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * PUT /api/study-room/[topicId]/theme
 * Body: { themeName }
 *
 * Validates:
 *  - theme with the given name exists
 *  - if theme.isPremium and user is not premium → 402 needsUpgrade
 *  - if theme.coinCost > 0 and user hasn't purchased it yet → deduct coins
 *    (purchase is tracked via CoinTransaction with reason `theme_purchase:<name>`)
 *
 * On success, updates roomState.roomTheme.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as { themeName?: string };

  const themeName = (body.themeName ?? "").toString().trim();
  if (!themeName) {
    return NextResponse.json({ error: "themeName is required." }, { status: 400 });
  }

  // Verify the topic exists
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Validate theme exists
  const theme = await db.roomTheme.findUnique({
    where: { name: themeName },
  }).catch(() => null);
  if (!theme) {
    return NextResponse.json({ error: "Theme not found." }, { status: 404 });
  }

  const isPremium = Boolean(
    user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)
  );

  // Premium gate
  if (theme.isPremium && !isPremium) {
    return NextResponse.json(
      {
        error: "This theme requires a premium plan.",
        needsUpgrade: true,
        code: "PREMIUM_REQUIRED",
      },
      { status: 402 }
    );
  }

  // Coin-purchase gate (one-time per theme)
  if (theme.coinCost > 0) {
    const purchaseReason = `theme_purchase:${theme.name}`;
    const alreadyPurchased = await db.coinTransaction.findFirst({
      where: { userId: user.id, reason: purchaseReason },
      select: { id: true },
    }).catch(() => null);

    if (!alreadyPurchased) {
      // Check balance
      if (user.coinBalance < theme.coinCost) {
        return NextResponse.json(
          {
            error: "Insufficient coins to purchase this theme.",
            code: "INSUFFICIENT_COINS",
            coinCost: theme.coinCost,
            balance: user.coinBalance,
            needsUpgrade: false,
          },
          { status: 402 }
        );
      }

      // Deduct coins + log purchase transaction
      await db.user.update({
        where: { id: user.id },
        data: { coinBalance: { decrement: theme.coinCost } },
      }).catch(() => {});
      await db.coinTransaction.create({
        data: {
          userId: user.id,
          amount: -theme.coinCost,
          reason: purchaseReason,
        },
      }).catch(() => {});
    }
  }

  // Apply theme to room state
  const updated = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: { userId: user.id, topicId, roomTheme: theme.name, lastVisited: new Date() },
    update: { roomTheme: theme.name, lastVisited: new Date() },
  }).catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Failed to update room theme." }, { status: 500 });
  }

  // Fetch fresh balance (in case coins were deducted)
  const freshUser = await db.user.findUnique({
    where: { id: user.id },
    select: { coinBalance: true },
  }).catch(() => null);

  return NextResponse.json({
    room: {
      id: updated.id,
      topicId: updated.topicId,
      roomTheme: updated.roomTheme,
    },
    theme,
    coinBalance: freshUser?.coinBalance ?? user.coinBalance,
  });
}
