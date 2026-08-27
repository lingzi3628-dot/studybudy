import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/user/models
 *
 * Returns all available Study Buddies (ModelMapping rows) with their
 * metadata (emoji, displayName, requiresPremium, tokenCostMultiplier,
 * providerId, modelIdentifier).
 *
 * Used by the StudyBuddySelector screen to show the list of available buddies.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();

    const models = await db.modelMapping.findMany({
      orderBy: [{ requiresPremium: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        modelName: true,
        displayName: true,
        emoji: true,
        requiresPremium: true,
        tokenCostMultiplier: true,
        providerId: true,
        modelIdentifier: true,
        planSlug: true,
      },
    });

    return NextResponse.json({
      models: models.map((m) => ({
        ...m,
        // Whether this user can currently use this model.
        // When UNLOCK_ALL_MODELS=true env var is set, all models are unlocked
        // (used for testing/comparison/beta phases — bypass premium + plan checks).
        canUse:
          process.env.UNLOCK_ALL_MODELS === "true"
            ? true
            : !m.requiresPremium || Boolean(user.planId),
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }
}
