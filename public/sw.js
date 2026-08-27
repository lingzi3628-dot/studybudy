/**
 * StudyBuddy AI Service Worker v27 — Offline Mode
 *
 * Caching strategy:
 * - App shell: cache-first (instant load)
 * - Curriculum topics + lessons: cache-first (works offline after first visit)
 * - API calls (auth, quiz submit): network-only (no caching)
 * - Images/icons: cache-first
 * - Navigation: network-first, fallback to cached index.html
 * - Static assets (JS/CSS): stale-while-revalidate
 *
 * v23 — bumped cache version to invalidate stale JS bundles (AI Tutor upgrade,
 *       exam upload conversion, inline exam reader).
 * v24 — bumped again for the upgraded GraphRenderers.tsx (12 graph families).
 * v25 — bumped again for the lenient graph parser (AI was using ```text instead
 *       of ```mathgraph so the JSON spec was being ignored; now we parse ANY
 *       code block language tag AND inline JSON-looking text in the reply).
 * v26 — bumped again for the concept map fix (3 root causes fixed).
 * v27 — bumped again for the generative graphing upgrade: 4 new renderers
 *       (slopefield, stemleaf, frequency_polygon, freeform). The freeform
 *       renderer accepts raw SVG markup from the AI, so the AI can now draw
 *       ANYTHING — 3D solids, contour maps, phase portraits, knot diagrams,
 *       tessellations, Argand diagrams, compass constructions, etc. — without
 *       us having to add new renderers. Also: UNLOCK_ALL_MODELS env var
 *       unlocks all premium Study Buddies for testing.
 */

const CACHE_VERSION = "studybuddy-v27-offline";
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
