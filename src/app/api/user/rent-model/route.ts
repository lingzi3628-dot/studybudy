import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/user/rent-model
 * Body: { modelName, durationMinutes }
 *
 * Validates coin balance, deducts coins, creates ModelRental record,
 * sets currentModel to rented model.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    modelName?: string;
    durationMinutes?: number;
  };
  const modelName = (body.modelName ?? "").toString().trim();
  const durationMinutes = Number(body.durationMinutes ?? 0);

  if (!modelName || !durationMinutes) {
    return NextResponse.json({ error: "modelName and durationMinutes required" }, { status: 400 });
  }

  // Look up rental price
  const price = await db.modelRentalPrice.findUnique({
    where: { modelName_durationMinutes: { modelName, durationMinutes } },
  }).catch(() => null);

  if (!price) {
    return NextResponse.json(
      { error: `No rental price found for ${modelName} (${durationMinutes} min). Check admin settings.` },
      { status: 404 }
    );
  }

  // Check coin balance
  if ((user.coinBalance ?? 0) < price.coinCost) {
    return NextResponse.json(
      {
        error: `You need ${price.coinCost} coins to rent ${modelName} for ${durationMinutes} min. You have ${user.coinBalance ?? 0}.`,
        needsUpgrade: true,
        code: "INSUFFICIENT_COINS",
        coinCost: price.coinCost,
        coinBalance: user.coinBalance ?? 0,
      },
      { status: 402 }
    );
  }

  // Deduct coins + set current model + create rental record
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  const [updatedUser, rental] = await Promise.all([
    db.user.update({
      where: { id: user.id },
      data: {
        coinBalance: { decrement: price.coinCost },
        currentModel: modelName,
      },
    }),
    db.modelRental.create({
      data: {
        userId: user.id,
        modelName,
        expiresAt,
        coinsSpent: price.coinCost,
        status: "active",
      },
    }),
  ]);

  await db.coinTransaction.create({
    data: { userId: user.id, amount: -price.coinCost, reason: `rent_model:${modelName}:${durationMinutes}m` },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    modelName,
    durationMinutes,
    coinsSpent: price.coinCost,
    newCoinBalance: updatedUser.coinBalance,
    expiresAt: rental.expiresAt,
    message: `Rented ${modelName} for ${durationMinutes} min ✓`,
  });
}
