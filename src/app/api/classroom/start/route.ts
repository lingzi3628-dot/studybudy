import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

/** Ordered list of guided-learning flow states (Phase 16). */
const FLOW_STATES = [
  "ASSESSMENT",
  "LEARNING",
  "PRACTICE",
  "QUIZ",
  "REVIEW",
  "MASTERED",
] as const;

/**
 * POST /api/classroom/start
 * Body: { topicId }
 *
 * Phase 16 — starts (or resumes) a guided ClassroomSession.
 *
 *  - If the user has an existing ClassroomSession with status='active'
 *    for this topic, it is returned as-is (resume).
 *  - Otherwise a new ClassroomSession is created with
 *    flowState='ASSESSMENT', currentStep=0, totalSteps=6.
 *  - A UserTopicFlow row is also created/updated so the per-topic
 *    flow state is consistent between sessions.
 *  - The active session id is stamped onto StudyRoomState so the
 *    room UI can deep-link back into the classroom.
 *
 * Returns: { session, flowState, currentStep, progress }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { topicId?: string };

  const topicId = (body.topicId ?? "").toString().trim();
  if (!topicId) {
    return NextResponse.json(
      { error: "topicId is required." },
      { status: 400 }
    );
  }

  // Verify the topic
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Look for an existing active session for this user+topic
  let session = await db.classroomSession.findFirst({
    where: {
      userId: user.id,
      topicId: topic.id,
      status: "active",
    },
    orderBy: { lastActivity: "desc" },
  }).catch(() => null);

  // Resume the active session if one exists
  if (session) {
    // Bump lastActivity so "resume" looks fresh
    session = await db.classroomSession.update({
      where: { id: session.id },
      data: { lastActivity: new Date() },
    });

    // Make sure the room state points at this session
    await db.studyRoomState.update({
      where: { userId_topicId: { userId: user.id, topicId: topic.id } },
      data: { currentClassroomSessionId: session.id, lastVisited: new Date() },
    }).catch(() => {});

    await recordActivity(user.id, 0).catch(() => {});

    return NextResponse.json({
      session,
      flowState: session.flowState,
      currentStep: session.currentStep,
      progress: session.progress,
      resumed: true,
    });
  }

  // Otherwise — start a new session.
  //   If the user already has a UserTopicFlow row (from intake diagnostic),
  //   honour the saved currentState as the starting flowState. Otherwise
  //   default to ASSESSMENT.
  const flow = await db.userTopicFlow.findUnique({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    select: { currentState: true, progress: true },
  }).catch(() => null);

  const startState = flow?.currentState ?? "ASSESSMENT";
  const startProgress = flow?.progress ?? 0;

  session = await db.classroomSession.create({
    data: {
      userId: user.id,
      topicId: topic.id,
      flowState: startState,
      currentStep: 0,
      totalSteps: FLOW_STATES.length,
      progress: startProgress,
      status: "active",
      lastActivity: new Date(),
    },
  });

  // Create / update the per-topic flow row to match the new session
  await db.userTopicFlow.upsert({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    create: {
      userId: user.id,
      topicId: topic.id,
      currentState: startState,
      progress: startProgress,
      lastActivity: new Date(),
    },
    update: {
      currentState: startState,
      progress: startProgress,
      lastActivity: new Date(),
    },
  }).catch(() => {});

  // Stamp the active session onto the room state
  await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    create: {
      userId: user.id,
      topicId: topic.id,
      currentClassroomSessionId: session.id,
      lastVisited: new Date(),
    },
    update: {
      currentClassroomSessionId: session.id,
      lastVisited: new Date(),
    },
  }).catch(() => {});

  await recordActivity(user.id, 0).catch(() => {});

  return NextResponse.json({
    session,
    flowState: session.flowState,
    currentStep: session.currentStep,
    progress: session.progress,
    resumed: false,
  });
}
