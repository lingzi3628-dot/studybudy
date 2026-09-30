-- CreateTable: CourseKnowledge
-- Stores parsed course outlines / syllabi uploaded by users.
-- AI tutor uses these as RAG context to give track+grade+course-specific answers.

CREATE TABLE "CourseKnowledge" (
  "id"             TEXT NOT NULL,
  "track"          TEXT NOT NULL DEFAULT 'k12',
  "gradeLevel"     TEXT,
  "course"         TEXT,
  "subject"        TEXT NOT NULL DEFAULT 'General',
  "title"          TEXT NOT NULL,
  "sourceType"     TEXT NOT NULL DEFAULT 'outline',
  "sourceFileName" TEXT,
  "rawText"        TEXT NOT NULL,
  "summary"        TEXT NOT NULL,
  "topics"         JSONB,
  "uploadedById"   TEXT,
  "isVerified"     BOOLEAN NOT NULL DEFAULT false,
  "viewCount"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CourseKnowledge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: CourseKnowledge.uploadedById -> User.id (SET NULL)
ALTER TABLE "CourseKnowledge" ADD CONSTRAINT "CourseKnowledge_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CourseKnowledge_track_gradeLevel_idx" ON "CourseKnowledge"("track", "gradeLevel");
CREATE INDEX "CourseKnowledge_track_course_idx" ON "CourseKnowledge"("track", "course");
CREATE INDEX "CourseKnowledge_track_course_subject_idx" ON "CourseKnowledge"("track", "course", "subject");
CREATE INDEX "CourseKnowledge_track_gradeLevel_subject_idx" ON "CourseKnowledge"("track", "gradeLevel", "subject");
CREATE INDEX "CourseKnowledge_isVerified_idx" ON "CourseKnowledge"("isVerified");
