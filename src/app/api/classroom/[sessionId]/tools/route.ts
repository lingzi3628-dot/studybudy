import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toolCatalogForState } from "@/lib/classroom-flow";

export const runtime = "nodejs";

/**
 * GET /api/classroom/[sessionId]/tools
 *
 * Phase 16 — returns the catalog of classroom tools with their
 * availability for the session's current flow state. Each tool has
 * { key, label, icon, available }.
 *
 * Returns: { tools: [{key, label, icon, available}], flowState }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;

  const session = await db.classroomSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      flowState: true,
      currentStep: true,
      progress: true,
      status: true,
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

  const tools = toolCatalogForState(session.flowState);

  return NextResponse.json({
    tools,
    flowState: session.flowState,
    currentStep: session.currentStep,
    progress: session.progress,
    status: session.status,
  });
}
