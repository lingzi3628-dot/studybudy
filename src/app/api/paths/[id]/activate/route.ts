import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/paths/[id]/activate
 *
 * Phase 17 — Switch the user's current learning path.
 *
 * Sets isCurrent=false for all other UserActivePath rows for this user,
 * sets isCurrent=true for the requested path (upserting the row if it
 * doesn't exist yet). Also bumps LearningPath.isActive for parity so
 * legacy code reading the isActive flag still sees the right "active"
 * path.
 *
 * Response shape: { ok: true, pathId, isCurrent }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id: pathId } = await params;

  // Validate the path exists + belongs to the user
  const path = await db.learningPath.findUnique({
    where: { id: pathId },
    select: { id: true, userId: true },
  }).catch(() => null);

  if (!path) {
    return NextResponse.json({ error: "Path not found." }, { status: 404 });
  }
  if (path.userId !== user.id) {
    return NextResponse.json(
      { error: "You don't have access to this learning path." },
      { status: 403 }
    );
  }

  // Single transaction:
  // 1) Deactivate every other UserActivePath row for this user
  // 2) Upsert this path's UserActivePath row as isCurrent=true
  // 3) Update LearningPath.isActive so legacy isActive reads stay correct
  await db.$transaction(async (tx) => {
    await tx.userActivePath.updateMany({
      where: { userId: user.id, pathId: { not: pathId }, isCurrent: true },
      data: { isCurrent: false },
    });

    await tx.userActivePath.upsert({
      where: { userId_pathId: { userId: user.id, pathId } },
      create: { userId: user.id, pathId, isCurrent: true },
      update: { isCurrent: true },
    });

    // Mark this path as the active one in the LearningPath table too.
    // (Only one path per user should have isActive=true at a time.)
    await tx.learningPath.updateMany({
      where: { userId: user.id, id: { not: pathId } },
      data: { isActive: false },
    }).catch(() => {});
    await tx.learningPath.update({
      where: { id: pathId },
      data: { isActive: true },
    }).catch(() => {});
  }).catch(async (e: any) => {
    console.error("activate path transaction failed:", e?.message);
    // Fallback: try the bare-minimum updateMany + upsert outside a tx
    await db.userActivePath.updateMany({
      where: { userId: user.id, pathId: { not: pathId }, isCurrent: true },
      data: { isCurrent: false },
    }).catch(() => {});
    await db.userActivePath.upsert({
      where: { userId_pathId: { userId: user.id, pathId } },
      create: { userId: user.id, pathId, isCurrent: true },
      update: { isCurrent: true },
    }).catch(() => {});
  });

  return NextResponse.json({ ok: true, pathId, isCurrent: true });
}
