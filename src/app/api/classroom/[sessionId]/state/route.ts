import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toolsForState, messageForState } from "@/lib/classroom-flow";

export const runtime = "nodejs";

/**
 * GET /api/classroom/[sessionId]/state
 *
 * Phase 16 — returns the current state of a guided ClassroomSession.
 *  - Verifies the session belongs to the current user
 *  - Returns the session, current flowState/step/progress, the list of
 *    tools available in this state, and a pre-canned message from
 *    Professor Bloomer that fits the current flow position.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;

  const session = await db.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      topic: { select: { id: true, name: true, subject: true, description: true } },
    },
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

  const availableTools = toolsForState(session.flowState);
  const professorMessage = messageForState(session.flowState);

  return NextResponse.json({
    session: {
      id: session.id,
      topicId: session.topicId,
      flowState: session.flowState,
      progress: session.progress,
      currentStep: session.currentStep,
      totalSteps: session.totalSteps,
      status: session.status,
      startedAt: session.startedAt,
      lastActivity: session.lastActivity,
      completedAt: session.completedAt,
    },
    topic: session.topic,
    flowState: session.flowState,
    currentStep: session.currentStep,
    progress: session.progress,
    availableTools,
    professorMessage,
  });
}
