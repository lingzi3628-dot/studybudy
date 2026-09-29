CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Arcade',
    "thumbnailUrl" TEXT,
    "gameUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStudyMinutes" INTEGER NOT NULL DEFAULT 30,
    "playTimeMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Game_category_idx" ON "Game"("category");
CREATE INDEX "Game_isFeatured_idx" ON "Game"("isFeatured");
CREATE INDEX "Game_isActive_idx" ON "Game"("isActive");
ALTER TABLE "StudySession" ADD COLUMN "earnedPlaySeconds" INTEGER NOT NULL DEFAULT 0;
