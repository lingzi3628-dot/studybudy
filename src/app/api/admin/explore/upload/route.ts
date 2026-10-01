import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/explore/upload
 *
 * Upload a new Explore project (ZIP) targeted at a specific audience.
 *
 * Body (multipart/form-data):
 *   file: .zip ≤ 50 MB
 *   title: string
 *   description?: string
 *   track: k12 | secondary | university | college | tvet | dev
 *   gradeLevel?: string (e.g. "Grade 5", "Form 4", "CDACC Level 5") — null = all grades
 *   subject: string (e.g. "Mathematics", "Physics")
 *   category?: demo | tutorial | interactive | game | quiz | reference | project
 *   tags?: comma-separated
 *   isFeatured?: "true" | "false"
 *   entryFile?: optional override
 *
 * Returns: { project, extracted }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > 6 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 6MB)" }, { status: 413 });
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
  }

  const title = (form.get("title") as string | null)?.toString().trim() || file.name.replace(/\.zip$/i, "");
  const description = (form.get("description") as string | null)?.toString().trim() || null;
  const track = (form.get("track") as string | null)?.toString().trim() || "k12";
  const gradeLevelRaw = (form.get("gradeLevel") as string | null)?.toString().trim();
  const gradeLevel = gradeLevelRaw === "" || gradeLevelRaw === "all" ? null : gradeLevelRaw;
  const courseRaw = (form.get("course") as string | null)?.toString().trim();
  const course = courseRaw === "" || courseRaw === "all" ? null : courseRaw;
  const subject = (form.get("subject") as string | null)?.toString().trim() || "General";
  const category = (form.get("category") as string | null)?.toString().trim() || "interactive";
  const tagsRaw = (form.get("tags") as string | null)?.toString().trim();
  const tags = tagsRaw ? tagsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
  const isFeatured = ((form.get("isFeatured") as string | null)?.toString() || "").toLowerCase() === "true";
  const customEntry = (form.get("entryFile") as string | null)?.toString().trim() || null;
  // Phase 88 — optional separate thumbnail/wallpaper image upload
  const thumbnailFile = form.get("thumbnail");
  let customThumbnailBase64: string | null = null;
  if (thumbnailFile instanceof File && thumbnailFile.size > 0 && thumbnailFile.size < 6 * 1024 * 1024) {
    const thumbBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
    customThumbnailBase64 = `data:${thumbnailFile.type || "image/jpeg"};base64,${thumbBuffer.toString("base64")}`;
  }

  // Parse ZIP
  let zip: JSZip;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return NextResponse.json({ error: "Invalid or corrupted ZIP file" }, { status: 400 });
  }

  // Collect entries (skip macOS junk + directories)
  const allEntries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((p, e) => {
    if (e.dir) return;
    if (p.startsWith("__MACOSX/") || p.includes("/.DS_Store")) return;
    allEntries.push({ path: p, entry: e });
  });
  if (allEntries.length === 0) {
    return NextResponse.json({ error: "ZIP contains no files" }, { status: 400 });
  }

  // Detect common root folder
  const topLevelFolders = new Set<string>();
  for (const e of allEntries) {
    const parts = e.path.split("/");
    if (parts.length > 1) topLevelFolders.add(parts[0]);
    else { topLevelFolders.clear(); break; }
  }
  const commonRoot = topLevelFolders.size === 1 ? [...topLevelFolders][0] : null;

  const strippedPaths = allEntries.map(e => ({
    original: e.path,
    stripped: commonRoot ? e.path.slice(commonRoot.length + 1) : e.path,
    entry: e.entry,
  }));

  // Find entry HTML
  let entryFile: string | null = null;
  if (customEntry) {
    const normalized = customEntry.replace(/^\.?\//, "");
    if (strippedPaths.some(e => e.stripped === normalized)) entryFile = normalized;
    else return NextResponse.json({ error: `Entry file "${customEntry}" not found in ZIP` }, { status: 400 });
  }
  if (!entryFile) entryFile = strippedPaths.find(e => e.stripped === "index.html")?.stripped || null;
  if (!entryFile) entryFile = strippedPaths.find(e => !e.stripped.includes("/") && e.stripped.toLowerCase().endsWith(".html"))?.stripped || null;
  if (!entryFile) entryFile = strippedPaths.find(e => e.stripped.toLowerCase().endsWith("/index.html"))?.stripped || null;
  if (!entryFile) entryFile = strippedPaths.find(e => e.stripped.toLowerCase().endsWith(".html"))?.stripped || null;
  if (!entryFile) {
    return NextResponse.json({ error: "No HTML entry file found in ZIP" }, { status: 400 });
  }

  // Path traversal protection
  for (const e of strippedPaths) {
    if (e.stripped.includes("..") || e.stripped.startsWith("/")) {
      return NextResponse.json({ error: "ZIP contains an unsafe path" }, { status: 400 });
    }
  }

  // Read all files as base64
  const MAX_TOTAL = 5 * 1024 * 1024;
  let totalSize = 0;
  const filesMap: Record<string, string> = {};
  let thumbnailPath: string | null = null;
  for (const e of strippedPaths) {
    const data = await e.entry.async("nodebuffer");
    totalSize += data.length;
    if (totalSize > MAX_TOTAL) {
      return NextResponse.json({ error: `Unzipped total size exceeds ${MAX_TOTAL / (1024 * 1024)} MB limit.` }, { status: 413 });
    }
    filesMap[e.stripped] = data.toString("base64");
    const lower = e.stripped.toLowerCase();
    if (!thumbnailPath && (
      lower === "thumbnail.png" || lower === "thumbnail.jpg" || lower === "thumbnail.jpeg" ||
      lower === "thumb.png" || lower === "thumb.jpg" ||
      lower === "cover.png" || lower === "cover.jpg"
    )) {
      thumbnailPath = e.stripped;
    }
  }

  // Phase 88 — custom thumbnail takes priority over auto-detected thumbnail
  const finalThumbnailUrl = customThumbnailBase64
    || (thumbnailPath ? `/api/explore/serve/PLACEHOLDER/${thumbnailPath}` : null);

  // Two-step create: insert with placeholder URL, then update with real ID
  const project = await db.exploreProject.create({
    data: {
      title, description, track, gradeLevel, course, subject, category, tags,
      files: filesMap,
      entryFile,
      projectUrl: "/api/explore/serve/PLACEHOLDER/" + entryFile,
      thumbnailUrl: finalThumbnailUrl,
      fileSize: totalSize,
      isFeatured,
      isPublished: true,
    },
  });

  // Update URLs with the real ID
  const updated = await db.exploreProject.update({
    where: { id: project.id },
    data: {
      projectUrl: `/api/explore/serve/${project.id}/${entryFile}`,
      thumbnailUrl: customThumbnailBase64
        || (thumbnailPath ? `/api/explore/serve/${project.id}/${thumbnailPath}` : null),
    },
  });

  return NextResponse.json({
    project: updated,
    extracted: {
      fileCount: Object.keys(filesMap).length,
      totalSizeBytes: totalSize,
      entryFile,
      projectUrl: updated.projectUrl,
      thumbnailUrl: updated.thumbnailUrl,
      commonRootStripped: commonRoot,
      storedIn: "database",
    },
  });
}
