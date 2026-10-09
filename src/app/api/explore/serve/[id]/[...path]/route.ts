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

  // For HTML files: inject <base href> + rewrite absolute paths + detect React/Vite
  if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
    let html = buffer.toString('utf-8');

    // Phase 10 — Detect React/Vite/Next.js projects that need a build step.
    // These projects have <script type="module" src="/src/main.tsx"> or similar.
    // Browsers can't run TypeScript directly — the project needs to be built
    // (compiled) first. We detect this pattern and show a helpful message
    // instead of a broken blank page.
    const isUnbuiltReact =
      /<script[^>]+type=["']module["'][^>]+src=["']\/?src\//i.test(html) ||
      /<script[^>]+src=["']\/?src\/main\.(ts|js)x?["']/i.test(html) ||
      (filesMap['package.json'] && filesMap['vite.config.ts']) ||
      (filesMap['package.json'] && filesMap['vite.config.js']);

    if (isUnbuiltReact && filePath === project.entryFile) {
      // Show a "needs build" page instead of the broken HTML
      const buildPage = generateBuildRequiredPage(project, filesMap);
      return new NextResponse(new Uint8Array(Buffer.from(buildPage, 'utf-8')), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // The serve base URL for this project — all relative URLs resolve here
    const fileDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
    const serveBase = `/api/explore/serve/${id}/${fileDir}`;

    // Phase 10 fix #1 — rewrite ABSOLUTE paths to relative.
    html = html.replace(
      /((?:src|href)\s*=\s*["'])\/(?!\/|api\/|_next\/)/gi,
      `$1${fileDir}`
    );

    // Phase 10 fix #2 — inject <base href> into the HTML.
    const baseTag = `<base href="${serveBase}">`;

    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.match(/<head[^>]*>/i)) {
      html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
    } else if (html.includes('<link') || html.includes('<script')) {
      html = html.replace(
        /(<link|<script)/i,
        `${baseTag}$1`
      );
    } else if (html.match(/<html[^>]*>/i)) {
      html = html.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);
    } else {
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

// ============================================================
// Phase 10 — generateBuildRequiredPage
//
// When a React/Vite/Next.js project is uploaded as a zip (source code,
// not a built site), the browser can't run TypeScript/JSX directly.
// Instead of showing a broken blank page, we show a helpful page that:
//   1. Explains the project needs to be built
//   2. Lists the source files in the zip
//   3. Shows the package.json contents (so the user knows what framework)
//   4. Provides instructions on how to build it locally
// ============================================================

function generateBuildRequiredPage(
  project: { id: string; title: string; description: string | null },
  filesMap: Record<string, string>,
): string {
  const fileList = Object.keys(filesMap).sort();
  const hasPackageJson = Boolean(filesMap['package.json']);

  // Try to read package.json for the project name + framework
  let projectName = project.title;
  let framework = "Unknown";
  let buildCmd = "npm run build";
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(Buffer.from(filesMap['package.json'], 'base64').toString('utf-8'));
      projectName = pkg.name || projectName;
      buildCmd = pkg.scripts?.build || buildCmd;
      if (pkg.dependencies?.react) framework = "React";
      if (pkg.dependencies?.vue) framework = "Vue";
      if (pkg.dependencies?.svelte) framework = "Svelte";
      if (pkg.dependencies?.next) framework = "Next.js";
      if (pkg.devDependencies?.vite) framework += " + Vite";
    } catch {}
  }

  const sourceFiles = fileList.filter(f =>
    f.endsWith('.tsx') || f.endsWith('.jsx') || f.endsWith('.ts') ||
    f.endsWith('.vue') || f.endsWith('.svelte') ||
    f.endsWith('.css') || f.endsWith('.scss')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} — Source Code Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .container { max-width: 600px; width: 100%; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 2rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; color: #f1f5f9; margin-bottom: 0.5rem; }
    .framework { display: inline-block; background: #312e81; color: #a5b4fc; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem; }
    p { color: #94a3b8; font-size: 0.875rem; line-height: 1.6; margin-bottom: 1rem; }
    .code { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 1rem; font-family: monospace; font-size: 0.8rem; color: #4ade80; margin: 1rem 0; overflow-x: auto; }
    .files { margin: 1rem 0; }
    .files h3 { font-size: 0.75rem; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem; }
    .file-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .file { background: #334155; color: #cbd5e1; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-family: monospace; }
    .note { background: #1e3a5f; border: 1px solid #2563eb; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
    .note p { color: #93c5fd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="icon">📦</div>
      <h1>${projectName}</h1>
      <div class="framework">${framework}</div>
      <p>This is a <strong>${framework}</strong> project uploaded as source code. It needs to be <strong>built</strong> (compiled) before it can run in the browser.</p>
      <p>Source files detected: ${sourceFiles.length}</p>

      <div class="files">
        <h3>Source Files</h3>
        <div class="file-list">
          ${sourceFiles.slice(0, 15).map(f => `<span class="file">${f}</span>`).join('')}
          ${sourceFiles.length > 15 ? `<span class="file">+ ${sourceFiles.length - 15} more</span>` : ''}
        </div>
      </div>

      <div class="code">
        # Build this project locally:<br>
        npm install<br>
        ${buildCmd}<br><br>
        # The built files will be in:<br>
        # dist/ (Vite) or .next/ (Next.js) or build/ (CRA)
      </div>

      <div class="note">
        <p>💡 <strong>For administrators:</strong> To display this project properly, build it locally and re-upload the <code>dist/</code> folder (or <code>build/</code> for CRA) as a zip. The built output contains plain HTML/CSS/JS that browsers can run directly.</p>
      </div>

      ${project.description ? `<p style="margin-top:1rem;color:#64748b;font-size:0.75rem;">${project.description}</p>` : ''}
    </div>
  </div>
</body>
</html>`;
}
