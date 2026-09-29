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
 * GET /api/games/serve/[id]/[...path]
 *
 * Streams a file from the Game.files JSON field (base64-encoded) to the client.
 *
 * This is the runtime serving mechanism for games uploaded via the admin panel
 * on Vercel — since /public is read-only at runtime, we store uploaded game
 * files in the database and stream them on demand.
 *
 * Cache: 1 hour (immutable per game ID + path combination).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path } = await params;
  const filePath = path.join('/');

  // Load game from DB
  const game = await db.game.findUnique({ where: { id } }).catch(() => null);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (!game.files || typeof game.files !== 'object') {
    return NextResponse.json({ error: "Game has no stored files" }, { status: 404 });
  }

  const filesMap = game.files as Record<string, string>;
  const base64 = filesMap[filePath];
  if (!base64) {
    return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
  }

  // Decode base64 to bytes
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return NextResponse.json({ error: "Failed to decode file" }, { status: 500 });
  }

  const mimeType = getMimeType(filePath);

  // For HTML files, rewrite relative URLs so they go through this same serve route.
  // e.g. <script src="main.js"> → <script src="/api/games/serve/<id>/main.js">
  // This is critical because the iframe loads index.html from this route, and
  // relative URLs would otherwise resolve to the wrong base.
  let body: Uint8Array = buffer;
  if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
    let html = buffer.toString('utf-8');
    const base = `/api/games/serve/${id}`;
    // Compute the base directory of THIS file (so relative paths work from subfolders)
    const fileDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
    const dirBase = `${base}/${fileDir}`;
    // Inject a <base> tag into <head> so relative URLs resolve correctly
    // This is the cleanest way — works for all src/href attributes without rewriting
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head><base href="${dirBase}">`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD><base href="${dirBase}">`);
    } else if (html.includes('<html')) {
      // No <head> tag — inject one
      html = html.replace(/(<html[^>]*>)/i, `$1<head><base href="${dirBase}"></head>`);
    } else {
      // No <html> tag — prepend
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
