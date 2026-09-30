-- CreateTable
-- Explore projects organized by education track + grade level + subject.
-- Admin uploads HTML/CSS/JS demos (ZIP). Files stored as base64 in `files` JSON.
CREATE TABLE "ExploreProject" (
  "id"           TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "description"  TEXT,
  "track"        TEXT NOT NULL DEFAULT 'k12',
  "gradeLevel"   TEXT,
  "subject"      TEXT NOT NULL,
  "category"     TEXT NOT NULL DEFAULT 'interactive',
  "tags"         TEXT[] DEFAULT ARRAY[]::TEXT[],
  "files"        JSONB,
  "entryFile"    TEXT NOT NULL,
  "projectUrl"   TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "fileSize"     INTEGER NOT NULL DEFAULT 0,
  "viewCount"    INTEGER NOT NULL DEFAULT 0,
  "forkCount"    INTEGER NOT NULL DEFAULT 0,
  "starCount"    INTEGER NOT NULL DEFAULT 0,
  "isPublished"  BOOLEAN NOT NULL DEFAULT true,
  "isFeatured"   BOOLEAN NOT NULL DEFAULT false,
  "authorId"     TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExploreProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExploreProject_track_gradeLevel_idx" ON "ExploreProject"("track", "gradeLevel");
CREATE INDEX "ExploreProject_track_subject_idx" ON "ExploreProject"("track", "subject");
CREATE INDEX "ExploreProject_track_gradeLevel_subject_idx" ON "ExploreProject"("track", "gradeLevel", "subject");
CREATE INDEX "ExploreProject_isPublished_idx" ON "ExploreProject"("isPublished");
CREATE INDEX "ExploreProject_isFeatured_idx" ON "ExploreProject"("isFeatured");

-- AddForeignKey
ALTER TABLE "ExploreProject" ADD CONSTRAINT "ExploreProject_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
