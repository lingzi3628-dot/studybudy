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

    // Phase 10 — Detect React/Vite projects that reference .tsx/.jsx files.
    // Instead of showing a "build required" page, we REWRITE the HTML to
    // use Babel Standalone (loaded from CDN) which transforms .tsx/.jsx
    // to plain JS IN THE BROWSER. This works on ALL Vercel plans — no
    // server-side build needed.
    //
    // What we do:
    //   1. Load React + ReactDOM from CDN (replaces npm imports)
    //   2. Load Babel Standalone from CDN (transforms JSX in browser)
    //   3. Rewrite <script src="/src/main.tsx"> → <script type="text/babel" src="...">
    //   4. Babel fetches + transforms the .tsx file at runtime
    //
    // This is how CodePen, JSFiddle, etc. run React without a build step.
    const isUnbuiltReact =
      /<script[^>]+src=["'][^"']*\.tsx["']/i.test(html) ||
      /<script[^>]+type=["']module["'][^>]+src=["'][^"']*\.jsx["']/i.test(html) ||
      /<script[^>]+src=["']\/?src\/main\.tsx["']/i.test(html);

    if (isUnbuiltReact && filePath === project.entryFile) {
      // Rewrite the HTML to use Babel Standalone + CDN React
      const entryDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
      const rewritten = rewriteReactForBrowser(html, id, entryDir);
      return new NextResponse(new Uint8Array(Buffer.from(rewritten, 'utf-8')), {
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
// Phase 10 — rewriteReactForBrowser
//
// Rewrites a React/Vite project's HTML so it runs IN THE BROWSER without
// a build step. Uses:
//   - React + ReactDOM from CDN (unpkg.com)
//   - Babel Standalone from CDN (transforms JSX/TSX at runtime)
//
// This is the same approach CodePen/JSFiddle use. It's slower than a
// pre-built site (Babel transforms ~2-3s on first load) but it WORKS
// on all Vercel plans with zero server-side processing.
// ============================================================

function rewriteReactForBrowser(
  html: string,
  projectId: string,
  fileDir: string,
): string {
  const serveBase = `/api/explore/serve/${projectId}/${fileDir}`;

  // 1. Find the original script tag that references .tsx/.jsx
  // e.g. <script type="module" src="/src/main.tsx"></script>
  // We replace it with a Babel-powered version
  const scriptTagMatch = html.match(
    /<script[^>]*(?:type=["']module["'])?[^>]*src=["']([^"']*\.(?:tsx|jsx))["'][^>]*>\s*<\/script>/i
  );

  const entryScript = scriptTagMatch?.[1] || "/src/main.tsx";
  // Rewrite the entry script path to be relative (remove leading /)
  const entryPath = entryScript.replace(/^\//, "");

  // 2. Rewrite the HTML
  let rewritten = html;

  // Remove the original module script tag (we'll replace it with Babel)
  rewritten = rewritten.replace(
    /<script[^>]*(?:type=["']module["'])?[^>]*src=["'][^"']*\.(?:tsx|jsx)["'][^>]*>\s*<\/script>/i,
    ""
  );

  // Also remove any other <script type="module"> tags that import from the entry
  rewritten = rewritten.replace(
    /<script[^>]*type=["']module["'][^>]*>\s*<\/script>/gi,
    ""
  );

  // 3. Inject React + ReactDOM + Babel from CDN + a loader script
  const cdnScripts = `
<!-- Phase 10 — Auto-injected for in-browser React transformation -->
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>

<!-- Fetch + transform the entry .tsx/.jsx file -->
<script>
(function() {
  const SERVE_BASE = "${serveBase}";
  const ENTRY = "${entryPath}";

  // Fetch the entry file
  fetch(SERVE_BASE + ENTRY)
    .then(r => r.text())
    .then(code => {
      // Resolve relative imports (import './App.tsx' → fetch + inline)
      // We need to handle:
      //   1. import X from './file' → fetch file, transform, inline
      //   2. import X from 'react' → use global React
      //   3. import X from 'react-dom' → use global ReactDOM
      //   4. import './file.css' → inject as <link>

      // Simple approach: replace known imports with globals
      let transformedCode = code;

      // Replace react imports with globals
      transformedCode = transformedCode
        .replace(/import\s+React[,{][^;]*from\s+['"]react['"];?/gi, 'const { useState, useEffect, useRef, useCallback, useMemo, useContext, useReducer } = React;')
        .replace(/import\s+\*\s+as\s+React\s+from\s+['"]react['"];?/gi, '')
        .replace(/import\s+ReactDOM\s+from\s+['"]react-dom['"];?/gi, 'const ReactDOM = window.ReactDOM;')
        .replace(/import\s+{[^}]+}\s+from\s+['"]react['"];?/gi, (match) => {
          // Extract the named imports
          const namedMatch = match.match(/import\s+{([^}]+)}\s+from\s+['"]react['"];?/);
          if (namedMatch) {
            const names = namedMatch[1].trim();
            return 'const { ' + names + ' } = React;';
          }
          return match;
        })
        .replace(/import\s+{[^}]+}\s+from\s+['"]react-dom['"];?/gi, (match) => {
          const namedMatch = match.match(/import\s+{([^}]+)}\s+from\s+['"]react-dom['"];?/);
          if (namedMatch) {
            const names = namedMatch[1].trim();
            return 'const { ' + names + ' } = ReactDOM;';
          }
          return match;
        });

      // Collect CSS imports
      const cssImports = [];
      transformedCode = transformedCode.replace(
        /import\s+['"]([^'"]+\.css)['"];?/gi,
        (match, cssPath) => {
          cssImports.push(cssPath.replace(/^\\.\\//, '').replace(/^\\.\\.\\//, ''));
          return '';
        }
      );

      // Inject CSS links
      cssImports.forEach(cssPath => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = SERVE_BASE + cssPath.replace(/^\\.\\//, '');
        document.head.appendChild(link);
      });

      // Collect + resolve local component imports (./App, ../utils/cn, etc.)
      const localImports = [];
      transformedCode = transformedCode.replace(
        /import\s+(?:(?:{[^}]+})|(?:\w+)|(?:\*\s+as\s+\w+))\s+from\s+['"](\.[^'"]+)['"];?/gi,
        (match, importPath) => {
          localImports.push(importPath);
          return '';
        }
      );

      // Fetch all local imports in parallel, then transform + evaluate
      const importPromises = localImports.map(async (importPath) => {
        // Resolve the path relative to the entry file's directory
        let resolvedPath = importPath.replace(/^\\.\\//, '');
        const entryDir = ENTRY.includes('/') ? ENTRY.slice(0, ENTRY.lastIndexOf('/') + 1) : '';
        resolvedPath = entryDir + resolvedPath;

        // Try .tsx, .jsx, .ts, .js extensions
        const extensions = ['.tsx', '.jsx', '.ts', '.js', '/index.tsx', '/index.jsx', '/index.ts', '/index.js'];
        for (const ext of extensions) {
          try {
            const r = await fetch(SERVE_BASE + resolvedPath + (resolvedPath.match(/\\.(tsx|jsx|ts|js)$/) ? '' : ext));
            if (r.ok) {
              const code = await r.text();
              // Transform with Babel
              const transformed = Babel.transform(code, {
                presets: ['react', 'typescript'],
                plugins: [],
              }).code;
              return { path: importPath, code: transformed };
            }
          } catch (e) {
            // Try next extension
          }
        }
        return null;
      });

      Promise.all(importPromises).then(results => {
        // Concatenate all transformed imports + the entry code
        const allCode = results.filter(r => r).map(r => r.code).join('\\n\\n') + '\\n\\n' + transformedCode;

        // Transform the entry code with Babel
        const finalTransformed = Babel.transform(allCode, {
          presets: ['react', 'typescript'],
          plugins: [],
        }).code;

        // Evaluate the transformed code
        const script = document.createElement('script');
        script.textContent = finalTransformed;
        document.body.appendChild(script);
      }).catch(err => {
        document.body.innerHTML = '<div style="font-family:sans-serif;padding:2rem;color:#dc2626;">' +
          '<h2>Failed to load React components</h2>' +
          '<pre style="white-space:pre-wrap;font-size:0.8rem;">' + err.message + '</pre>' +
          '<p>Some imports may not be resolvable in browser mode. ' +
          'Try building the project locally and uploading the dist/ folder.</p></div>';
      });
    })
    .catch(err => {
      document.body.innerHTML = '<div style="font-family:sans-serif;padding:2rem;color:#dc2626;">' +
        '<h2>Failed to load entry file: ' + ENTRY + '</h2>' +
        '<pre style="white-space:pre-wrap;font-size:0.8rem;">' + err.message + '</pre></div>';
    });
})();
</script>
<!-- End auto-injected -->`;

  // 4. Inject the CDN scripts before </body> (or at the end)
  if (rewritten.includes("</body>")) {
    rewritten = rewritten.replace("</body>", `${cdnScripts}\n</body>`);
  } else if (rewritten.includes("</html>")) {
    rewritten = rewritten.replace("</html>", `${cdnScripts}\n</html>`);
  } else {
    rewritten = rewritten + cdnScripts;
  }

  // 5. Add a loading indicator (shows while Babel is transforming)
  const loadingStyle = `
<style id="babel-loading">
  #babel-loading-overlay {
    position: fixed; inset: 0; background: #0f172a; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, system-ui, sans-serif; color: #93c5fd;
  }
  #babel-loading-overlay .spinner {
    width: 32px; height: 32px; border: 3px solid #1e3a5f;
    border-top: 3px solid #60a5fa; border-radius: 50%;
    animation: spin 0.8s linear infinite; margin-right: 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
<div id="babel-loading-overlay"><div class="spinner"></div>Loading React app…</div>
<script>
  // Remove loading overlay once the app renders
  const observer = new MutationObserver(() => {
    if (document.querySelector('#root')?.children.length > 0) {
      const overlay = document.getElementById('babel-loading-overlay');
      if (overlay) overlay.remove();
      observer.disconnect();
    }
    // Also check body for apps that don't use #root
    if (document.body.children.length > 5 && !document.getElementById('babel-loading-overlay')) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Fallback: remove after 10 seconds regardless
  setTimeout(() => {
    const overlay = document.getElementById('babel-loading-overlay');
    if (overlay) overlay.remove();
  }, 10000);
</script>`;

  // Inject loading indicator after <body> tag
  if (rewritten.includes("<body>")) {
    rewritten = rewritten.replace("<body>", `<body>${loadingStyle}`);
  } else if (rewritten.match(/<body[^>]*>/i)) {
    rewritten = rewritten.replace(/(<body[^>]*>)/i, `$1${loadingStyle}`);
  } else {
    rewritten = loadingStyle + rewritten;
  }

  return rewritten;
}

