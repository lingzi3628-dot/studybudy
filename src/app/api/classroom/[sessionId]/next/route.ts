import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordActivity } from "@/lib/gamify";
import {
  FLOW_STATES,
  nextFlowState,
  toolsForState,
  messageForState,
} from "@/lib/classroom-flow";

export const runtime = "nodejs";

/**
 * POST /api/classroom/[sessionId]/next
 *
 * Phase 16 — advances the session to the next flow state.
 *
 *  - ASSESSMENT → LEARNING → PRACTICE → QUIZ → REVIEW → MASTERED
 *  - When at MASTERED, the call is a no-op (returns the current state).
 *  - Updates ClassroomSession.flowState / currentStep / progress and
 *    mirrors that onto UserTopicFlow.
 *  - Returns the new state, step, progress, availableTools, and a
 *    pre-canned Professor Bloomer message for the new state.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;

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

  // If the session is already done, no-op
  if (session.status === "completed" || session.flowState === "MASTERED") {
    return NextResponse.json({
      newState: session.flowState,
      currentStep: session.currentStep,
      progress: session.progress,
      professorMessage: messageForState(session.flowState),
      availableTools: toolsForState(session.flowState),
      advanced: false,
    });
  }

  // Compute the next state
  const newState = nextFlowState(session.flowState);

  // Step the cursor + recompute progress (0..1) from the step index
  const newStep = Math.min(session.currentStep + 1, session.totalSteps);
  const newProgress =
    session.totalSteps > 0
      ? Math.min(1, newStep / session.totalSteps)
      : 0;

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

  // Mark the session completed when we land on MASTERED
  if (newState === "MASTERED") {
    await db.classroomSession.update({
      where: { id: session.id },
      data: { status: "completed", completedAt: new Date() },
    }).catch(() => {});
  }

  await recordActivity(user.id, 0).catch(() => {});

  return NextResponse.json({
    newState: updated.flowState,
    currentStep: updated.currentStep,
    progress: updated.progress,
    professorMessage: messageForState(newState),
    availableTools: toolsForState(newState),
    advanced: true,
  });
}

// Re-export for any callers that need the canonical list
export { FLOW_STATES };
