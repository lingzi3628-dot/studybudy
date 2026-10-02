import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markCardAttempt, AssessmentError } from "@/lib/assessment";

export const runtime = "nodejs";

/**
 * POST /api/attempts
 *
 * Phase 2 — SERVER-VERIFIED marking.
 *
 * Body: { cardId, selectedIndex, responseTimeMs?, idempotencyKey? }
 *
 * The client-supplied `isCorrect` field is IGNORED. The server fetches the
 * Card, checks selectedIndex === card.correctIndex, and derives isCorrect.
 *
 * XP and mastery updates are idempotent — they reference the attemptId so
 * re-processing the same attempt is a no-op.
 *
 * Response: { ok, attemptId, isCorrect, correctIndex, explanation, xpAwarded }
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const cardId = (body.cardId ?? "").toString();
  const selectedIndex =
    typeof body.selectedIndex === "number" ? body.selectedIndex : null;
  const responseTimeMs =
    typeof body.responseTimeMs === "number" ? body.responseTimeMs : null;
  const idempotencyKey = body.idempotencyKey
    ? String(body.idempotencyKey).trim()
    : null;

  // NOTE: body.isCorrect is INTENTIONALLY IGNORED — server re-derives it.
  // This prevents XP/mastery farming via client-supplied isCorrect: true.

  if (!cardId) {
    return NextResponse.json({ error: "Missing cardId" }, { status: 400 });
  }

  try {
    const result = await markCardAttempt({
      userId: user.id,
      cardId,
      selectedIndex,
      responseTimeMs,
      idempotencyKey,
      clientIsCorrect: body.isCorrect, // ignored — kept in signature for backward compat
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
      { error: e?.message ?? "Failed to record attempt" },
      { status: 500 },
    );
  }
}
