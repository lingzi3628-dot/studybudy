import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { levelForXp } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/pets/purchase
 * Body: { petId }
 *
 * Validates:
 *  - pet exists
 *  - user doesn't already own it (409)
 *  - user is premium if pet.isPremium
 *  - user meets pet.levelRequired (from UserXp.level)
 *  - user has sufficient coins
 *
 * On success:
 *  - deducts coins from user
 *  - creates UserPet row (level 1, petXp 0)
 *  - logs a CoinTransaction (negative amount, reason `pet_purchase`)
 *  - returns the new balance + the new UserPet
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { petId?: string };

  const petId = (body.petId ?? "").toString().trim();
  if (!petId) {
    return NextResponse.json({ error: "petId is required." }, { status: 400 });
  }

  // Pet existence
  const pet = await db.pet.findUnique({ where: { id: petId } }).catch(() => null);
  if (!pet) {
    return NextResponse.json({ error: "Pet not found." }, { status: 404 });
  }

  // Already owned?
  const existingOwnership = await db.userPet.findUnique({
    where: { userId_petId: { userId: user.id, petId } },
    select: { id: true },
  }).catch(() => null);
  if (existingOwnership) {
    return NextResponse.json(
      { error: "You already own this pet.", code: "ALREADY_OWNED" },
      { status: 409 }
    );
  }

  const isPremium = Boolean(
    user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)
  );

  if (pet.isPremium && !isPremium) {
    return NextResponse.json(
      {
        error: "This pet requires a premium plan.",
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
  if (userLevel < pet.levelRequired) {
    return NextResponse.json(
      {
        error: `You need to reach level ${pet.levelRequired} to adopt this pet.`,
        code: "LEVEL_REQUIRED",
        levelRequired: pet.levelRequired,
        userLevel,
      },
      { status: 403 }
    );
  }

  // Coin balance check
  if (user.coinBalance < pet.coinCost) {
    return NextResponse.json(
      {
        error: "Insufficient coins.",
        code: "INSUFFICIENT_COINS",
        coinCost: pet.coinCost,
        balance: user.coinBalance,
        needsUpgrade: false,
      },
      { status: 402 }
    );
  }

  // Deduct coins
  await db.user.update({
    where: { id: user.id },
    data: { coinBalance: { decrement: pet.coinCost } },
  }).catch(() => {});

  // Log coin transaction
  await db.coinTransaction.create({
    data: {
      userId: user.id,
      amount: -pet.coinCost,
      reason: "pet_purchase",
    },
  }).catch(() => {});

  // Create ownership record
  const userPet = await db.userPet.create({
    data: { userId: user.id, petId, petLevel: 1, petXp: 0 },
  }).catch(() => null);

  if (!userPet) {
    // Race-condition fallback: re-credit coins
    await db.user.update({
      where: { id: user.id },
      data: { coinBalance: { increment: pet.coinCost } },
    }).catch(() => {});
    return NextResponse.json(
      { error: "Failed to adopt pet." },
      { status: 500 }
    );
  }

  // Fresh balance
  const freshUser = await db.user.findUnique({
    where: { id: user.id },
    select: { coinBalance: true },
  }).catch(() => null);

  return NextResponse.json({
    userPet: {
      id: userPet.id,
      petId: userPet.petId,
      petLevel: userPet.petLevel,
      petXp: userPet.petXp,
      lastFed: userPet.lastFed,
      createdAt: userPet.createdAt,
    },
    pet,
    coinBalance: freshUser?.coinBalance ?? user.coinBalance - pet.coinCost,
  });
}
