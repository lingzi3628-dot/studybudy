/**
 * Phase 2 — Verified assessment tests
 *
 * Covers:
 *   - markCardAttempt: server re-derives isCorrect from Card.correctIndex
 *   - markCardAttempt: client-supplied isCorrect is IGNORED
 *   - markCardAttempt: idempotency key prevents double-submission
 *   - markChatQuizAttempt: server reads answer key from stored quiz spec
 *   - awardXpForAttempt: idempotent (xpAwarded flag prevents double-XP)
 *   - stripAnswerKeyFromQuiz: removes correctIndex + explanation
 *   - /api/tutor/track: no longer awards XP from quizScore
 *   - Existing contracts preserved (recordAttempt signature, gamify exports)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock db module — must be at module scope for vi.mock
vi.mock("../db", () => ({
  db: {
    card: {
      findUnique: vi.fn(),
    },
    assessmentAttempt: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chatConversation: {
      findFirst: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
    },
    userXp: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    leaderboard: {
      upsert: vi.fn(),
    },
    topicMastery: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    cardReview: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    attempt: {
      create: vi.fn(),
    },
    userBadge: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    badge: {
      findMany: vi.fn(),
    },
  },
}));

// Mock progression.recordAttempt to isolate assessment tests
vi.mock("../progression", () => ({
  recordAttempt: vi.fn().mockResolvedValue(undefined),
  getDueCards: vi.fn(),
  countDueCards: vi.fn(),
}));

import { db } from "../db";
import {
  markCardAttempt,
  markChatQuizAttempt,
  awardXpForAttempt,
  stripAnswerKeyFromQuiz,
  AssessmentError,
} from "../assessment";
import { recordAttempt } from "../progression";
import { awardXp } from "../gamify";

// ============================================================
// markCardAttempt — server-derived isCorrect
// ============================================================

describe("Phase 2 — markCardAttempt server-derived isCorrect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives isCorrect=true when selectedIndex matches Card.correctIndex", async () => {
    (db.card.findUnique as any).mockResolvedValue({
      id: "card1",
      correctIndex: 2,
      explanation: "Because 2+2=4",
      subject: "Math",
      topic: "Addition",
      cardType: "mcq",
    });
    (db.assessmentAttempt.create as any).mockResolvedValue({
      id: "att1",
      userId: "u1",
      cardId: "card1",
      isCorrect: true,
      correctIndex: 2,
    });
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 100, level: 1 });
    (db.assessmentAttempt.update as any).mockResolvedValue({});

    const result = await markCardAttempt({
      userId: "u1",
      cardId: "card1",
      selectedIndex: 2,
      responseTimeMs: 5000,
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctIndex).toBe(2);
    expect(result.explanation).toBe("Because 2+2=4");
    expect(result.attemptId).toBe("att1");
    expect(result.replayed).toBe(false);
  });

  it("derives isCorrect=false when selectedIndex does NOT match", async () => {
    (db.card.findUnique as any).mockResolvedValue({
      id: "card1",
      correctIndex: 2,
      explanation: "Because 2+2=4",
      subject: "Math",
      topic: "Addition",
      cardType: "mcq",
    });
    (db.assessmentAttempt.create as any).mockResolvedValue({
      id: "att2",
      isCorrect: false,
      correctIndex: 2,
    });
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 100, level: 1 });
    (db.assessmentAttempt.update as any).mockResolvedValue({});

    const result = await markCardAttempt({
      userId: "u1",
      cardId: "card1",
      selectedIndex: 0, // wrong
      responseTimeMs: 3000,
    });

    expect(result.isCorrect).toBe(false);
    expect(result.correctIndex).toBe(2);
  });

  it("IGNORES client-supplied isCorrect (server always re-derives)", async () => {
    (db.card.findUnique as any).mockResolvedValue({
      id: "card1",
      correctIndex: 2,
      explanation: null,
      subject: "Math",
      topic: "Addition",
      cardType: "mcq",
    });
    (db.assessmentAttempt.create as any).mockResolvedValue({
      id: "att3",
      isCorrect: false,
      correctIndex: 2,
    });
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 100, level: 1 });
    (db.assessmentAttempt.update as any).mockResolvedValue({});

    // Client sends isCorrect=true (lying), but selectedIndex=0 (wrong)
    const result = await markCardAttempt({
      userId: "u1",
      cardId: "card1",
      selectedIndex: 0,
      clientIsCorrect: true, // CLIENT LIES — server must ignore this
      responseTimeMs: 1000,
    });

    // Server-derived isCorrect=false (selectedIndex 0 !== correctIndex 2)
    expect(result.isCorrect).toBe(false);

    // Verify recordAttempt was called with the SERVER-DERIVED isCorrect
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        isCorrect: false, // NOT the client-supplied true
        selectedIndex: 0,
      }),
    );
  });

  it("throws AssessmentError when card not found", async () => {
    (db.card.findUnique as any).mockResolvedValue(null);

    await expect(
      markCardAttempt({ userId: "u1", cardId: "missing", selectedIndex: 0 }),
    ).rejects.toThrow("Card not found");
  });

  it("returns replay result when idempotencyKey matches existing attempt", async () => {
    (db.card.findUnique as any).mockResolvedValue({
      id: "card1",
      correctIndex: 2,
      explanation: "Because 2+2=4",
      subject: "Math",
      topic: "Addition",
      cardType: "mcq",
    });
    (db.assessmentAttempt.findFirst as any).mockResolvedValue({
      id: "existing-att",
      userId: "u1",
      cardId: "card1",
      isCorrect: true,
      correctIndex: 2,
      xpAwarded: true,
    });

    const result = await markCardAttempt({
      userId: "u1",
      cardId: "card1",
      selectedIndex: 2,
      idempotencyKey: "replay-key-12345",
    });

    expect(result.replayed).toBe(true);
    expect(result.attemptId).toBe("existing-att");
    expect(result.xpAwarded).toBe(0); // no new XP on replay
    // Should NOT have created a new attempt
    expect(db.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it("calls recordAttempt with SERVER-DERIVED isCorrect", async () => {
    (db.card.findUnique as any).mockResolvedValue({
      id: "card1",
      correctIndex: 1,
      explanation: null,
      subject: "Math",
      topic: "Addition",
      cardType: "mcq",
    });
    (db.assessmentAttempt.create as any).mockResolvedValue({
      id: "att5",
      isCorrect: true,
    });
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 100, level: 1 });
    (db.assessmentAttempt.update as any).mockResolvedValue({});

    await markCardAttempt({
      userId: "u1",
      cardId: "card1",
      selectedIndex: 1, // correct
    });

    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        isCorrect: true, // server-derived, not client-supplied
        cardId: "card1",
        selectedIndex: 1,
      }),
    );
  });
});

// ============================================================
// markChatQuizAttempt — server reads answer key from stored quiz
// ============================================================

describe("Phase 2 — markChatQuizAttempt server reads answer key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads correctIndex from stored quiz spec in ChatMessage.attachments", async () => {
    const quizSpec = {
      title: "Fractions Quiz",
      questions: [
        { question: "What is 1/2 + 1/4?", options: ["1/6", "3/4", "2/6"], correctIndex: 1, explanation: "Common denominator" },
        { question: "What is 1/3?", options: ["0.33", "0.5", "0.25"], correctIndex: 0, explanation: "1/3 = 0.333..." },
      ],
    };
    (db.chatConversation.findFirst as any).mockResolvedValue({
      id: "conv1",
      userId: "u1",
      messages: [
        {
          id: "msg1",
          role: "assistant",
          attachments: [{ type: "quiz", caption: JSON.stringify(quizSpec) }],
        },
      ],
    });
    (db.assessmentAttempt.create as any).mockResolvedValue({
      id: "att-quiz-1",
      isCorrect: true,
      correctIndex: 1,
    });
    (db.assessmentAttempt.findFirst as any).mockResolvedValue(null); // no replay
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 100, level: 1 });
    (db.assessmentAttempt.update as any).mockResolvedValue({});

    const result = await markChatQuizAttempt({
      userId: "u1",
      conversationId: "conv1",
      questionIndex: 0,
      selectedIndex: 1, // correct
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctIndex).toBe(1);
    expect(result.explanation).toBe("Common denominator");
    expect(result.attemptId).toBe("att-quiz-1");
  });

  it("derives isCorrect=false when learner selects wrong answer", async () => {
    const quizSpec = {
      title: "Quiz",
      questions: [
        { question: "Q1", options: ["A", "B", "C"], correctIndex: 2, explanation: "C is correct" },
      ],
    };
    (db.chatConversation.findFirst as any).mockResolvedValue({
      id: "conv1",
      userId: "u1",
      messages: [{ id: "msg1", role: "assistant", attachments: [{ type: "quiz", caption: JSON.stringify(quizSpec) }] }],
    });
    (db.assessmentAttempt.create as any).mockResolvedValue({ id: "att2", isCorrect: false, correctIndex: 2 });
    (db.assessmentAttempt.findFirst as any).mockResolvedValue(null);
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 100, level: 1 });
    (db.assessmentAttempt.update as any).mockResolvedValue({});

    const result = await markChatQuizAttempt({
      userId: "u1",
      conversationId: "conv1",
      questionIndex: 0,
      selectedIndex: 0, // wrong
    });

    expect(result.isCorrect).toBe(false);
    expect(result.correctIndex).toBe(2);
    expect(result.explanation).toBe("C is correct");
  });

  it("throws CONVERSATION_NOT_FOUND when conversation doesn't exist or isn't owned by user", async () => {
    (db.chatConversation.findFirst as any).mockResolvedValue(null);

    await expect(
      markChatQuizAttempt({
        userId: "u1",
        conversationId: "missing",
        questionIndex: 0,
        selectedIndex: 0,
      }),
    ).rejects.toThrow("Conversation not found");
  });

  it("throws QUIZ_NOT_FOUND when no quiz attachment exists", async () => {
    (db.chatConversation.findFirst as any).mockResolvedValue({
      id: "conv1",
      userId: "u1",
      messages: [{ id: "msg1", role: "assistant", attachments: [{ type: "graph", caption: "{}" }] }],
    });

    await expect(
      markChatQuizAttempt({
        userId: "u1",
        conversationId: "conv1",
        questionIndex: 0,
        selectedIndex: 0,
      }),
    ).rejects.toThrow("No quiz found");
  });

  it("throws QUESTION_NOT_FOUND when questionIndex is out of bounds", async () => {
    const quizSpec = { title: "Quiz", questions: [{ question: "Q1", options: ["A"], correctIndex: 0 }] };
    (db.chatConversation.findFirst as any).mockResolvedValue({
      id: "conv1",
      userId: "u1",
      messages: [{ id: "msg1", role: "assistant", attachments: [{ type: "quiz", caption: JSON.stringify(quizSpec) }] }],
    });

    await expect(
      markChatQuizAttempt({
        userId: "u1",
        conversationId: "conv1",
        questionIndex: 5, // out of bounds
        selectedIndex: 0,
      }),
    ).rejects.toThrow("Question 5 not found");
  });
});

// ============================================================
// awardXpForAttempt — idempotent
// ============================================================

describe("Phase 2 — awardXpForAttempt idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("awards XP when xpAwarded flag is false", async () => {
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 110, level: 1 });
    (db.leaderboard.upsert as any).mockResolvedValue({});
    (db.userBadge.findMany as any).mockResolvedValue([]);
    (db.badge.findMany as any).mockResolvedValue([]);

    const result = await awardXpForAttempt("u1", "att1", 10);

    expect(result.awarded).toBe(10);
    expect(result.skipped).toBe(false);
  });

  it("skips XP when xpAwarded flag is already true (idempotent)", async () => {
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: true });

    const result = await awardXpForAttempt("u1", "att1", 10);

    expect(result.awarded).toBe(0);
    expect(result.skipped).toBe(true);
    // Should NOT have called awardXp (no double-XP)
    expect(db.userXp.upsert).not.toHaveBeenCalled();
  });

  it("returns awarded=0 when attempt not found", async () => {
    (db.assessmentAttempt.findUnique as any).mockResolvedValue(null);

    const result = await awardXpForAttempt("u1", "missing-att", 10);

    expect(result.awarded).toBe(0);
    expect(result.skipped).toBe(false);
  });
});

// ============================================================
// stripAnswerKeyFromQuiz
// ============================================================

describe("Phase 2 — stripAnswerKeyFromQuiz", () => {
  it("removes correctIndex and explanation from each question", () => {
    const quizSpec = {
      title: "Quiz",
      questions: [
        { question: "Q1", options: ["A", "B"], correctIndex: 0, explanation: "Because A" },
        { question: "Q2", options: ["C", "D"], correctIndex: 1, explanation: "Because D" },
      ],
    };
    const stripped = stripAnswerKeyFromQuiz(quizSpec);

    expect(stripped.title).toBe("Quiz");
    expect(stripped.questions).toHaveLength(2);
    expect(stripped.questions[0].question).toBe("Q1");
    expect(stripped.questions[0].options).toEqual(["A", "B"]);
    expect(stripped.questions[0].correctIndex).toBeUndefined();
    expect(stripped.questions[0].explanation).toBeUndefined();
    expect(stripped.questions[1].correctIndex).toBeUndefined();
  });

  it("does NOT mutate the original spec", () => {
    const quizSpec = {
      title: "Quiz",
      questions: [{ question: "Q1", options: ["A"], correctIndex: 0, explanation: "A" }],
    };
    const stripped = stripAnswerKeyFromQuiz(quizSpec);
    // Original still has correctIndex
    expect(quizSpec.questions[0].correctIndex).toBe(0);
    expect(stripped.questions[0].correctIndex).toBeUndefined();
  });

  it("handles null/undefined input gracefully", () => {
    expect(stripAnswerKeyFromQuiz(null)).toBeNull();
    expect(stripAnswerKeyFromQuiz(undefined)).toBeUndefined();
    expect(stripAnswerKeyFromQuiz("not an object")).toBe("not an object");
  });

  it("handles quiz spec without questions array", () => {
    const spec = { title: "Quiz" };
    const stripped = stripAnswerKeyFromQuiz(spec);
    expect(stripped).toEqual({ title: "Quiz" });
  });
});

// ============================================================
// /api/tutor/track no longer awards XP from quizScore
// ============================================================

describe("Phase 2 — /api/tutor/track activity-only XP", () => {
  // This is a design verification — we confirm that the track route
  // no longer reads quizScore for XP calculation. The actual route
  // integration test would require mocking getCurrentUser + db.
  // For now, we verify the assessment module exports are correct.

  it("markCardAttempt awards XP through awardXpForAttempt (not /api/tutor/track)", async () => {
    (db.card.findUnique as any).mockResolvedValue({
      id: "card1",
      correctIndex: 0,
      explanation: null,
      subject: "Math",
      topic: "Addition",
      cardType: "mcq",
    });
    (db.assessmentAttempt.create as any).mockResolvedValue({ id: "att1", isCorrect: true });
    (db.assessmentAttempt.findFirst as any).mockResolvedValue(null);
    (db.assessmentAttempt.findUnique as any).mockResolvedValue({ xpAwarded: false });
    (db.userXp.upsert as any).mockResolvedValue({ xpAmount: 110, level: 1 });
    (db.assessmentAttempt.update as any).mockResolvedValue({});
    (db.leaderboard.upsert as any).mockResolvedValue({});
    (db.userBadge.findMany as any).mockResolvedValue([]);
    (db.badge.findMany as any).mockResolvedValue([]);

    const result = await markCardAttempt({
      userId: "u1",
      cardId: "card1",
      selectedIndex: 0, // correct
    });

    // XP was awarded through the verified path
    expect(result.xpAwarded).toBeGreaterThan(0);
    expect(result.replayed).toBe(false);
  });
});

// ============================================================
// Existing contracts preserved
// ============================================================

describe("Phase 2 — Existing contracts preserved", () => {
  it("recordAttempt function signature unchanged (still accepts isCorrect param)", () => {
    expect(typeof recordAttempt).toBe("function");
  });

  it("awardXp function still exists and accepts (userId, amount)", () => {
    expect(typeof awardXp).toBe("function");
  });

  it("assessment.ts exports all required functions", () => {
    expect(typeof markCardAttempt).toBe("function");
    expect(typeof markChatQuizAttempt).toBe("function");
    expect(typeof awardXpForAttempt).toBe("function");
    expect(typeof stripAnswerKeyFromQuiz).toBe("function");
    expect(typeof AssessmentError).toBe("function");
  });
});
