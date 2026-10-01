/**
 * Shared upload helpers — Phase 90
 *
 * Eliminates ~80 lines of boilerplate duplicated across 6 upload routes:
 * - admin/games/upload
 * - admin/explore/upload
 * - admin/exam-papers/upload
 * - admin/exam-papers/bulk-upload
 * - tutor/upload-outline
 * - tutor/upload-document
 *
 * Usage:
 *   const { file, fields } = await parseFormData(req, { maxFileSize: 4 * 1024 * 1024 });
 *   const { files, entryFile, thumbnailPath, totalSize } = await extractZipToBase64(file);
 *   const text = await extractTextFromFile(file);
 */

import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";

// ============================================================
// FormData parsing + validation
// ============================================================

export async function parseFormData(
  req: NextRequest,
  opts: { maxFileSize?: number; allowedExts?: string[] } = {}
): Promise<{ file: File; fields: Record<string, string> } | NextResponse> {
  const maxFileSize = opts.maxFileSize ?? 4 * 1024 * 1024; // 4MB default (Vercel body limit is 4.5MB)
  const allowedExts = opts.allowedExts ?? [];

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

  if (file.size > maxFileSize) {
    const mb = Math.floor(maxFileSize / (1024 * 1024));
    return NextResponse.json({ error: `File too large (max ${mb}MB)` }, { status: 413 });
  }

  const ext = file.name.toLowerCase().split(".").pop() || "";
  if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
    return NextResponse.json(
      { error: `Only .${allowedExts.join(", .")} files are accepted` },
      { status: 400 }
    );
  }

  // Extract all string fields
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
    }
  }

  return { file, fields };
}

// ============================================================
// ZIP extraction → base64 map
// ============================================================

export type ZipExtractionResult = {
  filesMap: Record<string, string>;  // path → base64
  entryFile: string | null;
  thumbnailPath: string | null;
  totalSize: number;
  fileCount: number;
  commonRoot: string | null;
};

const THUMBNAIL_NAMES = [
  "thumbnail.png", "thumbnail.jpg", "thumbnail.jpeg",
  "thumb.png", "thumb.jpg",
  "cover.png", "cover.jpg",
];

export async function extractZipToBase64(
  file: File,
  opts: { maxTotalSize?: number; customEntry?: string | null } = {}
): Promise<ZipExtractionResult | { error: string }> {
  const maxTotalSize = opts.maxTotalSize ?? 3 * 1024 * 1024; // 3MB default

  let zip: JSZip;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { error: "Invalid or corrupted ZIP file" };
  }

  // Collect entries (skip macOS junk + directories)
  const allEntries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.startsWith("__MACOSX/") || relativePath.includes("/.DS_Store")) return;
    allEntries.push({ path: relativePath, entry });
  });

  if (allEntries.length === 0) {
    return { error: "ZIP contains no files" };
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

  const strippedPaths = allEntries.map((e) => ({
    original: e.path,
    stripped: commonRoot ? e.path.slice(commonRoot.length + 1) : e.path,
    entry: e.entry,
  }));

  // Path traversal protection
  for (const e of strippedPaths) {
    if (e.stripped.includes("..") || e.stripped.startsWith("/")) {
      return { error: "ZIP contains an unsafe path" };
    }
  }

  // Find entry HTML file
  let entryFile: string | null = opts.customEntry
    ? (strippedPaths.some((e) => e.stripped === opts.customEntry) ? opts.customEntry : null)
    : null;

  if (!entryFile) {
    // Auto-detect: index.html at root → any .html at root → index.html anywhere → any .html anywhere
    entryFile =
      strippedPaths.find((e) => e.stripped === "index.html")?.stripped ||
      strippedPaths.find((e) => !e.stripped.includes("/") && e.stripped.toLowerCase().endsWith(".html"))?.stripped ||
      strippedPaths.find((e) => e.stripped.toLowerCase().endsWith("/index.html"))?.stripped ||
      strippedPaths.find((e) => e.stripped.toLowerCase().endsWith(".html"))?.stripped ||
      null;
  }

  if (!entryFile) {
    return { error: "No HTML entry file found in ZIP" };
  }

  // Read all files as base64
  let totalSize = 0;
  const filesMap: Record<string, string> = {};
  let thumbnailPath: string | null = null;

  for (const e of strippedPaths) {
    const data = await e.entry.async("nodebuffer");
    totalSize += data.length;
    if (totalSize > maxTotalSize) {
      const mb = Math.floor(maxTotalSize / (1024 * 1024));
      return { error: `Unzipped total size exceeds ${mb} MB limit` };
    }
    filesMap[e.stripped] = data.toString("base64");

    // Detect thumbnail
    const lower = e.stripped.toLowerCase();
    if (!thumbnailPath && THUMBNAIL_NAMES.includes(lower)) {
      thumbnailPath = e.stripped;
    }
  }

  return {
    filesMap,
    entryFile,
    thumbnailPath,
    totalSize,
    fileCount: Object.keys(filesMap).length,
    commonRoot,
  };
}

// ============================================================
// Text extraction from files (PDF, DOCX, DOC, TXT, etc.)
// ============================================================

export async function extractTextFromFile(
  file: File,
  opts: { maxLength?: number } = {}
): Promise<string> {
  const maxLength = opts.maxLength ?? 100_000;
  const ext = file.name.toLowerCase().split(".").pop() || "";
  const buffer = Buffer.from(await file.arrayBuffer());

  let text = "";

  if (ext === "pdf") {
    try {
      const { extractPdfText } = await import("@/lib/pdf");
      text = await extractPdfText(buffer);
    } catch {
      text = "";
    }
  } else if (ext === "docx" || ext === "doc") {
    try {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    } catch {
      text = buffer.toString("utf-8");
    }
  } else if (ext === "xlsx" || ext === "xls") {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheets: string[] = [];
      workbook.eachSheet((sheet: any) => {
        const rows: string[] = [];
        sheet.eachRow((row: any) => {
          const vals = row.values as any[];
          const cells = vals.slice(1).map((v: any) =>
            v instanceof Object ? (v.text || v.result || JSON.stringify(v)) : String(v ?? "")
          );
          rows.push(cells.join("\t"));
        });
        sheets.push(`=== Sheet: ${sheet.name} ===\n${rows.join("\n")}`);
      });
      text = sheets.join("\n\n");
    } catch {
      text = "";
    }
  } else {
    // txt, md, csv, json, etc.
    text = buffer.toString("utf-8");
  }

  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return text.trim();
}

// ============================================================
// Slug helper
// ============================================================

export function slugify(s: string, maxLength = 60): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength) || `game-${Date.now()}`;
}

// ============================================================
// Two-step DB create pattern (placeholder URL → real ID → update)
// ============================================================

export function buildServeUrl(
  basePath: string,  // e.g. "/api/games/serve" or "/api/explore/serve"
  id: string,
  entryFile: string
): string {
  return `${basePath}/${id}/${entryFile}`;
}

export function buildThumbnailUrl(
  basePath: string,
  id: string,
  thumbnailPath: string | null,
  customThumbnailBase64: string | null
): string | null {
  if (customThumbnailBase64) return customThumbnailBase64;
  if (thumbnailPath) return `${basePath}/${id}/${thumbnailPath}`;
  return null;
}
