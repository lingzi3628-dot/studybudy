import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAvailableModels } from "@/lib/monetization";

export const runtime = "nodejs";

/** GET /api/user/model — returns current model + all available models */
export async function GET() {
  const user = await getCurrentUser();
  const models = await getAvailableModels(user.id);
  return NextResponse.json({
    currentModel: user.currentModel,
    models,
  });
}

/** POST /api/user/model — switch model */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const modelName = (body.modelName ?? "").toString();

  if (!modelName) {
    return NextResponse.json({ error: "Missing modelName" }, { status: 400 });
  }

  // Check if model exists
  const mapping = await db.modelMapping.findUnique({
    where: { modelName },
  });
  if (!mapping) {
    return NextResponse.json({ error: "Unknown model" }, { status: 404 });
  }

  // Check premium permission
  // OVERRIDE: when UNLOCK_ALL_MODELS=true env var is set, all models are
  // unlocked (used for testing/comparison phases).
  if (process.env.UNLOCK_ALL_MODELS !== "true" && mapping.requiresPremium) {
    const hasActivePlan = user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry);
    if (!hasActivePlan) {
      return NextResponse.json({
        error: `🥲 You can't use ${mapping.displayName} yet... You need to upgrade to access this model!`,
        emoji: mapping.emoji,
        displayName: mapping.displayName,
        requiresUpgrade: true,
      }, { status: 403 });
    }
  }

  // Switch model
  await db.user.update({
    where: { id: user.id },
    data: { currentModel: modelName },
  });

  return NextResponse.json({
    ok: true,
    model: modelName,
    emoji: mapping.emoji,
    displayName: mapping.displayName,
    celebration: `Switched to ${mapping.displayName} ${mapping.emoji}`,
  });
}
