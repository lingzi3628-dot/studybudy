import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/classroom/[sessionId]/save
 *
 * Phase 16 — a lightweight auto-save endpoint. The client pings it
 * periodically while the student is in the classroom so the session's
 * lastActivity timestamp stays fresh (useful for "recently active"
 * sorting and resume logic in /classroom/start).
 *
 * Returns: { ok: true }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({})) as { activeSeconds?: number };
  const activeSeconds = Number.isFinite(Number(body.activeSeconds))
    ? Math.max(0, Math.floor(Number(body.activeSeconds)))
    : undefined;

  // Only bump lastActivity — and only if the session belongs to this user.
  // Use updateMany so we don't 500 on a missing session id (returns count=0).
  const result = await db.classroomSession.updateMany({
    where: { id: sessionId, userId: user.id },
    data: { lastActivity: new Date(), ...(activeSeconds === undefined ? {} : { activeSeconds }) },
  }).catch(() => null);

  if (result && result.count > 0) {
    return NextResponse.json({ ok: true });
  }

  // Either the session doesn't exist, or it doesn't belong to the user.
  return NextResponse.json(
    { error: "Session not found." },
    { status: 404 }
  );
}
