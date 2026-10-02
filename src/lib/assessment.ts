/**
 * Verified Assessment Service — Phase 2
 *
 * SERVER-AUTHORITATIVE quiz/card marking.
 *
 * Core principle: the client submits selectedIndex. The server holds the
 * answer key (correctIndex) and derives isCorrect. The client NEVER
 * decides correctness.
 *
 * This replaces the client-trusted flow in /api/attempts (which accepted
 * isCorrect from the request body) and /api/tutor/track (which awarded XP
 * from client-supplied quizScore/quizTotal).
 *
 * IDEMPOTENCY:
 *   - Each attempt gets a unique attemptId (UUID).
 *   - XP/mastery updates reference the attemptId.
 *   - Re-processing the same attemptId is a no-op (xpAwarded flag).
 *   - Client-supplied idempotencyKey prevents duplicate submissions.
 *
 * WHAT THIS DOES NOT DO:
 *   - Does NOT ship correctIndex to the client (the answer key stays server-side).
 *   - Does NOT trust client-supplied isCorrect.
 *   - Does NOT award XP from /api/tutor/track quizScore.
 *   - Does NOT change the quiz attachment format (legacy captions still work).
 */

import { db } from "./db";
import { logger } from "./logger";
import { recordAttempt } from "./progression";
import { awardXp } from "./gamify";
import { generateId, isValidIdempotencyKey } from "./tutor/turn-manager";

// ============================================================
// Types
// ============================================================

export type VerifiedAttemptResult = {
  attemptId: string;
  isCorrect: boolean;
  correctIndex: number | null;
  explanation: string | null;
  xpAwarded: number;
  /** true if this was a replay of a previous submission (no new XP awarded) */
  replayed: boolean;
};

// ============================================================
// Card-based assessment (flashcards / MCQ from StudySets)
// ============================================================

/**
 * Mark a card attempt SERVER-SIDE.
 *
 * The client sends { cardId, selectedIndex, responseTimeMs }.
 * The server fetches the Card, checks selectedIndex === card.correctIndex,
 * and creates an AssessmentAttempt record.
 *
 * XP is awarded idempotently — if the attemptId was already processed,
 * no new XP is granted.
 *
 * The client-supplied `isCorrect` field is IGNORED — the server always
 * re-derives correctness from the answer key.
 *
 * @returns VerifiedAttemptResult with server-derived isCorrect + correctIndex
 */
