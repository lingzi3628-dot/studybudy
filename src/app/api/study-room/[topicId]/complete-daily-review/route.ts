import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/study-room/[topicId]/complete-daily-review
 * Body: { results: [{ itemId, score }] }
 *
 * Marks today's review as completed, awards XP, bumps streak.
 * Free (no token cost).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as {
    results?: { itemId: string; score: number }[];
  };
  const results = Array.isArray(body.results) ? body.results : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await db.dailyReview.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  }).catch(() => null);

  if (!existing) {
    return NextResponse.json({ error: "No daily review exists for today. Generate one first." }, { status: 404 });
  }
  if (existing.status === "completed") {
    return NextResponse.json({ ok: true, alreadyCompleted: true, message: "Already completed today ✓" });
  }

  // Compute average score
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + (Number(r.score) || 0), 0) / results.length
    : 0;

  await db.dailyReview.update({
    where: { id: existing.id },
    data: {
      status: "completed",
      score: avgScore,
      completedAt: new Date(),
    },
  });

  // Award XP (30 XP for completing daily review)
  const xpResult = await awardXp(user.id, 30);
  await recordActivity(user.id, 0);

  return NextResponse.json({
    ok: true,
    score: avgScore,
    xpGained: 30,
    leveledUp: xpResult.leveledUp,
    newBadges: xpResult.newBadges,
  });
}
