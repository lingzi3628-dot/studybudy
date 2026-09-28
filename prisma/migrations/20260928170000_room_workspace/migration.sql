ALTER TABLE "StudyRoomState"
  ADD COLUMN "workspaceDrawing" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "workspaceProgress" JSONB NOT NULL DEFAULT '{}'::jsonb;
