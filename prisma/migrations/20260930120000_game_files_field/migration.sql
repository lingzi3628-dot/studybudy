-- AlterTable
-- Adds the `files` JSON column to the Game table.
-- This stores base64-encoded file contents for games uploaded via the admin
-- panel (which can't write to Vercel's read-only /public/ directory).
-- When files is null/empty, the game is served from /public/games/<slug>/.
-- When files is populated, the game is served via /api/games/serve/[id]/[...path].

ALTER TABLE "Game" ADD COLUMN "files" JSONB;
