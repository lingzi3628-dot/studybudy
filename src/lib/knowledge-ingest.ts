/**
 * Knowledge ingestion pipeline — Phase 72
 *
 * Extracts text from URLs, GitHub repos, files, and raw text; chunks it
 * for RAG retrieval. All functions are pure (no DB, no React) so they
 * can be called from API routes AND tested in isolation.
 *
 * Chunking reuses `chunkText` from rag-engine (paragraph-aware, 1200-char
 * default, 180-char overlap) — same function the NotebookScreen RAG cells
 * use, so retrieval quality is consistent across the app.
 *
 * URL scraping is SSRF-guarded (reuses Phase 55's assertSafeUrl + the
 * DNS-lookup pattern from /api/tools/http). GitHub ingestion resolves
 * github.com/owner/repo URLs to raw.githubusercontent.com and fetches
 * the README + docs/ folder.
 */

import dns from "node:dns/promises";
import { assertSafeUrl, isPrivateIp } from "@/lib/ssrf-guard";
import { chunkText } from "@/lib/rag-engine";

// === Types ===

export type KnowledgeType = "url" | "github" | "file" | "text";

export type KnowledgeChunk = {
  index: number;
  text: string;
};

export type IngestionResult = {
  title: string;
  source: string | null;
  contentText: string;
  chunks: KnowledgeChunk[];
  charCount: number;
  chunkCount: number;
};

// === Constants ===

const MAX_CONTENT_CHARS = 500_000; // ~100 pages of text
const MAX_FETCH_BYTES = 5_000_000; // 5 MB per fetch
const FETCH_TIMEOUT_MS = 15_000;
const GITHUB_MAX_FILES = 20;

// === HTML → text (no deps — regex-based) ===

/**
 * Convert HTML to plain text. Strips scripts, styles, nav, headers,
 * footers, then all remaining tags. Decodes common HTML entities.
 * Good enough for RAG — not as clean as cheerio, but zero deps.
 */
export function htmlToText(html: string): string {
  let text = html;
  // Remove everything in <script>, <style>, <nav>, <header>, <footer>,
  // <aside>, <noscript> blocks (including content).
  text = text.replace(/<(script|style|nav|header|footer|aside|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Remove HTML comments.
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  // Convert <br>, <p>, <div>, <li>, <h1>-<h6> to newlines (preserves structure).
  text = text.replace(/<(br|p|div|li|h[1-6]|tr)\b[^>]*>/gi, "\n");
  // Convert <td>, <th> to tab-separated (preserves table structure).
  text = text.replace(/<t[dh]\b[^>]*>/gi, "\t");
  // Strip all remaining tags.
  text = text.replace(/<[^>]+>/g, " ");
  // Decode HTML entities.
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  // Collapse whitespace.
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/** Extract the <title> from an HTML page (for the source name). */
function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].trim().slice(0, 200);
}

// === SSRF-guarded fetch ===

/**
 * Fetch a URL with SSRF protection. Validates the URL, resolves DNS,
 * blocks private IPs, follows redirects (re-validating each hop),
 * and enforces a byte limit + timeout.
 *
 * Mirrors the pattern from /api/tools/http (Phase 55).
 */
async function safeFetch(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {},
): Promise<{ url: string; status: number; contentType: string; body: string }> {
  const maxBytes = opts.maxBytes ?? MAX_FETCH_BYTES;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  let currentUrl = rawUrl;
  let redirectCount = 0;
  const MAX_REDIRECTS = 5;

  while (redirectCount <= MAX_REDIRECTS) {
    // Validate URL string.
    const check = assertSafeUrl(currentUrl);
    if (!check.ok) throw new Error(`URL rejected: ${check.reason}`);

    // DNS lookup + private-IP check (anti-rebinding).
    const hostname = check.url.hostname;
    let addrs: Array<{ address: string; family: number }>;
    try {
      addrs = await dns.lookup(hostname, { all: true });
    } catch {
      throw new Error(`DNS lookup failed for "${hostname}"`);
    }
    if (!addrs.length) throw new Error(`No DNS records for "${hostname}"`);
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        throw new Error(`Refusing to fetch private/internal host: ${hostname} (${a.address})`);
      }
    }

    // Fetch with timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual", // we handle redirects ourselves to re-validate
        headers: {
          "User-Agent": "StudyBuddy-KnowledgeIngest/1.0",
          ...(opts.accept ? { Accept: opts.accept } : {}),
        },
      });

      // Handle redirects.
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) throw new Error(`Redirect ${r.status} without Location header`);
        const next = new URL(loc, currentUrl).href;
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) throw new Error("Too many redirects");
        currentUrl = next;
        continue;
      }

      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);

      const contentType = r.headers.get("content-type") || "text/plain";
      // Read body with byte limit.
      const reader = r.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let body = "";
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > maxBytes) {
          throw new Error(`Response exceeds ${maxBytes} byte limit`);
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode(); // flush
      return { url: currentUrl, status: r.status, contentType, body };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects");
}

// === URL ingestion ===

/**
 * Fetch a web page, extract text. Handles HTML pages (strips to text)
 * and plain-text responses (returns as-is).
 */
export async function ingestUrl(url: string): Promise<IngestionResult> {
  const result = await safeFetch(url, { accept: "text/html, text/plain, application/json" });

  let text: string;
  const ct = result.contentType.toLowerCase();
  if (ct.includes("text/html")) {
    text = htmlToText(result.body);
  } else if (ct.includes("application/json")) {
    // JSON — try to extract text fields, else stringify.
    try {
      const obj = JSON.parse(result.body);
      text = jsonToText(obj);
    } catch {
      text = result.body;
    }
  } else {
    // Plain text, markdown, CSV, etc.
    text = result.body;
  }

  text = text.slice(0, MAX_CONTENT_CHARS);
  const title = extractHtmlTitle(result.body) || new URL(url).hostname;
  const chunks = chunkText(text).map((t, i) => ({ index: i, text: t }));

  return {
    title: title.slice(0, 200),
    source: url,
    contentText: text,
    chunks,
    charCount: text.length,
    chunkCount: chunks.length,
  };
}

