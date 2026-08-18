import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/user/activation
 * Body: { activationKey }
 *
 * Validates key: must exist, be active, not expired, not used.
 * On success: associates key with user, sets plan + token balance + expiry.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const keyStr = (body.activationKey ?? "").toString().trim();

  if (!keyStr) {
    return NextResponse.json({ error: "Missing activation key" }, { status: 400 });
  }

  const key = await db.activationKey.findUnique({
    where: { key: keyStr },
    include: { plan: true },
  });

  if (!key) {
    return NextResponse.json({ error: "Invalid activation key" }, { status: 404 });
  }
  if (key.status === "used") {
    return NextResponse.json({ error: "This key has already been used" }, { status: 410 });
  }
  if (key.status === "revoked") {
    return NextResponse.json({ error: "This key has been revoked" }, { status: 403 });
  }
  if (key.expiresAt && new Date() > key.expiresAt) {
    return NextResponse.json({ error: "This key has expired" }, { status: 410 });
  }
  if (key.userId && key.userId !== user.id) {
    return NextResponse.json({ error: "This key is assigned to another user" }, { status: 403 });
  }

  // Activate!
  const plan = key.plan;
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 1);
  const nextReset = new Date(expiry);

  await db.activationKey.update({
    where: { id: key.id },
    data: { status: "used", usedAt: new Date(), userId: user.id },
  });

  await db.user.update({
    where: { id: user.id },
    data: {
      planId: plan.id,
      plan: plan.slug,
      tokenBalance: plan.tokenLimit,
      subscriptionExpiry: expiry,
      tokenResetDate: nextReset,
      activationKey: keyStr,
      currentModel: plan.features?.model ?? "study_buddy_free",
    },
  });

  return NextResponse.json({
    ok: true,
    celebration: `🎉 Activated! Welcome to ${plan.name}!`,
    plan: { name: plan.name, slug: plan.slug, tokenLimit: plan.tokenLimit },
    tokenBalance: plan.tokenLimit,
    subscriptionExpiry: expiry,
  });
}
