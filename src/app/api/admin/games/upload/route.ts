import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { parseFormData, extractZipToBase64, slugify, buildServeUrl, buildThumbnailUrl } from "@/lib/upload-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/games/upload
 *
 * Accepts multipart/form-data with:
 *   file: .zip file containing the game (≤ 4MB — Vercel body limit)
 *   title, description?, category?, isFeatured?, minStudyMinutes?, playTimeMinutes?, entryFile?
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  // Phase 90 — use shared upload helpers
  const parsed = await parseFormData(req, { maxFileSize: 4 * 1024 * 1024, allowedExts: ["zip"] });
  if (parsed instanceof NextResponse) return parsed;
  const { file, fields } = parsed;

  const title = fields.title?.trim() || file.name.replace(/\.zip$/i, "");
  const description = fields.description?.trim() || null;
  const category = fields.category || "Arcade";
  const isFeatured = (fields.isFeatured || "").toLowerCase() === "true";
  const minStudyMinutes = Number(fields.minStudyMinutes) || 30;
  const playTimeMinutes = Number(fields.playTimeMinutes) || 10;
  const customEntry = fields.entryFile?.trim() || null;

  // Extract ZIP
  const extraction = await extractZipToBase64(file, { maxTotalSize: 3 * 1024 * 1024, customEntry });
  if ("error" in extraction) {
    return NextResponse.json({ error: extraction.error }, { status: 400 });
  }

  // Check for existing game with same title
  const existing = await db.game.findFirst({ where: { title } }).catch(() => null);
  const slug = slugify(title);

  let game;
  if (existing) {
    game = await db.game.update({
      where: { id: existing.id },
      data: {
        description, category,
        gameUrl: buildServeUrl("/api/games/serve", existing.id, extraction.entryFile!),
        thumbnailUrl: buildThumbnailUrl("/api/games/serve", existing.id, extraction.thumbnailPath, null),
        fileSize: extraction.totalSize,
        isFeatured, minStudyMinutes, playTimeMinutes,
        isActive: true, files: extraction.filesMap,
      },
    });
  } else {
    game = await db.game.create({
      data: {
        title, description, category,
        gameUrl: "/api/games/serve/PLACEHOLDER/" + extraction.entryFile,
        thumbnailUrl: extraction.thumbnailPath ? "/api/games/serve/PLACEHOLDER/" + extraction.thumbnailPath : null,
        fileSize: extraction.totalSize,
        isFeatured, minStudyMinutes, playTimeMinutes,
        isActive: true, files: extraction.filesMap,
        rating: 0, playCount: 0, version: "1.0.0",
      },
    });
    // Update with real ID
    game = await db.game.update({
      where: { id: game.id },
      data: {
        gameUrl: buildServeUrl("/api/games/serve", game.id, extraction.entryFile!),
        thumbnailUrl: buildThumbnailUrl("/api/games/serve", game.id, extraction.thumbnailPath, null),
      },
    });
  }

  return NextResponse.json({
    game,
    extracted: {
      fileCount: extraction.fileCount,
      totalSizeBytes: extraction.totalSize,
      entryFile: extraction.entryFile,
      gameUrl: game.gameUrl,
      thumbnailUrl: game.thumbnailUrl,
      storedIn: "database",
    },
  });
}
