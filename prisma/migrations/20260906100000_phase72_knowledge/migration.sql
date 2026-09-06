-- Phase 72 — Knowledge Base / RAG
-- Adds BotKnowledgeSource table for URL/GitHub/file/text ingestion.

CREATE TABLE "BotKnowledgeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "contentText" TEXT NOT NULL,
    "chunks" JSONB NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotKnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BotKnowledgeSource_userId_idx" ON "BotKnowledgeSource"("userId");
CREATE INDEX "BotKnowledgeSource_botId_idx" ON "BotKnowledgeSource"("botId");
CREATE INDEX "BotKnowledgeSource_userId_botId_idx" ON "BotKnowledgeSource"("userId", "botId");

ALTER TABLE "BotKnowledgeSource" ADD CONSTRAINT "BotKnowledgeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotKnowledgeSource" ADD CONSTRAINT "BotKnowledgeSource_botId_fkey" FOREIGN KEY ("botId") REFERENCES "DeployedBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
