-- Phase 2 — AssessmentAttempt table for verified assessment
-- Stores SERVER-DERIVED correctness. The answer key (correctIndex) lives
-- here on the server — the client submits selectedIndex and the server
-- marks it. XP/mastery updates reference the attemptId for idempotency.

CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT,
    "conversationId" TEXT,
    "questionId" TEXT,
    "selectedIndex" INTEGER,
    "correctIndex" INTEGER,
    "isCorrect" BOOLEAN,
    "responseTimeMs" INTEGER,
    "xpAwarded" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssessmentAttempt_userId_idx" ON "AssessmentAttempt"("userId");
CREATE INDEX "AssessmentAttempt_cardId_idx" ON "AssessmentAttempt"("cardId");
CREATE INDEX "AssessmentAttempt_conversationId_idx" ON "AssessmentAttempt"("conversationId");
CREATE INDEX "AssessmentAttempt_userId_createdAt_idx" ON "AssessmentAttempt"("userId", "createdAt");
CREATE INDEX "AssessmentAttempt_idempotencyKey_idx" ON "AssessmentAttempt"("idempotencyKey");