export async function markCardAttempt(opts: {
  userId: string;
  cardId: string;
  selectedIndex: number | null;
  responseTimeMs?: number | null;
  /** Client-supplied idempotency key for replay protection */
  idempotencyKey?: string | null;
  /** Client-supplied isCorrect — IGNORED (server re-derives) */
  clientIsCorrect?: boolean;
}): Promise<VerifiedAttemptResult> {
  const { userId, cardId, selectedIndex, responseTimeMs } = opts;

  // 1. Fetch the card — get the answer key (correctIndex) + subject/topic
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      correctIndex: true,
      explanation: true,
      subject: true,
      topic: true,
      cardType: true,
    },
  });

  if (!card) {
    throw new AssessmentError("CARD_NOT_FOUND", "Card not found");
  }

  // 2. SERVER-DERIVE isCorrect — ignore any client-supplied isCorrect
  const correctIndex = card.correctIndex ?? null;
  const isCorrect = correctIndex !== null && selectedIndex !== null
    ? selectedIndex === correctIndex
    : false;

  // 3. Check for replay (same idempotencyKey → return existing attempt)
  if (opts.idempotencyKey && isValidIdempotencyKey(opts.idempotencyKey)) {
    const existing = await db.assessmentAttempt.findFirst({
      where: { userId, idempotencyKey: opts.idempotencyKey },
    });
    if (existing) {
      logger.info("assessment replay — returning existing attempt", {
        userId,
        attemptId: existing.id,
        cardId,
        isCorrect: existing.isCorrect,
      });
      return {
        attemptId: existing.id,
        isCorrect: existing.isCorrect ?? false,
        correctIndex: existing.correctIndex,
        explanation: card.explanation ?? null,
        xpAwarded: 0, // already awarded on first attempt
        replayed: true,
      };
    }
  }

  // 4. Create the AssessmentAttempt record
  const attempt = await db.assessmentAttempt.create({
    data: {
      userId,
      cardId,
      selectedIndex,
      correctIndex,
      isCorrect,
      responseTimeMs: responseTimeMs ?? null,
      xpAwarded: false,
      idempotencyKey: opts.idempotencyKey ?? null,
    },
  });

  // 5. Update mastery + SM-2 via progression engine (using SERVER-DERIVED isCorrect)
  try {
    await recordAttempt({
      userId,
      cardId,
      selectedIndex,
      isCorrect, // SERVER-DERIVED — NOT client-supplied
      responseTimeMs,
    });
  } catch (e: any) {
    logger.warn("recordAttempt failed (non-fatal — attempt still recorded)", {
      userId,
      cardId,
      attemptId: attempt.id,
      error: e?.message,
    });
  }

  // 6. Award XP idempotently (only if not already awarded for this attempt)
  let xpAwarded = 0;
  try {
    const xpResult = await awardXpForAttempt(userId, attempt.id, isCorrect ? 10 : 2);
    xpAwarded = xpResult.awarded;
  } catch (e: any) {
    logger.warn("awardXpForAttempt failed (non-fatal)", {
      userId,
      attemptId: attempt.id,
      error: e?.message,
    });
  }

  // 7. Mark xpAwarded flag on the attempt
  if (xpAwarded > 0) {
    await db.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { xpAwarded: true },
    }).catch(() => {});
  }

  logger.info("assessment marked", {
    userId,
    attemptId: attempt.id,
    cardId,
    isCorrect,
    xpAwarded,
  });

  return {
    attemptId: attempt.id,
    isCorrect,
    correctIndex,
    explanation: card.explanation ?? null,
    xpAwarded,
    replayed: false,
  };
}

// ============================================================
// Chat-quiz assessment (quizzes generated by the AI tutor)
// ============================================================

/**
 * Mark a chat-quiz question SERVER-SIDE.
 *
 * The quiz spec is stored in the ChatMessage.attachments JSON (caption field).
 * The server reads the correctIndex from the stored spec — the client does
 * NOT receive the answer key until after submission.
 *
 * @param conversationId — the chat conversation that generated the quiz
 * @param questionIndex — which question in the quiz (0-based)
 * @param selectedIndex — what the learner chose
 */
