-- Phase 71 — Platform integrations
-- Adds apiKey to DeployedBot + new BotIntegration table.

-- Add apiKey column to DeployedBot
ALTER TABLE "DeployedBot" ADD COLUMN "apiKey" TEXT;

-- CreateTable
CREATE TABLE "BotIntegration" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeployedBot_apiKey_key" ON "DeployedBot"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "BotIntegration_botId_platform_key" ON "BotIntegration"("botId", "platform");

-- CreateIndex
CREATE INDEX "BotIntegration_botId_idx" ON "BotIntegration"("botId");

-- CreateIndex
CREATE INDEX "BotIntegration_platform_idx" ON "BotIntegration"("platform");

-- AddForeignKey
ALTER TABLE "BotIntegration" ADD CONSTRAINT "BotIntegration_botId_fkey" FOREIGN KEY ("botId") REFERENCES "DeployedBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
