import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 min for big zip extraction
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
 * On Vercel, /public is read-only at runtime — so instead of extracting the
 * ZIP to disk, we store each file as base64 in the Game.files JSON field.
 * The game is then served via /api/games/serve/[id]/[...path].
 *
 * Returns: { game, extracted: { fileCount, totalSizeBytes, entryFile } }
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
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 4MB)" }, { status: 413 });
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

  // Read zip into JSZip
  let zip: JSZip;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return NextResponse.json({ error: "Invalid or corrupted ZIP file" }, { status: 400 });
  }

  // Collect all file entries
  const allEntries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.startsWith("__MACOSX/") || relativePath.includes("/.DS_Store")) return;
    allEntries.push({ path: relativePath, entry });
  });

  if (allEntries.length === 0) {
    return NextResponse.json({ error: "ZIP contains no files" }, { status: 400 });
  }

  // Detect common root folder
  const topLevelFolders = new Set<string>();
  for (const e of allEntries) {
    const parts = e.path.split("/");
    if (parts.length > 1) {
      topLevelFolders.add(parts[0]);
    } else {
      topLevelFolders.clear();
      break;
    }
  }
  const commonRoot = topLevelFolders.size === 1 ? [...topLevelFolders][0] : null;

  const strippedPaths = allEntries.map(e => ({
    original: e.path,
    stripped: commonRoot ? e.path.slice(commonRoot.length + 1) : e.path,
    entry: e.entry,
  }));

  // Find entry HTML file
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
    const rootIndex = strippedPaths.find(e => e.stripped === "index.html");
    if (rootIndex) entryFile = rootIndex.stripped;
  }
  if (!entryFile) {
    const rootHtml = strippedPaths.find(e => !e.stripped.includes("/") && e.stripped.toLowerCase().endsWith(".html"));
    if (rootHtml) entryFile = rootHtml.stripped;
  }
  if (!entryFile) {
    const indexAnywhere = strippedPaths.find(e => e.stripped.toLowerCase().endsWith("/index.html"));
    if (indexAnywhere) entryFile = indexAnywhere.stripped;
  }
  if (!entryFile) {
    const anyHtml = strippedPaths.find(e => e.stripped.toLowerCase().endsWith(".html"));
    if (anyHtml) entryFile = anyHtml.stripped;
  }
  if (!entryFile) {
    return NextResponse.json({
      error: "No HTML entry file found in ZIP. Make sure your zip contains an index.html (or any .html file).",
    }, { status: 400 });
  }

  // Path traversal protection
  for (const e of strippedPaths) {
    if (e.stripped.includes("..") || e.stripped.startsWith("/")) {
      return NextResponse.json({ error: "ZIP contains an unsafe path" }, { status: 400 });
    }
  }

  // Read all files into memory as base64
  // Total size cap to avoid DB bloat: 30 MB across all files
  const MAX_TOTAL = 3 * 1024 * 1024;
  let totalSize = 0;
  const filesMap: Record<string, string> = {};  // path → base64 (no data: prefix)
  let thumbnailPath: string | null = null;

  for (const e of strippedPaths) {
    const data = await e.entry.async("nodebuffer");
    totalSize += data.length;
    if (totalSize > MAX_TOTAL) {
      return NextResponse.json({
        error: `Unzipped total size exceeds ${MAX_TOTAL / (1024 * 1024)} MB limit. Try removing large assets.`,
      }, { status: 413 });
    }
    filesMap[e.stripped] = data.toString("base64");
    // Detect thumbnail
    const lower = e.stripped.toLowerCase();
    if (!thumbnailPath && (
      lower === "thumbnail.png" || lower === "thumbnail.jpg" || lower === "thumbnail.jpeg" ||
      lower === "thumb.png" || lower === "thumb.jpg" ||
      lower === "cover.png" || lower === "cover.jpg"
    )) {
      thumbnailPath = e.stripped;
    }
  }

  // gameUrl: served via our DB-streaming route
  // Build the URL with the game title (we'll use the game ID after creation)
  // We use a placeholder here and update after creating the record.
  // Actually, since we know we'll use the game's ID, we'll set it after upsert/create.
  // For now, set it to /api/games/serve/<id>/<entryFile> — but we need the ID first.
  // Solution: do create/update in two steps.

  // Look up existing game by title
  const existing = await db.game.findFirst({ where: { title } }).catch(() => null);

  let game;
  const gameUrlPlaceholder = "/api/games/serve/PLACEHOLDER/" + entryFile;
  const thumbnailUrl = thumbnailPath ? `/api/games/serve/PLACEHOLDER/${thumbnailPath}` : null;

  if (existing) {
    // Update existing — replace files entirely
    game = await db.game.update({
      where: { id: existing.id },
      data: {
        description,
        category,
        gameUrl: `/api/games/serve/${existing.id}/${entryFile}`,
        thumbnailUrl: thumbnailPath ? `/api/games/serve/${existing.id}/${thumbnailPath}` : null,
        fileSize: totalSize,
        isFeatured,
        minStudyMinutes,
        playTimeMinutes,
        isActive: true,
        files: filesMap,
      },
    });
  } else {
    // Create new
    game = await db.game.create({
      data: {
        title,
        description,
        category,
        gameUrl: gameUrlPlaceholder,  // temp, will fix below
        thumbnailUrl,
        fileSize: totalSize,
        isFeatured,
        minStudyMinutes,
        playTimeMinutes,
        isActive: true,
        rating: 0,
        playCount: 0,
        version: "1.0.0",
        files: filesMap,
      },
    });
    // Now fix gameUrl + thumbnailUrl to point to the real ID
    game = await db.game.update({
      where: { id: game.id },
      data: {
        gameUrl: `/api/games/serve/${game.id}/${entryFile}`,
        thumbnailUrl: thumbnailPath ? `/api/games/serve/${game.id}/${thumbnailPath}` : null,
      },
    });
  }

  return NextResponse.json({
    game,
    extracted: {
      fileCount: Object.keys(filesMap).length,
      totalSizeBytes: totalSize,
      entryFile,
      gameUrl: game.gameUrl,
      thumbnailUrl: game.thumbnailUrl,
      commonRootStripped: commonRoot,
      storedIn: "database",
    },
  });
}