export async function markChatQuizAttempt(opts: {
  userId: string;
  conversationId: string;
  questionIndex: number;
  selectedIndex: number;
  responseTimeMs?: number | null;
  idempotencyKey?: string | null;
}): Promise<VerifiedAttemptResult> {
  const { userId, conversationId, questionIndex, selectedIndex, responseTimeMs } = opts;

  // 1. Fetch the conversation (ownership check)
  const conversation = await db.chatConversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        where: { role: "assistant" },
        orderBy: { createdAt: "desc" },
        take: 10, // last 10 assistant messages — quiz is recent
      },
    },
  });

  if (!conversation) {
    throw new AssessmentError("CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  // 2. Find the quiz attachment in the assistant messages
  let quizSpec: any = null;
  let quizMessageId: string | null = null;
  for (const msg of conversation.messages) {
    if (!msg.attachments) continue;
    // Prisma types attachments as Json? — cast to any[] for property access
    const attachments = Array.isArray(msg.attachments) ? (msg.attachments as any[]) : [];
    for (const att of attachments) {
      if (att?.type === "quiz") {
        try {
          quizSpec = JSON.parse(att.caption);
          quizMessageId = msg.id;
          break;
        } catch {
          // caption is not JSON — skip
        }
      }
    }
    if (quizSpec) break;
  }

  if (!quizSpec || !Array.isArray(quizSpec.questions)) {
    throw new AssessmentError("QUIZ_NOT_FOUND", "No quiz found in this conversation");
  }

  if (questionIndex < 0 || questionIndex >= quizSpec.questions.length) {
    throw new AssessmentError("QUESTION_NOT_FOUND", `Question ${questionIndex} not found in quiz`);
  }

  // 3. Get the answer key from the stored quiz spec (SERVER-SIDE)
  const question = quizSpec.questions[questionIndex];
  const correctIndex = question?.correctIndex ?? null;
  const explanation = question?.explanation ?? null;

  // 4. SERVER-DERIVE isCorrect
  const isCorrect = correctIndex !== null && correctIndex !== undefined
    ? selectedIndex === correctIndex
    : false;

  // 5. Check for replay
  if (opts.idempotencyKey && isValidIdempotencyKey(opts.idempotencyKey)) {
    const existing = await db.assessmentAttempt.findFirst({
      where: {
        userId,
        idempotencyKey: opts.idempotencyKey,
        conversationId,
        questionId: `q${questionIndex}`,
      },
    });
    if (existing) {
      return {
        attemptId: existing.id,
        isCorrect: existing.isCorrect ?? false,
        correctIndex: existing.correctIndex,
        explanation,
        xpAwarded: 0,
        replayed: true,
      };
    }
  }

  // 6. Create the AssessmentAttempt record
  const attempt = await db.assessmentAttempt.create({
    data: {
      userId,
      conversationId,
      questionId: `q${questionIndex}`,
      selectedIndex,
      correctIndex,
      isCorrect,
      responseTimeMs: responseTimeMs ?? null,
      xpAwarded: false,
      idempotencyKey: opts.idempotencyKey ?? null,
    },
  });

  // 7. Award XP idempotently (chat quiz = 10 XP for correct, 2 for attempting)
  let xpAwarded = 0;
  try {
    const xpResult = await awardXpForAttempt(userId, attempt.id, isCorrect ? 10 : 2);
    xpAwarded = xpResult.awarded;
  } catch (e: any) {
    logger.warn("awardXpForAttempt (chat quiz) failed", {
      userId,
      attemptId: attempt.id,
      error: e?.message,
    });
  }

  if (xpAwarded > 0) {
    await db.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { xpAwarded: true },
    }).catch(() => {});
  }

  logger.info("chat quiz marked", {
    userId,
    attemptId: attempt.id,
    conversationId,
    questionIndex,
    isCorrect,
    xpAwarded,
  });

  return {
    attemptId: attempt.id,
    isCorrect,
    correctIndex,
    explanation,
    xpAwarded,
    replayed: false,
  };
}

// ============================================================
// Idempotent XP award (references attemptId)
// ============================================================

/**
 * Award XP for an assessment attempt — idempotently.
 *
 * Uses the attemptId as the idempotency key. If XP was already awarded
 * for this attempt (xpAwarded flag = true), this is a no-op.
 *
 * This prevents double-XP from:
 *   - Client retrying the same submission
 *   - Server re-processing after a partial failure
 */
export async function awardXpForAttempt(
  userId: string,
  attemptId: string,
  amount: number,
): Promise<{ awarded: number; skipped: boolean }> {
  // Check if XP was already awarded for this attempt
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { xpAwarded: true },
  });

  if (!attempt) {
    return { awarded: 0, skipped: false };
  }

  if (attempt.xpAwarded) {
    // Already awarded — skip (idempotent)
    return { awarded: 0, skipped: true };
  }

  // Award XP
  await awardXp(userId, amount);
  return { awarded: amount, skipped: false };
}

// ============================================================
// Error class
// ============================================================

export class AssessmentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AssessmentError";
  }
}

// ============================================================
// Helper — strip answer key from quiz spec before sending to client
// ============================================================

/**
 * Remove correctIndex + explanation from a quiz spec so the client
 * never receives the answer key.
 *
 * Use this when sending quiz data to the client for rendering.
 * The client submits selectedIndex; the server marks it via markChatQuizAttempt.
 *
 * NOTE: This is a pure function — it does NOT mutate the original spec.
 * It returns a new object with correctIndex + explanation removed from
 * each question.
 */
export function stripAnswerKeyFromQuiz(quizSpec: any): any {
  if (!quizSpec || typeof quizSpec !== "object") return quizSpec;
  if (!Array.isArray(quizSpec.questions)) return quizSpec;
  return {
    ...quizSpec,
    questions: quizSpec.questions.map((q: any) => ({
      question: q?.question,
      options: q?.options,
      // correctIndex + explanation are STRIPPED — server holds them
    })),
  };
}
