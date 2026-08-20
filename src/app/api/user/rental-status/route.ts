import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/rental-status — current active rentals + expiry */
export async function GET() {
  const user = await getCurrentUser();

  // Mark expired rentals
  await db.modelRental.updateMany({
    where: {
      userId: user.id,
      status: "active",
      expiresAt: { lte: new Date() },
    },
    data: { status: "expired" },
  }).catch(() => {});

  // If user's currentModel is no longer available (no active rental + no subscription),
  // reset to free model
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (user.currentModel !== "study_buddy_free" && !isPremium) {
    const activeRental = await db.modelRental.findFirst({
      where: {
        userId: user.id,
        modelName: user.currentModel,
        status: "active",
        expiresAt: { gt: new Date() },
      },
    }).catch(() => null);
    if (!activeRental) {
      await db.user.update({
        where: { id: user.id },
        data: { currentModel: "study_buddy_free" },
      }).catch(() => {});
    }
  }

  const activeRentals = await db.modelRental.findMany({
    where: { userId: user.id, status: "active", expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" },
    select: { id: true, modelName: true, startedAt: true, expiresAt: true, coinsSpent: true },
  }).catch(() => []);

  const expiredRentals = await db.modelRental.findMany({
    where: { userId: user.id, status: "expired" },
    orderBy: { expiresAt: "desc" },
    take: 10,
    select: { id: true, modelName: true, startedAt: true, expiresAt: true, coinsSpent: true },
  }).catch(() => []);

  return NextResponse.json({
    activeRentals,
    expiredRentals,
    currentModel: user.currentModel,
    isPremium,
  });
}