/** Recursively extract text values from a JSON object (for JSON URL ingestion). */
function jsonToText(obj: any): string {
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return obj.map(jsonToText).join("\n");
  if (obj && typeof obj === "object") {
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${jsonToText(v)}`)
      .join("\n");
  }
  return "";
}

// === GitHub ingestion ===

/**
 * Ingest a GitHub repo by fetching its README + docs/ folder.
 * Accepts URLs like:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/main/docs
 *   owner/repo
 *
 * Fetches the README (trying main, then master) + up to 20 files from
 * docs/ (if it exists). All fetches go through safeFetch (SSRF-guarded).
 */
export async function ingestGithub(repoUrl: string): Promise<IngestionResult> {
  // Parse the repo URL.
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)\/?(.*))?/) ||
    repoUrl.match(/^([^/]+)\/([^/]+)$/);
  if (!match) throw new Error("Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo");

  const [, owner, repoRaw, branch, path] = match;
  const repo = repoRaw.replace(/\.git$/, "");
  const ref = branch || "main";

  const parts: string[] = [];

  // 1. Fetch README (try main, then master).
  for (const b of [ref, "main", "master"]) {
    try {
      const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`;
      const r = await safeFetch(readmeUrl, { timeoutMs: 10_000 });
      parts.push(`# README (${b})\n\n${r.body}`);
      break;
    } catch { /* try next branch */ }
  }

  // 2. Fetch files from the specified path (or docs/ if no path).
  const targetPath = path || "docs";
  try {
    // GitHub API to list contents.
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}?ref=${ref}`;
    const apiResult = await safeFetch(apiUrl, { accept: "application/vnd.github.v3+json", timeoutMs: 10_000 });
    const files = JSON.parse(apiResult.body);
    if (Array.isArray(files)) {
      const textFiles = files
        .filter((f: any) => f.type === "file" && /\.(md|txt|json|csv|py|js|ts|tsx|jsx|rs|go|java|rb|php|sh|yml|yaml|toml)$/i.test(f.name))
        .slice(0, GITHUB_MAX_FILES);
      for (const f of textFiles) {
        try {
          const rawUrl = f.download_url || `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${targetPath}/${f.name}`;
          const r = await safeFetch(rawUrl, { timeoutMs: 10_000 });
          parts.push(`## ${f.name}\n\n${r.body}`);
        } catch { /* skip failed file */ }
      }
    }
  } catch { /* path doesn't exist or is private — README is enough */ }

  if (parts.length === 0) {
    throw new Error(`Could not fetch any content from ${owner}/${repo}. Check that the repo is public and has a README.`);
  }

  const contentText = parts.join("\n\n---\n\n").slice(0, MAX_CONTENT_CHARS);
  const chunks = chunkText(contentText).map((t, i) => ({ index: i, text: t }));

  return {
    title: `${owner}/${repo}`,
    source: `https://github.com/${owner}/${repo}`,
    contentText,
    chunks,
    charCount: contentText.length,
    chunkCount: chunks.length,
  };
}

// === Text ingestion (chunking only) ===

export function ingestText(text: string, title = "Pasted text"): IngestionResult {
  const contentText = text.slice(0, MAX_CONTENT_CHARS);
  const chunks = chunkText(contentText).map((t, i) => ({ index: i, text: t }));
  return {
    title: title.slice(0, 200),
    source: null,
    contentText,
    chunks,
    charCount: contentText.length,
    chunkCount: chunks.length,
  };
}

// === File ingestion (text extraction from buffer) ===

/**
 * Extract text from a file buffer. Handles PDF, TXT, MD, CSV, JSON.
 * For DOCX/XLSX, the caller should use the existing /api/tutor/upload-document
 * route which has mammoth + xlsx + libreoffice support.
 *
 * For PDF, uses pdf-parse (already a dependency).
 */
export async function ingestFile(
  filename: string,
  mimeType: string,
  buffer: ArrayBuffer,
): Promise<IngestionResult> {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let text = "";

  if (ext === "pdf" || mimeType === "application/pdf") {
    // Dynamic import — pdf-parse is heavy.
    const pdfModule = await import("pdf-parse");
    const pdfParse = (pdfModule as any).default || pdfModule;
    const data = await pdfParse(buffer);
    text = data.text;
  } else if (ext === "docx" || mimeType.includes("officedocument.wordprocessingml")) {
    // mammoth is already a dependency.
    const mammothModule = await import("mammoth");
    const mammoth = (mammothModule as any).default || mammothModule;
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    text = result.value;
  } else if (ext === "json") {
    text = Buffer.from(buffer).toString("utf-8");
    try {
      const obj = JSON.parse(text);
      text = jsonToText(obj);
    } catch { /* keep raw */ }
  } else {
    // txt, md, csv, code files — read as UTF-8.
    text = Buffer.from(buffer).toString("utf-8");
  }

  text = text.slice(0, MAX_CONTENT_CHARS);
  const chunks = chunkText(text).map((t, i) => ({ index: i, text: t }));

  return {
    title: filename.slice(0, 200),
    source: filename,
    contentText: text,
    chunks,
    charCount: text.length,
    chunkCount: chunks.length,
  };
}
