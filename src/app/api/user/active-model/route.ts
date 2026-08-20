import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/user/active-model
 * Body: { modelName }
 *
 * Switches active model if allowed:
 * - Free model: always allowed
 * - Premium models: allowed if user has subscription OR active rental
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { modelName?: string };
  const modelName = (body.modelName ?? "").toString().trim();

  if (!modelName) {
    return NextResponse.json({ error: "modelName required" }, { status: 400 });
  }

  // Free model — always allowed
  if (modelName === "study_buddy_free") {
    await db.user.update({
      where: { id: user.id },
      data: { currentModel: modelName },
    });
    return NextResponse.json({ ok: true, activeModel: modelName });
  }

  // Premium model — check subscription OR rental
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  const activeRental = await db.modelRental.findFirst({
    where: { userId: user.id, modelName, status: "active", expiresAt: { gt: new Date() } },
  }).catch(() => null);

  if (!isPremium && !activeRental) {
    return NextResponse.json(
      {
        error: `You don't have access to ${modelName}. Rent it with coins or upgrade to Premium.`,
        needsUpgrade: true,
        code: "MODEL_LOCKED",
      },
      { status: 402 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { currentModel: modelName },
  });

  return NextResponse.json({
    ok: true,
    activeModel: modelName,
    via: isPremium ? "subscription" : "rental",
    rentalExpiresAt: activeRental?.expiresAt,
  });
}
