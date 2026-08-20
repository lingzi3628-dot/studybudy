import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { levelForXp } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/study-room/[topicId]/objects/purchase
 * Body: { objectId }
 *
 * Validates:
 *  - object exists
 *  - user doesn't already own it (409)
 *  - user is premium if object.isPremium
 *  - user meets object.levelRequired (from UserXp.level)
 *  - user has sufficient coins
 *
 * On success:
 *  - deducts coins from user
 *  - creates UserRoomObject row
 *  - logs a CoinTransaction (negative amount, reason `room_object_purchase`)
 *  - returns the new balance + owned object
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as { objectId?: string };

  const objectId = (body.objectId ?? "").toString().trim();
  if (!objectId) {
    return NextResponse.json({ error: "objectId is required." }, { status: 400 });
  }

  // Topic existence check
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Object existence + premium/level validation
  const obj = await db.roomObject.findUnique({ where: { id: objectId } }).catch(() => null);
  if (!obj) {
    return NextResponse.json({ error: "Room object not found." }, { status: 404 });
  }

  // Already owned?
  const existingOwnership = await db.userRoomObject.findUnique({
    where: { userId_objectId: { userId: user.id, objectId } },
    select: { id: true },
  }).catch(() => null);
  if (existingOwnership) {
    return NextResponse.json(
      { error: "You already own this object.", code: "ALREADY_OWNED" },
      { status: 409 }
    );
  }

  const isPremium = Boolean(
    user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)
  );

  if (obj.isPremium && !isPremium) {
    return NextResponse.json(
      {
        error: "This object requires a premium plan.",
        needsUpgrade: true,
        code: "PREMIUM_REQUIRED",
      },
      { status: 402 }
    );
  }

  // Level requirement
  const xpRow = await db.userXp.findUnique({
    where: { userId: user.id },
    select: { level: true, xpAmount: true },
  }).catch(() => null);
  const userLevel = xpRow?.level ?? levelForXp(xpRow?.xpAmount ?? 0) ?? 1;
  if (userLevel < obj.levelRequired) {
    return NextResponse.json(
      {
        error: `You need to reach level ${obj.levelRequired} to purchase this object.`,
        code: "LEVEL_REQUIRED",
        levelRequired: obj.levelRequired,
        userLevel,
      },
      { status: 403 }
    );
  }

  // Coin balance check
  if (user.coinBalance < obj.coinCost) {
    return NextResponse.json(
      {
        error: "Insufficient coins.",
        code: "INSUFFICIENT_COINS",
        coinCost: obj.coinCost,
        balance: user.coinBalance,
        needsUpgrade: false,
      },
      { status: 402 }
    );
  }

  // Deduct coins
  await db.user.update({
    where: { id: user.id },
    data: { coinBalance: { decrement: obj.coinCost } },
  }).catch(() => {});

  // Log coin transaction
  await db.coinTransaction.create({
    data: {
      userId: user.id,
      amount: -obj.coinCost,
      reason: "room_object_purchase",
    },
  }).catch(() => {});

  // Create ownership record
  const userObject = await db.userRoomObject.create({
    data: { userId: user.id, objectId },
  }).catch(() => null);

  if (!userObject) {
    // Race-condition fallback: re-credit coins
    await db.user.update({
      where: { id: user.id },
      data: { coinBalance: { increment: obj.coinCost } },
    }).catch(() => {});
    return NextResponse.json(
      { error: "Failed to grant object ownership." },
      { status: 500 }
    );
  }

  // Fresh balance
  const freshUser = await db.user.findUnique({
    where: { id: user.id },
    select: { coinBalance: true },
  }).catch(() => null);

  return NextResponse.json({
    owned: {
      id: userObject.id,
      objectId: userObject.objectId,
      acquiredAt: userObject.acquiredAt,
    },
    object: obj,
    coinBalance: freshUser?.coinBalance ?? user.coinBalance - obj.coinCost,
  });
}
