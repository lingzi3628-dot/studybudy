-- Phase 5 — IngestionJob table for async ingestion tracking
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseKnowledgeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngestionJob_userId_idx" ON "IngestionJob"("userId");
CREATE INDEX "IngestionJob_status_idx" ON "IngestionJob"("status");
CREATE INDEX "IngestionJob_contentHash_idx" ON "IngestionJob"("contentHash");
