import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDueCards } from "@/lib/progression";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/review/recommended — convenience endpoint that returns the
 * user's recommended review cards (due cards biased toward weak topics)
 * AND the user's weak topics in a single response. This saves Home from
 * having to issue two separate API calls on mount.
 *
 * Response shape:
 *   {
 *     cards: Card[],                // up to 20 due cards, weak-topic first
 *     weakTopics: Array<{            // up to 6, sorted ascending by mastery
 *       subject: string,
 *       topic: string,
 *       mastery: number,            // 0..1
 *       dueCardCount: number,        // how many of `cards` are from this topic
 *       totalAttempts: number,
 *       correctAttempts: number,
 *     }>,
 *   }
 */
export async function GET() {
  const user = await getCurrentUser();

  // Fetch up to 20 due cards biased toward weak topics (single query plan)
  const cards = await getDueCards(user.id, 20, { bias: "weak" });

  // Fetch the user's weak topics (mastery < 0.6, totalAttempts >= 1) —
  // same threshold as /api/progress for consistency.
  const weak = await db.topicMastery.findMany({
    where: { userId: user.id, masteryLevel: { lt: 0.6 }, totalAttempts: { gte: 1 } },
    orderBy: { masteryLevel: "asc" },
    take: 6,
    select: {
      subject: true,
      topic: true,
      masteryLevel: true,
      totalAttempts: true,
      correctAttempts: true,
    },
  });

  // Count how many of the returned cards belong to each weak topic
  const cardCountByTopic = new Map<string, number>();
  for (const c of cards) {
    if (!c.subject || !c.topic) continue;
    const k = `${c.subject}||${c.topic}`;
    cardCountByTopic.set(k, (cardCountByTopic.get(k) ?? 0) + 1);
  }

  const weakTopics = weak.map((m) => ({
    subject: m.subject,
    topic: m.topic,
    mastery: m.masteryLevel,
    dueCardCount: cardCountByTopic.get(`${m.subject}||${m.topic}`) ?? 0,
    totalAttempts: m.totalAttempts,
    correctAttempts: m.correctAttempts,
  }));

  return NextResponse.json({ cards, weakTopics });
}
