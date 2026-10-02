import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markChatQuizAttempt, AssessmentError } from "@/lib/assessment";

export const runtime = "nodejs";

/**
 * POST /api/quiz/submit — Phase 2
 *
 * Server-verified quiz marking for chat-generated quizzes.
 *
 * The client submits the learner's selectedIndex. The server reads the
 * correctIndex from the stored quiz spec (in ChatMessage.attachments),
 * derives isCorrect, and awards XP idempotently.
 *
 * The client NEVER receives the answer key until after submission.
 *
 * Body: {
 *   conversationId: string,    // the chat that generated the quiz
 *   questionIndex: number,     // which question (0-based)
 *   selectedIndex: number,    // what the learner chose
 *   responseTimeMs?: number,
 *   idempotencyKey?: string,   // for replay protection
 * }
 *
 * Response: {
 *   ok: true,
 *   attemptId: string,
 *   isCorrect: boolean,        // SERVER-DERIVED
 *   correctIndex: number,     // revealed only AFTER submission
 *   explanation: string | null,
 *   xpAwarded: number,
 *   replayed: boolean,        // true if this was a replay
 * }
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const conversationId = (body.conversationId ?? "").toString().trim();
  const questionIndex = typeof body.questionIndex === "number" ? body.questionIndex : -1;
  const selectedIndex = typeof body.selectedIndex === "number" ? body.selectedIndex : -1;
  const responseTimeMs = typeof body.responseTimeMs === "number" ? body.responseTimeMs : null;
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).trim() : null;

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }
  if (questionIndex < 0) {
    return NextResponse.json({ error: "questionIndex must be a non-negative number" }, { status: 400 });
  }
  if (selectedIndex < 0) {
    return NextResponse.json({ error: "selectedIndex must be a non-negative number" }, { status: 400 });
  }

  try {
    const result = await markChatQuizAttempt({
      userId: user.id,
      conversationId,
      questionIndex,
      selectedIndex,
      responseTimeMs,
      idempotencyKey,
    });

    return NextResponse.json({
      ok: true,
      attemptId: result.attemptId,
      isCorrect: result.isCorrect,
      correctIndex: result.correctIndex,
      explanation: result.explanation,
      xpAwarded: result.xpAwarded,
      replayed: result.replayed,
    });
  } catch (e: any) {
    if (e instanceof AssessmentError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e?.message ?? "Failed to submit quiz answer" },
      { status: 500 },
    );
  }
}
