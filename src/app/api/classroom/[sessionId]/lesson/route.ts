import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/classroom/[sessionId]/lesson
 *
 * Returns the whiteboard lesson blocks for this classroom session.
 *  - Verifies the session belongs to the current user
 *  - Pulls blocks from LessonContent cache (by topicId) or falls back to topic.lessonContent
 *  - Includes session progress info (currentTestIndex, progress)
 *
 * Returns: { blocks, currentTestIndex, progress }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;

  // 1. Fetch session + verify ownership
  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      topic: {
        select: {
          id: true,
          name: true,
          subject: true,
          description: true,
          lessonContent: true,
        },
      },
    },
  }).catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.userId !== user.id) {
    return NextResponse.json({ error: "You don't have access to this session." }, { status: 403 });
  }

  // 2. Pull lesson blocks — prefer LessonContent cache (latest), fallback to topic.lessonContent
  let blocks: any[] = [];
  const cached = await db.lessonContent.findFirst({
    where: { topicId: session.topicId },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  if (cached && Array.isArray(cached.contentJson as any) && (cached.contentJson as any[]).length > 0) {
    blocks = (cached.contentJson as any[]).filter(
      (b: any) =>
        b &&
        typeof b === "object" &&
        typeof b.content === "string" &&
        ["heading", "text", "equation", "bullet"].includes(b.type)
    );
  } else if (Array.isArray(session.topic?.lessonContent as any)) {
    blocks = (session.topic.lessonContent as any[]).filter(
      (b: any) =>
        b &&
        typeof b === "object" &&
        typeof b.content === "string" &&
        ["heading", "text", "equation", "bullet"].includes(b.type)
    );
  }

  return NextResponse.json({
    blocks,
    currentTestIndex: session.currentTestIndex,
    progress: session.progress,
    topic: {
      id: session.topic.id,
      name: session.topic.name,
      subject: session.topic.subject,
      description: session.topic.description,
    },
    durationMinutes: session.durationMinutes,
    status: session.status,
  });
}
