-- CreateTable for CourseKnowledgeChunk (Phase 93)
CREATE TABLE "CourseKnowledgeChunk" (
    "id" TEXT NOT NULL,
    "courseKnowledgeId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embedding" JSONB,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseKnowledgeChunk_courseKnowledgeId_idx" ON "CourseKnowledgeChunk"("courseKnowledgeId");

-- CreateIndex
CREATE INDEX "CourseKnowledgeChunk_courseKnowledgeId_chunkIndex_idx" ON "CourseKnowledgeChunk"("courseKnowledgeId", "chunkIndex");

-- AddForeignKey (courseKnowledge cascade)
ALTER TABLE "CourseKnowledgeChunk" ADD CONSTRAINT "CourseKnowledgeChunk_courseKnowledgeId_fkey"
  FOREIGN KEY ("courseKnowledgeId") REFERENCES "CourseKnowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
