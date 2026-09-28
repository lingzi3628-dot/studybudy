import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Attach an existing study set to a private, persistent Study Room. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const set = await db.studySet.findFirst({
    where: { id, userId: user.id },
    select: { id: true, topicId: true, title: true, subject: true, topic: true, sourceText: true },
  });
  if (!set) return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  if (set.topicId) {
    const ownedRoom = await db.studyRoomState.findUnique({
      where: { userId_topicId: { userId: user.id, topicId: set.topicId } },
      select: { topicId: true },
    });
    if (ownedRoom) return NextResponse.json({ topicId: ownedRoom.topicId, created: false });
  }

  const topicId = await db.$transaction(async (tx) => {
    const topic = await tx.topic.create({
      data: {
        name: (set.topic || set.title || "My Study Room").trim().slice(0, 120),
        subject: (set.subject || "General").trim().slice(0, 80),
        description: set.sourceText?.trim().slice(0, 500) || null,
        published: false,
        createdById: user.id,
      },
      select: { id: true },
    });
    await tx.studyRoomState.create({ data: { userId: user.id, topicId: topic.id } });
    await tx.studySet.update({ where: { id: set.id }, data: { topicId: topic.id } });
    return topic.id;
  });
  return NextResponse.json({ topicId, created: true });
}
