import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/curriculum/session
 *
 * Creates a new study session (called when the student opens a topic).
 * Body: { subjectId?, topicId? }
 *
 * GET /api/curriculum/session
 *   Returns the user's last incomplete session (for "continue where you left off").
 *
 * PATCH /api/curriculum/session
 *   Updates the active session (called periodically + on exit).
 *   Body: { sessionId, durationSec?, lastScreen?, flashcardsReviewed?, quizzesTaken?, topicsStudied?, status? }
 *
 * This fixes the "data loss on dismiss" bug — the study room now saves
 * progress to the DB so the student can resume tomorrow.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const subjectId = (body?.subjectId ?? "").toString().trim() || null;
  const topicId = (body?.topicId ?? "").toString().trim() || null;

  try {
    // Mark any existing active sessions as 'abandoned'
    await db.studySession.updateMany({
      where: { userId: user.id, status: "active" },
      data: { status: "abandoned", endedAt: new Date() },
    }).catch(() => {});

    // Create a new active session
    const session = await db.studySession.create({
      data: {
        userId: user.id,
        subjectId,
        topicId,
        startedAt: new Date(),
        status: "active",
        lastScreen: "topic_lesson",
      },
    });

    // Log to calendar
    await db.calendarEntry.create({
      data: {
        userId: user.id,
        date: new Date(),
        type: "study",
        title: "Study session started",
        subjectId,
        topicId,
      },
    }).catch(() => {});

    return NextResponse.json({ session });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ error: "Study sessions not yet initialized" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  try {
    // Find the most recent active or abandoned session
    const session = await db.studySession.findFirst({
      where: {
        userId: user.id,
        status: { in: ["active", "abandoned"] },
      },
      orderBy: { startedAt: "desc" },
    });

    if (!session) {
      return NextResponse.json({ session: null, hasIncomplete: false });
    }

    // Fetch subject info separately (to avoid type issues with include)
    let subjectInfo: any = null;
    if (session.subjectId) {
      const subj = await db.curriculumSubject.findUnique({
        where: { id: session.subjectId },
        select: { name: true, icon: true, color: true },
      }).catch(() => null);
      subjectInfo = subj;
    }

    const sessionWithSubject = { ...session, subject: subjectInfo };

    // Calculate how long ago (if > 12 hours, it's "yesterday")
    const hoursAgo = (Date.now() - new Date(session.startedAt).getTime()) / (1000 * 60 * 60);

    return NextResponse.json({
      session: sessionWithSubject,
      hasIncomplete: true,
      isYesterday: hoursAgo > 12,
      resumeText: hoursAgo > 12
        ? "Welcome back! Continue where you left off yesterday."
        : "Continue your study session.",
    });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ session: null });
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = (body?.sessionId ?? "").toString().trim();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const patch: any = {};
  if (typeof body?.durationSec === "number") patch.durationSec = body.durationSec;
  if (typeof body?.lastScreen === "string") patch.lastScreen = body.lastScreen;
  if (typeof body?.flashcardsReviewed === "number") patch.flashcardsReviewed = body.flashcardsReviewed;
  if (typeof body?.quizzesTaken === "number") patch.quizzesTaken = body.quizzesTaken;
  if (typeof body?.topicsStudied === "number") patch.topicsStudied = body.topicsStudied;
  if (body?.status === "completed" || body?.status === "abandoned") {
    patch.status = body.status;
    patch.endedAt = new Date();
  }

  try {
    const updated = await db.studySession.update({
      where: { id: sessionId },
      data: patch,
    });

    // If completing, log to calendar
    if (body?.status === "completed" && patch.durationSec > 0) {
      await db.calendarEntry.create({
        data: {
          userId: user.id,
          date: new Date(),
          type: "study",
          title: "Study session completed",
          description: `Studied for ${Math.round(patch.durationSec / 60)} minutes`,
          durationMin: Math.round(patch.durationSec / 60),
          subjectId: updated.subjectId,
          topicId: updated.topicId,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ session: updated });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
