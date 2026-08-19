import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/concept-maps/[id] — fetch a concept map by id
 *
 * - User can fetch their own map OR any public map
 * - Returns 404 if not found or no access
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
      isPublic: true, sourceType: true, sourceText: true,
      userId: true, topicId: true, createdAt: true, updatedAt: true,
      topic: { select: { id: true, name: true, subject: true } },
    },
  }).catch(() => null);

  if (!map) {
    return NextResponse.json({ error: "Concept map not found." }, { status: 404 });
  }

  // Access control: own map OR public
  const isOwner = map.userId === user.id;
  if (!isOwner && !map.isPublic) {
    return NextResponse.json({ error: "You don't have access to this concept map." }, { status: 403 });
  }

  return NextResponse.json({
    conceptMap: {
      ...map,
      isOwner,
    },
    tokenBalance: user.tokenBalance,
  });
}

/**
 * PUT /api/concept-maps/[id] — update title/nodes/edges
 *
 * - Only owner can edit
 * - Premium users only (plan.conceptMapEditing = true)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    nodes?: any[];
    edges?: any[];
  };

  const map = await db.conceptMap.findUnique({
    where: { id },
    select: { id: true, userId: true },
  }).catch(() => null);

  if (!map) {
    return NextResponse.json({ error: "Concept map not found." }, { status: 404 });
  }
  if (map.userId !== user.id) {
    return NextResponse.json({ error: "You can only edit your own concept maps." }, { status: 403 });
  }

  // Check premium editing permission
  const plan = user.planId
    ? await db.plan.findUnique({ where: { id: user.planId }, select: { conceptMapEditing: true } }).catch(() => null)
    : null;
  const canEdit = plan?.conceptMapEditing === true;
  if (!canEdit) {
    return NextResponse.json(
      { error: "Editing concept maps requires a premium plan. Upgrade to Pro or higher.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
      { status: 402 }
    );
  }

  // Build update payload
  const data: any = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 200);
  if (Array.isArray(body.nodes)) data.nodes = body.nodes;
  if (Array.isArray(body.edges)) data.edges = body.edges;

  const updated = await db.conceptMap.update({
    where: { id },
    data,
    select: { id: true, title: true, nodes: true, edges: true, updatedAt: true },
  });

  return NextResponse.json({ conceptMap: updated });
}

/**
 * DELETE /api/concept-maps/[id] — delete a concept map (owner only)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const map = await db.conceptMap.findUnique({
    where: { id },
    select: { id: true, userId: true },
  }).catch(() => null);

  if (!map) {
    return NextResponse.json({ error: "Concept map not found." }, { status: 404 });
  }
  if (map.userId !== user.id) {
    return NextResponse.json({ error: "You can only delete your own concept maps." }, { status: 403 });
  }

  await db.conceptMap.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
