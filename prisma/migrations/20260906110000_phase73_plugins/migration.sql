-- Phase 73 — Plugin / Tool System
-- Adds BotPlugin table for bot-callable tools (calculator, web search, custom HTTP, MCP).

CREATE TABLE "BotPlugin" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "lastCalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotPlugin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotPlugin_botId_name_key" ON "BotPlugin"("botId", "name");
CREATE INDEX "BotPlugin_botId_idx" ON "BotPlugin"("botId");

ALTER TABLE "BotPlugin" ADD CONSTRAINT "BotPlugin_botId_fkey" FOREIGN KEY ("botId") REFERENCES "DeployedBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
