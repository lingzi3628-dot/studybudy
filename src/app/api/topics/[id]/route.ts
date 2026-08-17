import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/topics/[id]
 * Returns: topic details + related cards + topic mastery for current user.
 *
 * Cards are matched by:
 *   1. Direct topicId link (Phase 4)
 *   2. Subject + topic string match (Phase 2 fallback for older data)
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;

  const topic = await db.topic.findUnique({ where: { id } });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Cards linked directly OR by subject+topic string match
  const cards = await db.card.findMany({
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
    take: 200,
  });

  // Mastery for this topic
  const mastery = await db.topicMastery.findUnique({
    where: {
      userId_subject_topic: {
        userId: user.id,
        subject: topic.subject,
        topic: topic.name,
      },
    },
  });

  // Total + correct attempts on cards linked to this topic
  const attemptAgg = await db.attempt.findMany({
    where: {
      userId: user.id,
      card: {
        OR: [
          { topicId: topic.id },
          {
            subject: { equals: topic.subject, mode: "insensitive" },
            topic: { equals: topic.name, mode: "insensitive" },
          },
        ],
      },
    },
    select: { isCorrect: true },
  });
  const totalAttempts = attemptAgg.length;
  const correctAttempts = attemptAgg.filter((a) => a.isCorrect).length;
  const masteryLevel = mastery?.masteryLevel ?? (totalAttempts > 0 ? (correctAttempts + 1) / (totalAttempts + 2) : 0);

  // Due cards (via card_reviews for this user that are linked to this topic)
  const now = new Date();
  const dueCards = await db.cardReview.findMany({
    where: {
      userId: user.id,
      dueDate: { lte: now },
      card: {
        OR: [
          { topicId: topic.id },
          {
            subject: { equals: topic.subject, mode: "insensitive" },
            topic: { equals: topic.name, mode: "insensitive" },
          },
        ],
      },
    },
    take: 20,
    select: { cardId: true },
  });

  // Related topics (same subject, different name)
  const relatedTopics = await db.topic.findMany({
    where: {
      subject: { equals: topic.subject, mode: "insensitive" },
      NOT: { name: { equals: topic.name, mode: "insensitive" } },
    },
    take: 5,
    select: { id: true, subject: true, name: true, description: true },
  });

  return NextResponse.json({
    topic: {
      id: topic.id,
      subject: topic.subject,
      name: topic.name,
      description: topic.description,
      createdAt: topic.createdAt,
    },
    cards: cards.map((c) => ({
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
    mastery: {
      level: Math.round(masteryLevel * 1000) / 1000,
      totalAttempts,
      correctAttempts,
      dueCount: dueCards.length,
    },
    relatedTopics,
  });
}
