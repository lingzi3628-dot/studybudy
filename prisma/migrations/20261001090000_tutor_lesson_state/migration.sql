-- CreateTable for TutorLessonState (Phase 95)
CREATE TABLE "TutorLessonState" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentTopic" TEXT NOT NULL,
    "currentStage" TEXT NOT NULL DEFAULT 'introduce',
    "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorLessonState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorLessonState_conversationId_key" ON "TutorLessonState"("conversationId");

-- CreateIndex
CREATE INDEX "TutorLessonState_userId_idx" ON "TutorLessonState"("userId");

-- AddForeignKey (conversation cascade)
ALTER TABLE "TutorLessonState" ADD CONSTRAINT "TutorLessonState_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (user cascade)
ALTER TABLE "TutorLessonState" ADD CONSTRAINT "TutorLessonState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
