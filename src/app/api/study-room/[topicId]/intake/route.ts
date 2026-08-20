import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-room/[topicId]/intake
 *
 * Phase 16 — Guided Learning Flow intake status.
 * Returns the user's intake state for a topic:
 *  - intakeCompleted (bool)
 *  - userName (custom name the student picked for themselves)
 *  - teacherCustomName (custom name they gave the AI teacher)
 *  - diagnosticScore (0..1, null until they take the diagnostic)
 *  - topicName (Topic.name)
 *
 * If the StudyRoomState for this user+topic doesn't exist yet, it is created
 * with defaults (intakeCompleted = false).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  // Verify the topic exists (avoid creating orphan room states)
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Get or create the room state
  const room = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: { userId: user.id, topicId, lastVisited: new Date() },
    update: { lastVisited: new Date() },
    select: {
      intakeCompleted: true,
      teacherCustomName: true,
      userName: true,
      diagnosticScore: true,
    },
  }).catch(() => null);

  if (!room) {
    return NextResponse.json(
      { error: "Failed to load intake state." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    intakeCompleted: room.intakeCompleted,
    userName: room.userName,
    teacherCustomName: room.teacherCustomName,
    diagnosticScore: room.diagnosticScore,
    topicName: topic.name,
  });
}
