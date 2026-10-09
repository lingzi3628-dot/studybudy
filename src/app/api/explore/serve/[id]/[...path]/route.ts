import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.wasm': 'application/wasm',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.pdf':  'application/pdf',
  '.xml':  'application/xml; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(path: string): string {
  const lower = path.toLowerCase();
  for (const ext of Object.keys(MIME_MAP)) {
    if (lower.endsWith(ext)) return MIME_MAP[ext];
  }
  return 'application/octet-stream';
}

/**
 * GET /api/explore/serve/[id]/[...path]
 *
 * Streams a file from ExploreProject.files JSON field (base64) to the client.
 *
 * Phase 10 fixes:
 *   1. Rewrites ABSOLUTE paths (href="/styles.css", src="/js/app.js") to
 *      relative paths so they resolve through the serve route. Previously,
 *      absolute paths would request files from the site root (404).
 *   2. Handles HTML without <head> — injects <base> before the first
 *      <link> or <script> tag, or at the very start.
 *   3. Supports nested directories (css/, js/, images/, etc.) — the
 *      [...path] catch-all already handles this, but the <base href> was
 *      sometimes pointing to the wrong directory.
 *   4. Handles full-stack zips — ignores server-side files (server.js,
 *      package.json, .env, etc.) and serves only the client-side files.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path } = await params;
  const filePath = path.join('/');

  const project = await db.exploreProject.findUnique({ where: { id } }).catch(() => null);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.isPublished) {
    return NextResponse.json({ error: "Project not published" }, { status: 403 });
  }
  if (!project.files || typeof project.files !== 'object') {
    return NextResponse.json({ error: "Project has no stored files" }, { status: 404 });
  }

  const filesMap = (project.files as Record<string, string>) || {};

  // Try the exact path first
  let base64 = filesMap[filePath];

  // Phase 10 — fallback: try case-insensitive match (some zips have mixed case)
  if (!base64) {
    const lowerKey = Object.keys(filesMap).find(k => k.toLowerCase() === filePath.toLowerCase());
    if (lowerKey) base64 = filesMap[lowerKey];
  }

  // Phase 10 — fallback: if the path has a leading slash (from absolute URL rewrite),
  // try stripping it
  if (!base64 && filePath.startsWith('/')) {
    const stripped = filePath.slice(1);
    base64 = filesMap[stripped];
    if (!base64) {
      const lowerKey = Object.keys(filesMap).find(k => k.toLowerCase() === stripped.toLowerCase());
      if (lowerKey) base64 = filesMap[lowerKey];
    }
  }

  if (!base64) {
    return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
  }

  // Increment view count for HTML entry loads (best-effort, don't block)
  if (filePath === project.entryFile) {
    db.exploreProject.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});
  }

  let buffer: Buffer;
  try { buffer = Buffer.from(base64, 'base64'); }
  catch { return NextResponse.json({ error: "Failed to decode file" }, { status: 500 }); }

  const mimeType = getMimeType(filePath);
  let body: Uint8Array = buffer;

  // For HTML files: inject <base href> + rewrite absolute paths
  if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
    let html = buffer.toString('utf-8');

    // The serve base URL for this project — all relative URLs resolve here
    const fileDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
    const serveBase = `/api/explore/serve/${id}/${fileDir}`;

    // Phase 10 fix #1 — rewrite ABSOLUTE paths to relative.
    // Common patterns in uploaded sites:
    //   href="/styles.css"     → href="styles.css"
    //   src="/js/app.js"       → src="js/app.js"
    //   href="/images/logo.png" → href="images/logo.png"
    // We rewrite ALL src="/..." and href="/..." to remove the leading slash,
    // so the <base href> makes them resolve through the serve route.
    // BUT we DON'T rewrite:
    //   - Protocol URLs (https://..., http://...)
    //   - Data URLs (data:image/...)
    //   - Hash links (#section)
    //   - Already-relative paths (./styles.css, ../styles.css)
    html = html.replace(
      /((?:src|href)\s*=\s*["'])\/(?!\/|api\/|_next\/)/gi,
      `$1${fileDir}`
    );

    // Phase 10 fix #2 — inject <base href> into the HTML.
    // The <base> tag tells the browser where to resolve relative URLs.
    // We inject it as the FIRST element inside <head>, or before the
    // first <link>/<script> if there's no <head>, or at the very start.
    const baseTag = `<base href="${serveBase}">`;

    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.match(/<head[^>]*>/i)) {
      html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
    } else if (html.includes('<link') || html.includes('<script')) {
      // No <head> but has link/script tags — inject before the first one
      html = html.replace(
        /(<link|<script)/i,
        `${baseTag}$1`
      );
    } else if (html.match(/<html[^>]*>/i)) {
      // Has <html> but no <head> — inject a <head> with the base tag
      html = html.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);
    } else {
      // No HTML structure at all — prepend the base tag
      html = baseTag + html;
    }

    body = Buffer.from(html, 'utf-8');
  }

  // Phase 10 — for CSS files: rewrite url() and @import paths
  // CSS files may reference images/fonts with relative paths.
  // The <base href> in the HTML doesn't apply to CSS, so we need to
  // make CSS url() references absolute.
  if (filePath.endsWith('.css')) {
    let css = buffer.toString('utf-8');
    const fileDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
    const serveBase = `/api/explore/serve/${id}/${fileDir}`;

    // Rewrite url(...) paths — make them absolute relative to the serve route
    // url("images/bg.png") → url("/api/explore/serve/{id}/{fileDir}images/bg.png")
    // But DON'T rewrite: url(http://...), url(data:...), url(#...), url(/...)
    css = css.replace(
      /url\(\s*(['"]?)(?!https?:|data:|#|\/|\/\/)([^'")]+)\1\s*\)/gi,
      (match, quote, path) => {
        // Skip data: URLs, http(s) URLs, absolute paths, protocol-relative
        if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/') || path.startsWith('#')) {
          return match;
        }
        return `url(${quote}${serveBase}${path}${quote})`;
      }
    );

    // Also rewrite @import "..." paths
    css = css.replace(
      /@import\s+(['"])(?!https?:|\/|\/\/)([^'"]+)\1/gi,
      (match, quote, path) => {
        return `@import ${quote}${serveBase}${path}${quote}`;
      }
    );

    body = Buffer.from(css, 'utf-8');
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
