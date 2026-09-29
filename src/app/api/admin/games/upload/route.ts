import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { writeFile, mkdir, rm, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 min for big zip extraction
// Disable body parsing — we read formData manually
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/games/upload
 *
 * Accepts multipart/form-data with:
 *   file: .zip file containing the game (≤ 50 MB)
 *   title: display name
 *   description?: optional
 *   category?: Arcade | Puzzle | Strategy | Racing | Adventure | Educational | Sports
 *   isFeatured?: "true" | "false"  (default false)
 *   minStudyMinutes?: number        (default 30)
 *   playTimeMinutes?: number        (default 10)
 *   entryFile?: relative path inside zip to the entry HTML (default: auto-detect)
 *
 * The zip is extracted to /public/games/<slug>/ where slug is derived from the
 * title (lowercased, kebab-case). A Game record is created in the database
 * pointing at /games/<slug>/<entryFile>.
 *
 * Returns: { game }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Size check (50 MB)
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 413 });
  }

  const originalName = file.name;
  if (!originalName.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
  }

  const title = (form.get("title") as string | null)?.toString().trim() || originalName.replace(/\.zip$/i, "");
  const description = (form.get("description") as string | null)?.toString().trim() || null;
  const category = (form.get("category") as string | null)?.toString().trim() || "Arcade";
  const isFeatured = ((form.get("isFeatured") as string | null)?.toString() || "").toLowerCase() === "true";
  const minStudyMinutesRaw = (form.get("minStudyMinutes") as string | null)?.toString().trim();
  const playTimeMinutesRaw = (form.get("playTimeMinutes") as string | null)?.toString().trim();
  const minStudyMinutes = minStudyMinutesRaw ? Number(minStudyMinutesRaw) : 30;
  const playTimeMinutes = playTimeMinutesRaw ? Number(playTimeMinutesRaw) : 10;
  const customEntry = (form.get("entryFile") as string | null)?.toString().trim() || null;

  // Build slug from title (kebab-case, max 60 chars)
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || `game-${Date.now()}`;

  // Read zip file into JSZip
  let zip: JSZip;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return NextResponse.json({ error: "Invalid or corrupted ZIP file" }, { status: 400 });
  }

  // Collect all file paths inside the zip (excluding directories and junk)
  const allEntries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    // Skip macOS junk
    if (relativePath.startsWith("__MACOSX/") || relativePath.includes("/.DS_Store")) return;
    allEntries.push({ path: relativePath, entry });
  });

  if (allEntries.length === 0) {
    return NextResponse.json({ error: "ZIP contains no files" }, { status: 400 });
  }

  // Detect common root folder (e.g. "my-game/" prefix on everything)
  // If all files share the same top-level folder, strip it.
  const topLevelFolders = new Set<string>();
  for (const e of allEntries) {
    const parts = e.path.split("/");
    if (parts.length > 1) {
      topLevelFolders.add(parts[0]);
    } else {
      // File at root → no common folder
      topLevelFolders.clear();
      break;
    }
  }
  const commonRoot = topLevelFolders.size === 1 ? [...topLevelFolders][0] : null;

  // Find entry HTML file
  // Strategy:
  // 1. If customEntry provided, use it (after stripping common root)
  // 2. Look for index.html at root (after stripping common root)
  // 3. Look for any *.html file at root
  // 4. Look for index.html anywhere
  // 5. Look for any *.html anywhere
  const strippedPaths = allEntries.map(e => ({
    original: e.path,
    stripped: commonRoot ? e.path.slice(commonRoot.length + 1) : e.path,
    entry: e.entry,
  }));

  let entryFile: string | null = null;
  if (customEntry) {
    const normalized = customEntry.replace(/^\.?\//, "");
    if (strippedPaths.some(e => e.stripped === normalized)) {
      entryFile = normalized;
    } else {
      return NextResponse.json({ error: `Entry file "${customEntry}" not found in ZIP` }, { status: 400 });
    }
  }
  if (!entryFile) {
    // index.html at root
    const rootIndex = strippedPaths.find(e => e.stripped === "index.html");
    if (rootIndex) entryFile = rootIndex.stripped;
  }
  if (!entryFile) {
    // any .html at root
    const rootHtml = strippedPaths.find(e => !e.stripped.includes("/") && e.stripped.toLowerCase().endsWith(".html"));
    if (rootHtml) entryFile = rootHtml.stripped;
  }
  if (!entryFile) {
    // index.html anywhere
    const indexAnywhere = strippedPaths.find(e => e.stripped.toLowerCase().endsWith("/index.html"));
    if (indexAnywhere) entryFile = indexAnywhere.stripped;
  }
  if (!entryFile) {
    // any .html anywhere
    const anyHtml = strippedPaths.find(e => e.stripped.toLowerCase().endsWith(".html"));
    if (anyHtml) entryFile = anyHtml.stripped;
  }
  if (!entryFile) {
    return NextResponse.json({
      error: "No HTML entry file found in ZIP. Make sure your zip contains an index.html (or any .html file).",
    }, { status: 400 });
  }

  // Path traversal protection: each stripped path must not escape
  for (const e of strippedPaths) {
    if (e.stripped.includes("..") || path.isAbsolute(e.stripped)) {
      return NextResponse.json({ error: "ZIP contains an unsafe path" }, { status: 400 });
    }
  }

  // Target directory: /public/games/<slug>/
  const publicGamesRoot = path.join(process.cwd(), "public", "games");
  const targetDir = path.join(publicGamesRoot, slug);

  // If the directory already exists (re-upload of same game), wipe it first
  if (existsSync(targetDir)) {
    await rm(targetDir, { recursive: true, force: true }).catch(() => {});
  }
  await mkdir(targetDir, { recursive: true });

  // Extract files
  let totalSize = 0;
  let fileCount = 0;
  for (const e of strippedPaths) {
    const targetPath = path.join(targetDir, e.stripped);
    // Ensure parent directory exists
    const parentDir = path.dirname(targetPath);
    await mkdir(parentDir, { recursive: true });
    const data = await e.entry.async("nodebuffer");
    await writeFile(targetPath, data);
    totalSize += data.length;
    fileCount++;
  }

  // Compute gameUrl: /games/<slug>/<entryFile>
  const gameUrl = `/games/${slug}/${entryFile}`;

  // Try to find a thumbnail image inside the zip (thumbnail.png/jpg at root)
  let thumbnailUrl: string | null = null;
  const thumbCandidate = strippedPaths.find(e => {
    const p = e.stripped.toLowerCase();
    return (p === "thumbnail.png" || p === "thumbnail.jpg" || p === "thumbnail.jpeg"
         || p === "thumb.png" || p === "thumb.jpg" || p === "cover.png" || p === "cover.jpg");
  });
  if (thumbCandidate) {
    thumbnailUrl = `/games/${slug}/${thumbCandidate.stripped}`;
  }

  // Create or update the Game record (lookup by title, since title is not @@unique)
  const existing = await db.game.findFirst({ where: { title } }).catch(() => null);
  let game;
  if (existing) {
    game = await db.game.update({
      where: { id: existing.id },
      data: {
        description,
        category,
        gameUrl,
        thumbnailUrl,
        fileSize: totalSize,
        isFeatured,
        minStudyMinutes,
        playTimeMinutes,
        isActive: true,
      },
    });
  } else {
    game = await db.game.create({
      data: {
        title,
        description,
        category,
        gameUrl,
        thumbnailUrl,
        fileSize: totalSize,
        isFeatured,
        minStudyMinutes,
        playTimeMinutes,
        isActive: true,
        rating: 0,
        playCount: 0,
        version: "1.0.0",
      },
    });
  }

  return NextResponse.json({
    game,
    extracted: {
      slug,
      fileCount,
      totalSizeBytes: totalSize,
      entryFile,
      gameUrl,
      thumbnailUrl,
      commonRootStripped: commonRoot,
    },
  });
}
