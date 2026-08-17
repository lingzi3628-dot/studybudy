import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAttempt } from "@/lib/progression";

export const runtime = "nodejs";

/**
 * POST /api/review/submit
 * Body: { cardId, quality (0..5), selectedIndex?, responseTimeMs? }
 *
 * quality: 0 = "still learning" / incorrect, 5 = "knew it" / correct.
 * Updates card_reviews via SM-2 and logs an attempt.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const cardId = (body.cardId ?? "").toString();
  const qualityRaw = Number(body.quality ?? 0);
  const quality = Math.max(0, Math.min(5, qualityRaw));
  const selectedIndex =
    typeof body.selectedIndex === "number" ? body.selectedIndex : null;
  const responseTimeMs =
    typeof body.responseTimeMs === "number" ? body.responseTimeMs : null;

  if (!cardId) {
    return NextResponse.json({ error: "Missing cardId" }, { status: 400 });
  }

  // For SM-2 we treat quality >= 3 as correct.
  const isCorrect = quality >= 3;

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
      { error: e?.message ?? "Failed to record review" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, quality });
}
