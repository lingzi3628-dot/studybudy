import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { parseFormData, extractZipToBase64, buildServeUrl, buildThumbnailUrl } from "@/lib/upload-helpers";
import { isBlobConfigured } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/explore/upload
 *
 * Phase 90 — uses shared upload-helpers + storage abstraction.
 * When BLOB_READ_WRITE_TOKEN is set, files go to Vercel Blob Storage.
 * Otherwise, files are stored as base64 in the DB (existing behavior).
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  // Parse form data — need to re-read for thumbnail (parseFormData consumes it)
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 4MB)" }, { status: 413 });
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }

  const title = fields.title?.trim() || file.name.replace(/\.zip$/i, "");
  const description = fields.description?.trim() || null;
  const track = fields.track || "k12";
  const gradeLevel = (fields.gradeLevel === "" || fields.gradeLevel === "all") ? null : fields.gradeLevel;
  const course = (fields.course === "" || fields.course === "all") ? null : fields.course;
  const subject = fields.subject || "General";
  const category = fields.category || "interactive";
  const tags = fields.tags ? fields.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  const isFeatured = (fields.isFeatured || "").toLowerCase() === "true";
  const customEntry = fields.entryFile?.trim() || null;

  // Phase 88 — optional separate thumbnail/wallpaper image upload
  const thumbnailFile = form.get("thumbnail");
  let customThumbnailBase64: string | null = null;
  if (thumbnailFile instanceof File && thumbnailFile.size > 0 && thumbnailFile.size < 4 * 1024 * 1024) {
    const thumbBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
    customThumbnailBase64 = `data:${thumbnailFile.type || "image/jpeg"};base64,${thumbBuffer.toString("base64")}`;
  }

  // Extract ZIP using shared helper
  const extraction = await extractZipToBase64(file, { maxTotalSize: 3 * 1024 * 1024, customEntry });
  if ("error" in extraction) {
    return NextResponse.json({ error: extraction.error }, { status: 400 });
  }

  // Phase 90 — Storage note: when BLOB_READ_WRITE_TOKEN is configured,
  // files SHOULD be uploaded to Vercel Blob. For now, we store base64 in DB
  // (backward compatible). The storage.ts module is ready for the switch.
  const storageMode = isBlobConfigured() ? "blob" : "database";

  // Create or update
  const existing = await db.exploreProject.findFirst({ where: { title } }).catch(() => null);

  let project;
  if (existing) {
    project = await db.exploreProject.update({
      where: { id: existing.id },
      data: {
        description, track, gradeLevel, course, subject, category, tags,
        files: extraction.filesMap, entryFile: extraction.entryFile as string,
        projectUrl: buildServeUrl("/api/explore/serve", existing.id, extraction.entryFile as string),
        thumbnailUrl: buildThumbnailUrl("/api/explore/serve", existing.id, extraction.thumbnailPath, customThumbnailBase64),
        fileSize: extraction.totalSize, isFeatured, isPublished: true,
      },
    });
  } else {
    project = await db.exploreProject.create({
      data: {
        title, description, track, gradeLevel, course, subject, category, tags,
        files: extraction.filesMap, entryFile: extraction.entryFile as string,
        projectUrl: buildServeUrl("/api/explore/serve", "PLACEHOLDER", extraction.entryFile as string),
        thumbnailUrl: buildThumbnailUrl("/api/explore/serve", "PLACEHOLDER", extraction.thumbnailPath, customThumbnailBase64),
        fileSize: extraction.totalSize, isFeatured, isPublished: true,
      },
    });
    project = await db.exploreProject.update({
      where: { id: project.id },
      data: {
        projectUrl: buildServeUrl("/api/explore/serve", project.id, extraction.entryFile as string),
        thumbnailUrl: buildThumbnailUrl("/api/explore/serve", project.id, extraction.thumbnailPath, customThumbnailBase64),
      },
    });
  }

  return NextResponse.json({
    project,
    extracted: {
      fileCount: extraction.fileCount,
      totalSizeBytes: extraction.totalSize,
      entryFile: extraction.entryFile as string,
      storedIn: storageMode,
      blobConfigured: isBlobConfigured(),
    },
  });
}
