/**
 * Progression engine.
 *
 * - topic_mastery: Laplace-smoothed mastery = (correct + 1) / (total + 2)
 * - Weak areas: topics with mastery < 0.6
 *
 * All persistence is handled here so API routes stay thin.
 */
import { db } from "./db";
import { sm2Update, defaultCardState, type CardReviewState } from "./memory";

export type Quality = 0 | 5; // 0 = incorrect / still learning, 5 = correct / knew it

/**
 * Record an attempt, update topic_mastery, and update the card_reviews row
 * using the SM-2 algorithm.
 *
 * Called by /api/attempts and /api/review/submit.
 */
export async function recordAttempt(args: {
  userId: string;
  cardId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  responseTimeMs?: number | null;
}): Promise<void> {
  const { userId, cardId, selectedIndex, isCorrect, responseTimeMs } = args;

  // Fetch the card to know subject/topic + whether it's MCQ or flashcard
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { subject: true, topic: true, cardType: true },
  });
  if (!card) throw new Error("Card not found");

  const subject = card.subject ?? "General";
  const topic = card.topic ?? "General";

  // 1) log attempt
  await db.attempt.create({
    data: {
      userId,
      cardId,
      selectedIndex,
      isCorrect,
      responseTimeMs: responseTimeMs ?? null,
    },
  });

  // 2) update topic_mastery (Laplace smoothing)
  await db.topicMastery.upsert({
    where: {
      userId_subject_topic: { userId, subject, topic },
    },
    create: {
      userId,
      subject,
      topic,
      totalAttempts: 1,
      correctAttempts: isCorrect ? 1 : 0,
      masteryLevel: (isCorrect ? 1 : 0 + 1) / (1 + 2), // (correct+1)/(total+2)
      lastUpdated: new Date(),
    },
    update: {
      totalAttempts: { increment: 1 },
      correctAttempts: { increment: isCorrect ? 1 : 0 },
      lastUpdated: new Date(),
    },
  });

  // recompute Laplace-smoothed mastery
  const mastery = await db.topicMastery.findUnique({
    where: {
      userId_subject_topic: { userId, subject, topic },
    },
  });
  if (mastery) {
    const smoothed = (mastery.correctAttempts + 1) / (mastery.totalAttempts + 2);
    await db.topicMastery.update({
      where: { id: mastery.id },
      data: { masteryLevel: Math.round(smoothed * 1000) / 1000 },
    });
  }

  // 3) SM-2 update for the card review
  const quality: number = isCorrect ? 5 : 0;
  const existing = await db.cardReview.findUnique({
    where: { userId_cardId: { userId, cardId } },
  });

  const prevState: CardReviewState = existing
    ? {
        easeFactor: existing.easeFactor,
        intervalDays: existing.intervalDays,
        repetitions: existing.repetitions,
        lapses: existing.lapses,
        lastReviewDate: existing.lastReviewDate,
        dueDate: existing.dueDate,
      }
    : defaultCardState();

  const next = sm2Update(prevState, quality);

  if (existing) {
    await db.cardReview.update({
      where: { id: existing.id },
      data: {
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        lapses: next.lapses,
        lastReviewDate: next.lastReviewDate,
        dueDate: next.dueDate,
      },
    });
  } else {
    await db.cardReview.create({
      data: {
        userId,
        cardId,
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        lapses: next.lapses,
        lastReviewDate: next.lastReviewDate,
        dueDate: next.dueDate,
      },
    });
  }
}

/** Returns the user's cards due now (up to `limit`).
 *  Phase 45: supports optional `bias: "weak"` to surface cards from weak topics
 *  (mastery < 0.6, matching /api/progress threshold) first, and optional
 *  `topicId` filter to limit to a single topic.
 */
export async function getDueCards(
  userId: string,
  limit = 20,
  opts?: { bias?: "weak"; topicId?: string; subject?: string; topic?: string }
) {
  const now = new Date();

  // Build the where clause — base: due cards for this user
  const where: any = {
    userId,
    dueDate: { lte: now },
  };

  // Optional topicId filter (direct link on the Card)
  if (opts?.topicId) {
    where.card = { topicId: opts.topicId };
  } else if (opts?.subject && opts?.topic) {
    // Or filter by (subject, topic) on the Card
    where.card = { subject: opts.subject, topic: opts.topic };
  }

  // Fetch up to 100 due cards so we have headroom to re-rank by weak-topic bias
  const due = await db.cardReview.findMany({
    where,
    take: 100,
    orderBy: { dueDate: "asc" },
    include: { card: true },
  });

  // If no bias requested, return the earliest-due `limit` cards as before.
  if (!opts?.bias || opts.bias !== "weak") {
    return due.slice(0, limit).map((r) => r.card);
  }

  // Pull the user's weak topics (mastery < 0.6, totalAttempts >= 1).
  // Same threshold as /api/progress for consistency.
  const weak = await db.topicMastery.findMany({
    where: { userId, masteryLevel: { lt: 0.6 }, totalAttempts: { gte: 1 } },
    select: { subject: true, topic: true, masteryLevel: true },
  });
  // Build a quick lookup set of "subject||topic" weak keys
  const weakKeys = new Set(weak.map((m) => `${m.subject}||${m.topic}`));

  // Partition due cards: weak-topic cards first (stable by dueDate), then the rest.
  const weakCards = due.filter((r) =>
    r.card.subject && r.card.topic && weakKeys.has(`${r.card.subject}||${r.card.topic}`)
  );
  const otherCards = due.filter((r) =>
    !(r.card.subject && r.card.topic && weakKeys.has(`${r.card.subject}||${r.card.topic}`))
  );

  // Within each partition, the original dueDate ASC order is preserved.
  const ranked = [...weakCards, ...otherCards].slice(0, limit);
  return ranked.map((r) => r.card);
}

/** Count of due cards — for the Home badge. */
export async function countDueCards(userId: string): Promise<number> {
  const now = new Date();
  return db.cardReview.count({
    where: {
      userId,
      dueDate: { lte: now },
    },
  });
}
