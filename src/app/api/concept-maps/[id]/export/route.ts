import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/concept-maps/[id]/export?format=json|png
 *
 * - JSON: returns raw nodes/edges (premium only)
 * - PNG: server doesn't render React Flow — return JSON and let frontend
 *   use html-to-image to capture the canvas. The ?format=png case still
 *   returns JSON (the frontend knows how to render it to PNG).
 *
 * Access: owner OR public map. Premium only (plan.conceptMapExport).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const map = await db.conceptMap.findUnique({
    where: { id },
    select: {
      id: true, title: true, nodes: true, edges: true,
      isPublic: true, userId: true, sourceType: true, createdAt: true,
    },
  }).catch(() => null);

  if (!map) {
    return NextResponse.json({ error: "Concept map not found." }, { status: 404 });
  }

  const isOwner = map.userId === user.id;
  if (!isOwner && !map.isPublic) {
    return NextResponse.json({ error: "You don't have access to this concept map." }, { status: 403 });
  }

  // Premium check — owner needs plan.conceptMapExport
  if (isOwner) {
    const plan = user.planId
      ? await db.plan.findUnique({ where: { id: user.planId }, select: { conceptMapExport: true } }).catch(() => null)
      : null;
    if (!plan?.conceptMapExport) {
      return NextResponse.json(
        { error: "Exporting concept maps requires a premium plan. Upgrade to Pro or higher.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }
  }

  // Return JSON export (frontend can convert to PNG via html-to-image)
  return NextResponse.json({
    id: map.id,
    title: map.title,
    nodes: map.nodes,
    edges: map.edges,
    sourceType: map.sourceType,
    createdAt: map.createdAt,
    exportedAt: new Date().toISOString(),
  });
}
