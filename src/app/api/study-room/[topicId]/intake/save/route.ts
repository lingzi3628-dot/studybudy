import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/study-room/[topicId]/intake/save
 * Body: { userName?, teacherCustomName? }
 *
 * Phase 16 — saves the intake form (the student's preferred name +
 * the custom name they gave the AI teacher).
 *
 * intakeCompleted is flipped to true once both fields have been saved
 * (i.e. both are non-empty after this write). The diagnostic quiz is
 * optional — intakeCompleted reflects the *form* only; the diagnostic
 * score is tracked separately via diagnosticScore.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as {
    userName?: string;
    teacherCustomName?: string;
  };

  // Coerce + clamp inputs
  const userName =
    typeof body.userName === "string"
      ? body.userName.trim().slice(0, 60)
      : undefined;
  const teacherCustomName =
    typeof body.teacherCustomName === "string"
      ? body.teacherCustomName.trim().slice(0, 60)
      : undefined;

  if (
    (userName === undefined || userName === "") &&
    (teacherCustomName === undefined || teacherCustomName === "")
  ) {
    return NextResponse.json(
      { error: "Provide at least a userName or teacherCustomName." },
      { status: 400 }
    );
  }

  // Verify the topic exists
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Build the update payload (only the fields the client sent)
  const data: any = {};
  if (userName !== undefined) data.userName = userName || null;
  if (teacherCustomName !== undefined) {
    data.teacherCustomName = teacherCustomName || null;
    // Keep the AI teacher name on the room in sync so the rest of the
    // app (chat, avatar bubble) shows the custom name immediately.
    data.aiTeacherName = teacherCustomName || "Professor Bloom";
  }

  // Determine post-write values for intakeCompleted
  // (treat undefined as "no change" so we read existing state first)
  const existing = await db.studyRoomState.findUnique({
    where: { userId_topicId: { userId: user.id, topicId } },
    select: { userName: true, teacherCustomName: true },
  }).catch(() => null);

  const finalUserName = userName ?? existing?.userName ?? null;
  const finalTeacherName =
    teacherCustomName ?? existing?.teacherCustomName ?? null;

  // Mark intake completed once both fields are saved
  data.intakeCompleted = Boolean(finalUserName && finalTeacherName);
  data.lastVisited = new Date();

  const updated = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: {
      userId: user.id,
      topicId,
      userName: userName ?? null,
      teacherCustomName: teacherCustomName ?? null,
      aiTeacherName: teacherCustomName || "Professor Bloom",
      intakeCompleted: Boolean(userName && teacherCustomName),
      lastVisited: new Date(),
    },
    update: data,
    select: {
      intakeCompleted: true,
      userName: true,
      teacherCustomName: true,
      diagnosticScore: true,
    },
  }).catch(() => null);

  if (!updated) {
    return NextResponse.json(
      { error: "Failed to save intake." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    intakeCompleted: updated.intakeCompleted,
    userName: updated.userName,
    teacherCustomName: updated.teacherCustomName,
    diagnosticScore: updated.diagnosticScore,
    topicName: topic.name,
  });
}
