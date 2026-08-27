/**
 * StudyBuddy AI Service Worker v30 — Offline Mode
 *
 * v23 — initial AI Tutor upgrade.
 * v24 — 12 graph families.
 * v25 — lenient graph parser.
 * v26 — concept map fix.
 * v27 — generative graphing (16 types) + UNLOCK_ALL_MODELS env var.
 * v28 — freeform SVG nested-<svg> fix.
 * v29 — Phase 30 mega-upgrade (download, latex-styled, hover, 5 new renderers, drag, voice).
 * v30 — real KaTeX rendering for LaTeX math (was just styled spans before,
 *        users could still see raw \frac{...}{...} commands). Also: ASR
 *        endpoint made defensive (tries multiple response fields).
 */

const CACHE_VERSION = "studybuddy-v30-offline";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CONTENT_CACHE = `${CACHE_VERSION}-content`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-32.png",
  "/icon-16.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

// Curriculum API routes that should be cached for offline reading
const OFFLINE_API_PATTERNS = [
  /\/api\/curriculum\/grades/,
  /\/api\/curriculum\/subjects/,
  /\/api\/curriculum\/topics/,
  /\/api\/curriculum\/topic\//,
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET
  if (req.method !== "GET") return;
  // Skip cross-origin
  if (url.origin !== self.location.origin) return;

  // --- Curriculum content (offline-readable) ---
  if (OFFLINE_API_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(
      caches.open(CONTENT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        // Try network first, fall back to cache
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || new Response(
            JSON.stringify({ error: "You're offline. Cached content not available." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
      })
    );
    return;
  }

  // --- Auth/quiz/POST APIs: network-only ---
  if (url.pathname.startsWith("/api/")) {
    return; // let the browser handle it normally
  }

  // --- Images ---
  if (req.destination === "image" || /\.(png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || new Response("", { status: 404 });
        }
      })
    );
    return;
  }

  // --- Navigation (HTML pages) ---
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/")))
    );
    return;
  }

  // --- Static assets (JS/CSS): stale-while-revalidate ---
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
