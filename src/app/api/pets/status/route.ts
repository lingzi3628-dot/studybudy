import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const XP_PER_LEVEL_BASE = 100; // level N+1 requires 100*N total petXp

/**
 * GET /api/pets/status?topicId=...
 *
 * Returns the active pet from the room state for the given topic:
 *  - petLevel
 *  - petXp
 *  - lastFed
 *  - happiness (computed from lastFed: 100 right after feeding,
 *    drops ~4/hour, floors at 0)
 *  - xpForNextLevel = 100 * level
 *
 * If no pet is set on the room, returns `{ activePet: null }`.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const topicId = (url.searchParams.get("topicId") ?? "").toString().trim();
  if (!topicId) {
    return NextResponse.json({ error: "topicId query param required." }, { status: 400 });
  }

  const room = await db.studyRoomState.findUnique({
    where: { userId_topicId: { userId: user.id, topicId } },
    select: { id: true, petId: true },
  }).catch(() => null);

  if (!room) {
    return NextResponse.json({ activePet: null });
  }

  if (!room.petId) {
    return NextResponse.json({ activePet: null, room: { id: room.id } });
  }

  // room.petId references UserPet.id
  const userPet = await db.userPet.findUnique({
    where: { id: room.petId },
    include: { pet: true },
  }).catch(() => null);

  if (!userPet || userPet.userId !== user.id) {
    // Stale reference — return null but surface the issue
    return NextResponse.json({
      activePet: null,
      room: { id: room.id },
      warning: "Active pet reference is no longer valid.",
    });
  }

  return NextResponse.json({
    activePet: {
      userPetId: userPet.id,
      petId: userPet.petId,
      name: userPet.pet.name,
      emoji: userPet.pet.emoji,
      petLevel: userPet.petLevel,
      petXp: userPet.petXp,
      xpForNextLevel: XP_PER_LEVEL_BASE * userPet.petLevel,
      lastFed: userPet.lastFed,
      happiness: computeHappiness(userPet.lastFed),
    },
    room: { id: room.id },
  });
}

function computeHappiness(lastFed: Date | null): number {
  if (!lastFed) return 50;
  const hoursSince = (Date.now() - new Date(lastFed).getTime()) / 3_600_000;
  return Math.max(0, Math.round(100 - hoursSince * 4));
}
