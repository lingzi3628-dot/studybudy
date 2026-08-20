import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/pets/feed
 * Body: { userPetId }
 *
 * Feeds a pet:
 *  - deducts 5 coins from the user
 *  - increments petXp by 10
 *  - if petXp >= 100 * petLevel, levels up (and carries over the excess)
 *  - updates lastFed to now
 *  - logs a CoinTransaction (negative, reason `pet_feed`)
 *
 * Returns the new pet status (level, xp, lastFed, happiness, xpForNextLevel).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { userPetId?: string };

  const userPetId = (body.userPetId ?? "").toString().trim();
  if (!userPetId) {
    return NextResponse.json({ error: "userPetId is required." }, { status: 400 });
  }

  const FEED_COST = 5;
  const XP_PER_FEED = 10;
  const XP_PER_LEVEL_BASE = 100; // level N+1 requires 100*N total petXp

  // Validate ownership
  const userPet = await db.userPet.findUnique({
    where: { id: userPetId },
    include: { pet: true },
  }).catch(() => null);
  if (!userPet || userPet.userId !== user.id) {
    return NextResponse.json(
      { error: "Pet not found or not owned by you.", code: "NOT_OWNED" },
      { status: 404 }
    );
  }

  // Balance check
  if (user.coinBalance < FEED_COST) {
    return NextResponse.json(
      {
        error: "Insufficient coins to feed pet.",
        code: "INSUFFICIENT_COINS",
        coinCost: FEED_COST,
        balance: user.coinBalance,
        needsUpgrade: false,
      },
      { status: 402 }
    );
  }

  // Deduct coins
  await db.user.update({
    where: { id: user.id },
    data: { coinBalance: { decrement: FEED_COST } },
  }).catch(() => {});

  await db.coinTransaction.create({
    data: {
      userId: user.id,
      amount: -FEED_COST,
      reason: "pet_feed",
    },
  }).catch(() => {});

  // Compute new XP + level
  const newPetXp = userPet.petXp + XP_PER_FEED;
  const xpNeededForNext = XP_PER_LEVEL_BASE * userPet.petLevel; // 100 * level
  let newLevel = userPet.petLevel;
  let carryXp = newPetXp;
  while (carryXp >= XP_PER_LEVEL_BASE * newLevel) {
    carryXp -= XP_PER_LEVEL_BASE * newLevel;
    newLevel += 1;
    // Safety cap
    if (newLevel > 99) break;
  }

  const updated = await db.userPet.update({
    where: { id: userPet.id },
    data: {
      petXp: carryXp,
      petLevel: newLevel,
      lastFed: new Date(),
    },
    include: { pet: true },
  }).catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Failed to feed pet." }, { status: 500 });
  }

  const freshUser = await db.user.findUnique({
    where: { id: user.id },
    select: { coinBalance: true },
  }).catch(() => null);

  return NextResponse.json({
    pet: {
      userPetId: updated.id,
      petId: updated.petId,
      name: updated.pet.name,
      emoji: updated.pet.emoji,
      petLevel: updated.petLevel,
      petXp: updated.petXp,
      xpForNextLevel: XP_PER_LEVEL_BASE * updated.petLevel,
      lastFed: updated.lastFed,
      happiness: computeHappiness(updated.lastFed),
    },
    leveledUp: newLevel > userPet.petLevel,
    coinBalance: freshUser?.coinBalance ?? user.coinBalance - FEED_COST,
  });
}

function computeHappiness(lastFed: Date | null): number {
  if (!lastFed) return 50;
  const hoursSince = (Date.now() - new Date(lastFed).getTime()) / 3_600_000;
  return Math.max(0, Math.round(100 - hoursSince * 4));
}
