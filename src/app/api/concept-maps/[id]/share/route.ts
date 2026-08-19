import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/concept-maps/[id]/share — toggle is_public flag
 *
 * - Only owner can toggle
 * - Premium users only (plan.conceptMapExport = true — sharing gated behind export feature)
 * - Returns the new isPublic state + a shareable URL
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const map = await db.conceptMap.findUnique({
    where: { id },
    select: { id: true, userId: true, isPublic: true, title: true },
  }).catch(() => null);

  if (!map) {
    return NextResponse.json({ error: "Concept map not found." }, { status: 404 });
  }
  if (map.userId !== user.id) {
    return NextResponse.json({ error: "You can only share your own concept maps." }, { status: 403 });
  }

  // Premium check — sharing gated behind plan.conceptMapExport
  const plan = user.planId
    ? await db.plan.findUnique({ where: { id: user.planId }, select: { conceptMapExport: true } }).catch(() => null)
    : null;
  if (!plan?.conceptMapExport) {
    return NextResponse.json(
      { error: "Sharing concept maps requires a premium plan. Upgrade to Pro or higher.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
      { status: 402 }
    );
  }

  const newIsPublic = !map.isPublic;
  await db.conceptMap.update({ where: { id }, data: { isPublic: newIsPublic } });

  return NextResponse.json({
    id,
    isPublic: newIsPublic,
    shareUrl: newIsPublic ? `/shared/concept-map/${id}` : null,
    message: newIsPublic ? "Concept map is now public — share the link!" : "Concept map is now private.",
  });
}
