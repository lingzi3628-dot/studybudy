/**
 * Storage abstraction — Phase 90
 *
 * Provides a unified interface for storing/retrieving files.
 * 
 * In production (Vercel + BLOB_READ_WRITE_TOKEN set):
 *   - Uploads go to Vercel Blob Storage
 *   - Returns public URLs
 * 
 * In development / fallback (no BLOB_READ_WRITE_TOKEN):
 *   - Falls back to base64 data URLs stored in DB (existing behavior)
 *   - No code changes needed in callers
 * 
 * Usage:
 *   const { url, storedIn } = await storeFile("games/my-game/index.html", buffer, "text/html");
 *   // url = "https://abc123.public.blob.vercel-storage.com/games/my-game/index.html"
 *   // OR url = "data:text/html;base64,..." (fallback)
 */

export type StoredFile = {
  url: string;           // public URL or data URL
  storedIn: "blob" | "database";  // where the file lives
  size: number;          // bytes
};

const BLOB_BASE_URL = process.env.BLOB_READ_WRITE_TOKEN ? "blob" : null;

/**
 * Store a single file. Uses Vercel Blob if configured, otherwise returns a data URL.
 * 
 * @param pathname - e.g. "games/my-game/index.html" (used as the Blob path)
 * @param buffer - file content
 * @param contentType - MIME type
 */
export async function storeFile(
  pathname: string,
  buffer: Buffer,
  contentType: string
): Promise<StoredFile> {
  // Try Vercel Blob Storage first
  if (BLOB_BASE_URL) {
    try {
      const { put } = await import("@vercel/blob").catch(() => ({ put: null }));
      if (!put) throw new Error('blob not available');
      const blob = await put(pathname, buffer, {
        access: "public",
        contentType,
        addRandomSuffix: false,  // deterministic URLs for caching
      });
      return {
        url: blob.url,
        storedIn: "blob",
        size: buffer.length,
      };
    } catch (e: any) {
      console.warn("[storage] Vercel Blob upload failed, falling back to base64:", e?.message);
    }
  }

  // Fallback: base64 data URL (stored in DB)
  return {
    url: `data:${contentType};base64,${buffer.toString("base64")}`,
    storedIn: "database",
    size: buffer.length,
  };
}

/**
 * Store a ZIP's worth of files. Returns a map of path → StoredFile.
 * 
 * For Vercel Blob: uploads each file individually with a common prefix.
 * For fallback: returns base64 data URLs (caller stores them in DB JSON).
 * 
 * @param basePath - e.g. "games/my-game" (all files get this prefix)
 * @param filesMap - { "index.html": "<base64>", "main.js": "<base64>" }
 * @param mimeTypes - optional map of path → MIME type
 */
export async function storeZipFiles(
  basePath: string,
  filesMap: Record<string, string>,
  mimeTypes?: Record<string, string>
): Promise<{
  files: Record<string, StoredFile>;  // path → { url, storedIn, size }
  entryUrl: string | null;  // URL of the entry HTML (if found)
  storedIn: "blob" | "database";
  totalSize: number;
}> {
  const files: Record<string, StoredFile> = {};
  let totalSize = 0;
  let entryUrl: string | null = null;

  for (const [path, base64] of Object.entries(filesMap)) {
    const buffer = Buffer.from(base64, "base64");
    const contentType = mimeTypes?.[path] || guessMimeType(path);
    const stored = await storeFile(`${basePath}/${path}`, buffer, contentType);
    files[path] = stored;
    totalSize += stored.size;

    // Track entry HTML URL
    if (path === "index.html" || (!entryUrl && path.endsWith(".html"))) {
      entryUrl = stored.url;
    }
  }

  return {
    files,
    entryUrl,
    storedIn: Object.values(files)[0]?.storedIn || "database",
    totalSize,
  };
}

/**
 * Get the URL for a stored file.
 * - If storedIn === "blob": returns the Blob URL directly
 * - If storedIn === "database": returns the data URL from the filesMap
 * 
 * @param filesMap - the JSON column from the DB ({path: base64} or {path: {url, ...}})
 * @param filePath - the file path within the ZIP
 * @param serveBasePath - fallback serve route (e.g. "/api/games/serve")
 * @param resourceId - the game/project ID
 */
export function getFileUrl(
  filesMap: any,
  filePath: string,
  serveBasePath: string,
  resourceId: string
): string {
  // New format: {path: {url, storedIn, size}}
  if (filesMap?.[filePath]?.url) {
    return filesMap[filePath].url;
  }
  // Old format: {path: base64string} → serve via API route
  if (filesMap?.[filePath]) {
    return `${serveBasePath}/${resourceId}/${filePath}`;
  }
  // Not found
  return "";
}

/**
 * Guess MIME type from file extension
 */
function guessMimeType(path: string): string {
  const ext = path.toLowerCase().split(".").pop() || "";
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ico: "image/x-icon",
    webm: "video/webm",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    wasm: "application/wasm",
    txt: "text/plain; charset=utf-8",
    md: "text/plain; charset=utf-8",
  };
  return types[ext] || "application/octet-stream";
}

/**
 * Check if Vercel Blob is configured
 */
export function isBlobConfigured(): boolean {
  return !!BLOB_BASE_URL;
}
