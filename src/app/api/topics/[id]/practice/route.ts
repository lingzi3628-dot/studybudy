import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/topics/[id]/practice?limit=20
 *
 * Returns practice cards for the topic — due cards first (via card_reviews),
 * then unseen cards, then any remaining cards.
 *
 * If the topic has no cards yet, returns an empty array (the frontend will show
 * a "Generate practice cards" button that calls /api/generate/cards).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const url = new URL(req.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 20));

  const topic = await db.topic.findUnique({ where: { id } });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // All cards for this topic (via topicId OR subject+topic string match)
  const allCards = await db.card.findMany({
    where: {
      OR: [
        { topicId: topic.id },
        {
          subject: { equals: topic.subject, mode: "insensitive" },
          topic: { equals: topic.name, mode: "insensitive" },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  if (allCards.length === 0) {
    return NextResponse.json({ cards: [], dueCards: [], newCards: [], totalCards: 0 });
  }

  // Fetch all card_reviews for this user + these cards
  const cardIds = allCards.map((c) => c.id);
  const reviews = await db.cardReview.findMany({
    where: {
      userId: user.id,
      cardId: { in: cardIds },
    },
    select: { cardId: true, dueDate: true, easeFactor: true, repetitions: true, lapses: true },
  });

  const now = new Date();
  const reviewMap = new Map(reviews.map((r) => [r.cardId, r]));

  const due: typeof allCards = [];
  const unseen: typeof allCards = [];
  const seen: typeof allCards = [];

  for (const c of allCards) {
    const r = reviewMap.get(c.id);
    if (!r) unseen.push(c);
    else if (r.dueDate <= now) due.push(c);
    else seen.push(c);
  }

  // Order: due first, then unseen (for new learning), then seen-not-due
  const ordered = [...due, ...unseen, ...seen].slice(0, limit);

  return NextResponse.json({
    cards: ordered.map((c) => ({
      id: c.id,
      cardType: c.cardType,
      front: c.front,
      back: c.back,
      question: c.question,
      options: c.options,
      correctIndex: c.correctIndex,
      explanation: c.explanation,
      subject: c.subject,
      topic: c.topic,
      topicId: c.topicId,
    })),
    dueCount: due.length,
    newCount: unseen.length,
    totalCards: allCards.length,
  });
}
