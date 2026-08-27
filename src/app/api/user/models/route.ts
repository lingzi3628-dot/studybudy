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
        // When UNLOCK_ALL_MODELS is not "false" (default), all models are
        // unlocked for testing. To enforce premium, set UNLOCK_ALL_MODELS=false
        // on Vercel.
        canUse:
          process.env.UNLOCK_ALL_MODELS !== "false"
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
