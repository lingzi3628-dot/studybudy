import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type PlacedObject = {
  objectId?: string;
  x?: number;
  y?: number;
};

/**
 * POST /api/study-room/[topicId]/objects/place
 * Body: { placedObjects: [{objectId, x, y}] }
 *
 * Overwrites the room state's placedObjects JSON with the supplied array.
 * Each entry is validated for shape (objectId string, x/y numbers in [0,100]).
 * Only objects owned by the user are kept (others are filtered out).
 *
 * Returns the updated room state.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as { placedObjects?: PlacedObject[] };

  const incoming = Array.isArray(body.placedObjects) ? body.placedObjects : [];
  if (incoming.length === 0) {
    // Allow clearing the board
    const cleared = await db.studyRoomState.upsert({
      where: { userId_topicId: { userId: user.id, topicId } },
      create: { userId: user.id, topicId, placedObjects: [], lastVisited: new Date() },
      update: { placedObjects: [], lastVisited: new Date() },
    }).catch(() => null);
    return NextResponse.json({
      room: {
        id: cleared?.id ?? null,
        placedObjects: [],
      },
    });
  }

  // Normalize + validate entries
  const sanitized: { objectId: string; x: number; y: number }[] = [];
  for (const entry of incoming) {
    if (!entry || typeof entry !== "object") continue;
    const objectId = (entry.objectId ?? "").toString().trim();
    if (!objectId) continue;
    const x = clampPercent(entry.x);
    const y = clampPercent(entry.y);
    sanitized.push({ objectId, x, y });
  }

  // Cap the number of placed objects to avoid abuse
  if (sanitized.length > 50) {
    return NextResponse.json(
      { error: "Too many placed objects (max 50).", code: "TOO_MANY_OBJECTS" },
      { status: 400 }
    );
  }

  // Verify topic exists
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Filter to only objects the user owns
  const ownedObjectIds = new Set(
    (await db.userRoomObject.findMany({
      where: { userId: user.id, objectId: { in: sanitized.map((s) => s.objectId) } },
      select: { objectId: true },
    }).catch(() => []) as { objectId: string }[]).map((o) => o.objectId)
  );

  const placedObjects = sanitized.filter((s) => ownedObjectIds.has(s.objectId));

  const updated = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: {
      userId: user.id,
      topicId,
      placedObjects: placedObjects as any,
      lastVisited: new Date(),
    },
    update: {
      placedObjects: placedObjects as any,
      lastVisited: new Date(),
    },
  }).catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Failed to update placed objects." }, { status: 500 });
  }

  return NextResponse.json({
    room: {
      id: updated.id,
      topicId: updated.topicId,
      placedObjects: (updated.placedObjects as any[]) ?? [],
    },
    skipped: sanitized.length - placedObjects.length,
  });
}

/** Coerce x/y to a number in [0, 100] (percentage of canvas). */
function clampPercent(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
