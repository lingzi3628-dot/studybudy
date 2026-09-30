-- AlterTable: add `course` field to User (for university/college/tvet users)
ALTER TABLE "User" ADD COLUMN "course" TEXT;

-- CreateTable: CourseSwitchRequest
CREATE TABLE "CourseSwitchRequest" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "fromTrack"    TEXT NOT NULL,
  "fromCourse"   TEXT,
  "toTrack"      TEXT NOT NULL,
  "toCourse"     TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "reviewedById" TEXT,
  "reviewedAt"   TIMESTAMP(3),
  "adminNote"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CourseSwitchRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: CourseSwitchRequest.userId -> User.id (CASCADE)
ALTER TABLE "CourseSwitchRequest" ADD CONSTRAINT "CourseSwitchRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CourseSwitchRequest.reviewedById -> User.id (SET NULL, named AdminReviewer)
ALTER TABLE "CourseSwitchRequest" ADD CONSTRAINT "CourseSwitchRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CourseSwitchRequest_userId_idx" ON "CourseSwitchRequest"("userId");
CREATE INDEX "CourseSwitchRequest_status_idx" ON "CourseSwitchRequest"("status");
CREATE INDEX "CourseSwitchRequest_status_createdAt_idx" ON "CourseSwitchRequest"("status", "createdAt");

-- AlterTable: add `course` field to ExploreProject
ALTER TABLE "ExploreProject" ADD COLUMN "course" TEXT;

-- CreateIndex on ExploreProject (track, course) and (track, course, subject)
CREATE INDEX "ExploreProject_track_course_idx" ON "ExploreProject"("track", "course");
CREATE INDEX "ExploreProject_track_course_subject_idx" ON "ExploreProject"("track", "course", "subject");
