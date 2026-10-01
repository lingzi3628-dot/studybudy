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
 * For HTML files, injects <base href> so relative URLs resolve through this route.
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

  // Phase 90.4 — Safe cast with fallback
  const filesMap = (project.files as Record<string, string>) || {};
  const base64 = filesMap[filePath];
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

  if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
    let html = buffer.toString('utf-8');
    const fileDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
    const dirBase = `/api/explore/serve/${id}/${fileDir}`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head><base href="${dirBase}">`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD><base href="${dirBase}">`);
    } else if (html.includes('<html')) {
      html = html.replace(/(<html[^>]*>)/i, `$1<head><base href="${dirBase}"></head>`);
    } else {
      html = `<base href="${dirBase}">` + html;
    }
    body = Buffer.from(html, 'utf-8');
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
