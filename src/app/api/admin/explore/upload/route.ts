import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { parseFormData, extractZipToBase64 } from "@/lib/upload-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/explore/upload
 *
 * Accepts a ZIP file + metadata (title, description, track, subject, etc.)
 * Extracts the zip, base64-encodes all files, stores as an ExploreProject
 * in the DB. The project is immediately published + served via
 * /api/explore/serve/[id]/[...path].
 *
 * This route was MISSING — the admin ExploreTab UI was POSTing to this
 * endpoint but no route file existed, causing silent 404s on every upload.
 */
export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdminJwt(); }
  catch { return NextResponse.json({ error: "Admin required" }, { status: 401 }); }

  // Parse FormData (file + metadata fields)
  const parsed = await parseFormData(req, {
    maxFileSize: 4 * 1024 * 1024, // 4 MB (Vercel body limit)
    allowedExts: ["zip"],
  });
  if (parsed instanceof NextResponse) return parsed;

  const { file, fields } = parsed;

  // Required fields
  const title = (fields.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const description = (fields.description ?? "").trim() || null;
  const track = (fields.track ?? "k12").trim();
  const gradeLevel = (fields.gradeLevel ?? "").trim() || null;
  const subject = (fields.subject ?? "General").trim();
  const course = (fields.course ?? "").trim() || null;
  const category = (fields.category ?? "interactive").trim();
  const tags = (fields.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const isFeatured = fields.isFeatured === "true";
  const customEntry = (fields.entryFile ?? "").trim() || null;

  // Extract the zip
  const extracted = await extractZipToBase64(file, {
    maxTotalSize: 3 * 1024 * 1024, // 3 MB total unzipped
    customEntry,
  });

  if ("error" in extracted) {
    return NextResponse.json({ error: extracted.error }, { status: 422 });
  }

  const { filesMap, entryFile, thumbnailPath, totalSize, fileCount } = extracted;

  // Build the project URL
  const projectId = crypto.randomUUID();
  const projectUrl = `/api/explore/serve/${projectId}/${entryFile}`;

  // If there's a thumbnail in the zip, use its serve URL
  const thumbnailUrl = thumbnailPath
    ? `/api/explore/serve/${projectId}/${thumbnailPath}`
    : null;

  try {
    const project = await db.exploreProject.create({
      data: {
        id: projectId,
        title,
        description,
        track,
        gradeLevel,
        subject,
        course,
        category,
        tags,
        files: filesMap,
        entryFile: entryFile!, // entryFile is guaranteed non-null by extractZipToBase64 (returns error if null)
        projectUrl,
        thumbnailUrl,
        fileSize: totalSize,
        isPublished: true,
        isFeatured,
        authorId: admin.userId,
      },
    });

    await logAdminActionViaJwt(admin, "explore.upload", {
      projectId: project.id,
      title,
      fileCount,
      totalSize,
    });

    return NextResponse.json({
      ok: true,
      project: {
        id: project.id,
        title: project.title,
        projectUrl: project.projectUrl,
        thumbnailUrl: project.thumbnailUrl,
      },
    });
  } catch (e: any) {
    console.error("[admin/explore/upload] DB error:", e?.message);
    return NextResponse.json(
      { error: `Failed to save project: ${e?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }
}
