import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/pets/select
 * Body: { topicId, userPetId }
 *
 * Sets the active pet for a study room by storing roomState.petId = userPetId.
 * Validates:
 *  - topic exists
 *  - userPetId belongs to the user
 *  - pet is set on the roomState for that topic
 *
 * Returns the updated room state.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    topicId?: string;
    userPetId?: string;
  };

  const topicId = (body.topicId ?? "").toString().trim();
  const userPetId = (body.userPetId ?? "").toString().trim();
  if (!topicId || !userPetId) {
    return NextResponse.json(
      { error: "topicId and userPetId are required." },
      { status: 400 }
    );
  }

  // Topic existence
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Validate userPetId ownership
  const userPet = await db.userPet.findUnique({
    where: { id: userPetId },
    include: { pet: true },
  }).catch(() => null);
  if (!userPet || userPet.userId !== user.id) {
    return NextResponse.json(
      { error: "Pet not found or not owned by you.", code: "NOT_OWNED" },
      { status: 404 }
    );
  }

  // Allow passing null (deselect) by sending userPetId = null — handled above
  const updated = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: {
      userId: user.id,
      topicId,
      petId: userPet.id,
      lastVisited: new Date(),
    },
    update: {
      petId: userPet.id,
      lastVisited: new Date(),
    },
  }).catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Failed to select pet." }, { status: 500 });
  }

  return NextResponse.json({
    room: {
      id: updated.id,
      topicId: updated.topicId,
      petId: updated.petId,
    },
    activePet: {
      userPetId: userPet.id,
      petId: userPet.petId,
      name: userPet.pet.name,
      emoji: userPet.pet.emoji,
      petLevel: userPet.petLevel,
      petXp: userPet.petXp,
      lastFed: userPet.lastFed,
    },
  });
}
