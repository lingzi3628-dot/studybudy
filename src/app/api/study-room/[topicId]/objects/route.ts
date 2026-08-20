import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-room/[topicId]/objects
 *
 * Returns all room objects with an `owned` boolean reflecting whether the
 * user has acquired each object (via UserRoomObject join).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  // Topic existence check (lightweight)
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const [objects, ownedRows] = await Promise.all([
    db.roomObject.findMany({ orderBy: { createdAt: "asc" } }).catch(() => []),
    db.userRoomObject.findMany({
      where: { userId: user.id },
      select: { objectId: true, acquiredAt: true },
    }).catch(() => []),
  ]);

  const ownedMap = new Map(
    ownedRows.map((r): [string, Date] => [r.objectId, r.acquiredAt])
  );

  return NextResponse.json({
    objects: objects.map((o) => ({
      ...o,
      owned: ownedMap.has(o.id),
      acquiredAt: ownedMap.get(o.id) ?? null,
    })),
    coinBalance: user.coinBalance,
  });
}
