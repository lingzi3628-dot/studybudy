import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordActivity } from "@/lib/gamify";
import {
  nextFlowState,
  toolsForState,
  messageForState,
} from "@/lib/classroom-flow";

export const runtime = "nodejs";

type CompleteStepBody = {
  step?: string;
  result?: "pass" | "fail" | "skip";
  score?: number;
};

/**
 * POST /api/classroom/[sessionId]/complete-step
 * Body: { step, result }
 *
 * Phase 16 — records the completion of a flow step.
 *
 *  - If result === "pass", the session advances to the next flow state
 *    (mirrors what /next does, but triggered by actually finishing a
 *    tool — e.g. passing the quiz).
 *  - If result === "fail" (quiz score < 0.7), the session does NOT
 *    advance. Instead it is dropped back into PRACTICE for extra
 *    drilling (we set flowState='PRACTICE' and bump progress back by
 *    one step so the student gets another swing before the quiz).
 *  - "skip" advances without rewarding/penalizing.
 *  - lastActivity is bumped either way.
 *
 * Returns: { updated: true, progress, nextState }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;
  const body = (await req.json().catch(() => ({}))) as CompleteStepBody;

  const session = await db.classroomSession.findUnique({
    where: { id: sessionId },
  }).catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.userId !== user.id) {
    return NextResponse.json(
      { error: "You don't have access to this session." },
      { status: 403 }
    );
  }

  // If the session is already completed, no-op
  if (session.status === "completed") {
    return NextResponse.json({
      updated: false,
      progress: session.progress,
      nextState: session.flowState,
      professorMessage: messageForState(session.flowState),
      availableTools: toolsForState(session.flowState),
    });
  }

  const result = body.result ?? "pass";
  const quizScore =
    typeof body.score === "number" && !isNaN(body.score) ? body.score : null;

  // A failed quiz (score < 0.7) drops the student back to extra practice
  const isFail = result === "fail" || (quizScore !== null && quizScore < 0.7);

  let newStep: number;
  let newProgress: number;
  let newState: string;

  if (isFail && session.flowState !== "ASSESSMENT" && session.flowState !== "PRACTICE") {
    // Insert extra PRACTICE — drop state to PRACTICE, hold step where it is
    // (we don't rewind the step counter so progress stays roughly honest).
    newState = "PRACTICE";
    newStep = Math.max(session.currentStep, 1); // ensure non-zero
    newProgress =
      session.totalSteps > 0
        ? Math.min(1, newStep / session.totalSteps)
        : 0;
  } else if (result === "skip" || session.flowState === "MASTERED") {
    // No advance, just a heartbeat
    newState = session.flowState;
    newStep = session.currentStep;
    newProgress = session.progress;
  } else {
    // Pass — advance one state
    newState = nextFlowState(session.flowState);
    newStep = Math.min(session.currentStep + 1, session.totalSteps);
    newProgress =
      session.totalSteps > 0
        ? Math.min(1, newStep / session.totalSteps)
        : 0;
  }

  const updated = await db.classroomSession.update({
    where: { id: session.id },
    data: {
      flowState: newState,
      currentStep: newStep,
      progress: newProgress,
      lastActivity: new Date(),
    },
  });

  // Mirror onto UserTopicFlow
  await db.userTopicFlow.upsert({
    where: { userId_topicId: { userId: user.id, topicId: session.topicId } },
    create: {
      userId: user.id,
      topicId: session.topicId,
      currentState: newState,
      progress: newProgress,
      lastActivity: new Date(),
    },
    update: {
      currentState: newState,
      progress: newProgress,
      lastActivity: new Date(),
    },
  }).catch(() => {});

  // Auto-complete the session when landing on MASTERED
  if (newState === "MASTERED") {
    await db.classroomSession.update({
      where: { id: session.id },
      data: { status: "completed", completedAt: new Date() },
    }).catch(() => {});
  }

  await recordActivity(user.id, 0).catch(() => {});

  return NextResponse.json({
    updated: true,
    progress: updated.progress,
    nextState: newState,
    currentStep: updated.currentStep,
    professorMessage: messageForState(newState),
    availableTools: toolsForState(newState),
    needsExtraPractice: isFail,
  });
}
