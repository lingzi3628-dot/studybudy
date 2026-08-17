import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAttempt } from "@/lib/progression";

export const runtime = "nodejs";

/**
 * POST /api/attempts
 * Body: { cardId, selectedIndex, isCorrect, responseTimeMs? }
 *
 * Logs the attempt, updates topic_mastery + card_reviews via the
 * progression + memory engines.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const cardId = (body.cardId ?? "").toString();
  const selectedIndex =
    typeof body.selectedIndex === "number" ? body.selectedIndex : null;
  const isCorrect = Boolean(body.isCorrect);
  const responseTimeMs =
    typeof body.responseTimeMs === "number" ? body.responseTimeMs : null;

  if (!cardId) {
    return NextResponse.json({ error: "Missing cardId" }, { status: 400 });
  }

  try {
    await recordAttempt({
      userId: user.id,
      cardId,
      selectedIndex,
      isCorrect,
      responseTimeMs,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to record attempt" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
