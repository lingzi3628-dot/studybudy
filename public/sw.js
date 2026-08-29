/**
 * StudyBuddy AI Service Worker v58 — Offline Mode
 *
 * v23-v57 — prior upgrades.
 * v58 — Phase 49: DataBuddy — in-browser Jupyter notebook
 *   - NotebookKernel: persistent Pyodide kernel (variables survive across cells)
 *   - NotebookScreen: cell-based UI (code + markdown cells)
 *   - Pre-loaded datasets: iris, titanic, tips, planets, flights, mpg
 *   - Matplotlib figure capture (Agg → base64 PNG inline)
 *   - DataFrame table rendering
 *   - Save as notebook.ipynb JSON in a data Project
 *   - "New Notebook" button on ProjectsScreen
 */

const CACHE_VERSION = "studybuddy-v58-offline";
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
      (async () => {
        try {
          const res = await fetch(req);
          // Clone FIRST, before the body is consumed by the browser
          const clone = res.clone();
          // Cache in the background — don't await, don't block
          caches.open(SHELL_CACHE)
            .then((cache) => cache.put(req, clone))
            .catch(() => {});
          return res;
        } catch {
          return caches.match(req).then((c) => c || caches.match("/"));
        }
      })()
    );
    return;
  }

  // --- Static assets (JS/CSS): stale-while-revalidate ---
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(req);
      try {
        const res = await fetch(req);
        if (res.ok) {
          const clone = res.clone();
          cache.put(req, clone).catch(() => {});
        }
        return res;
      } catch {
        return cached || caches.match("/");
      }
    })()
  );
});
