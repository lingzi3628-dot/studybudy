-- The guided classroom uses a 30-minute learning block and check-in by default.
ALTER TABLE "ClassroomSettings" ALTER COLUMN "testIntervalMin" SET DEFAULT 30;
UPDATE "ClassroomSettings" SET "testIntervalMin" = 30 WHERE "testIntervalMin" = 10;
ALTER TABLE "ClassroomSession" ADD COLUMN "activeSeconds" INTEGER NOT NULL DEFAULT 0;
