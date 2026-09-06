-- Phase 70 — Server-backed deployed chatbots
-- Adds DeployedBot + DeployedBotMessage tables.
-- Mirrors the patterns from 0_init (Project + ProjectFile).

-- CreateTable
CREATE TABLE "DeployedBot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "matchingMode" TEXT NOT NULL DEFAULT 'hybrid',
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "thinkingDelay" INTEGER NOT NULL DEFAULT 3,
    "botMemory" BOOLEAN NOT NULL DEFAULT true,
    "generativeFallback" BOOLEAN NOT NULL DEFAULT true,
    "personaPrompt" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "trainingData" JSONB NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'deployed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeployedBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeployedBotMessage" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "visitorHash" TEXT,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "bestScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'retrieval',
    "understood" BOOLEAN NOT NULL DEFAULT false,
    "topMatches" JSONB,
    "responseMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeployedBotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeployedBot_slug_key" ON "DeployedBot"("slug");

-- CreateIndex
CREATE INDEX "DeployedBot_userId_status_idx" ON "DeployedBot"("userId", "status");

-- CreateIndex
CREATE INDEX "DeployedBot_status_idx" ON "DeployedBot"("status");

-- CreateIndex
CREATE INDEX "DeployedBotMessage_botId_createdAt_idx" ON "DeployedBotMessage"("botId", "createdAt");

-- CreateIndex
CREATE INDEX "DeployedBotMessage_botId_source_idx" ON "DeployedBotMessage"("botId", "source");

-- CreateIndex
CREATE INDEX "DeployedBotMessage_createdAt_idx" ON "DeployedBotMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "DeployedBot" ADD CONSTRAINT "DeployedBot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeployedBot" ADD CONSTRAINT "DeployedBot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeployedBotMessage" ADD CONSTRAINT "DeployedBotMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "DeployedBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
