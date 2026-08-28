import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDueCards } from "@/lib/progression";

export const runtime = "nodejs";

/**
 * GET /api/review/queue — cards due now for the current user.
 *
 * Query params (all optional):
 *   - limit   (default 20, max 50) — number of cards to return
 *   - bias    ("weak")             — surface cards from weak topics (mastery < 0.6) first
 *   - topicId                       — only return cards linked to this Topic
 *   - subject + topic               — only return cards matching this (subject, topic) pair
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const bias = url.searchParams.get("bias") === "weak" ? "weak" as const : undefined;
  const topicId = url.searchParams.get("topicId") ?? undefined;
  const subject = url.searchParams.get("subject") ?? undefined;
  const topic = url.searchParams.get("topic") ?? undefined;

  const cards = await getDueCards(user.id, limit, { bias, topicId, subject, topic });
  return NextResponse.json({ cards });
}
