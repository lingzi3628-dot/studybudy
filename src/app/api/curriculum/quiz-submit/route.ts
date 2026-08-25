import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordQuizAttempt } from "@/lib/capacity-engine";

export const runtime = "nodejs";

/**
 * POST /api/curriculum/quiz-submit
 *
 * Records a quiz attempt for the capacity engine.
 * Body: { topicId: string, score: number (0..1), timeSpentSec: number }
 *
 * Returns the updated capacity info + recommendation.
 *
 * NOTE: This is SEPARATE from the existing quiz grading in the
 * CurriculumTopicView — that one grades locally on the client. This
 * route persists the result to the capacity engine so progression is
 * tracked across sessions.
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
  const topicId = (body?.topicId ?? "").toString().trim();
  const score = Number(body?.score ?? 0);
  const timeSpentSec = Number(body?.timeSpentSec ?? 0);

  if (!topicId) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }
  if (score < 0 || score > 1) {
    return NextResponse.json(
      { error: "score must be between 0 and 1" },
      { status: 400 }
    );
  }

  try {
    const capacity = await recordQuizAttempt(user.id, topicId, score, timeSpentSec);
    return NextResponse.json({ ok: true, capacity });
  } catch (e: any) {
    if (e?.code === "P2021") {
      // Tables don't exist yet — return a best-effort response
      return NextResponse.json({
        ok: true,
        capacity: {
          capacityScore: Math.round(score * 100),
          recommendation: score >= 0.85 ? "mastered" : score >= 0.6 ? "advance" : "practice",
          recommendationText: "Quiz submitted (capacity engine not yet initialized).",
        },
        tablesMissing: true,
      });
    }
    return NextResponse.json(
      { error: "Failed to record quiz", detail: e?.message },
      { status: 500 }
    );
  }
}
