/**
 * StudyBuddy AI Service Worker v36 — Offline Mode
 *
 * v23-v35 — prior upgrades.
 * v36 — Phase 35: backend + UI for AI model management:
 *   1. API key rotation (multiple keys per provider, auto-advance on 429)
 *   2. API fallback chains (priority order + budget-aware skipping)
 *   3. Daily budget caps per provider (auto-skip when reached)
 *   4. Auto health checks (ApiHealthCheck model, admin can trigger + view)
 *   5. Usage analytics (admin dashboard with totals + per-provider breakdown
 *      + mini sparkline of calls per day + 24h/7d/30d range picker)
 *   6. Model comparison endpoint (parallel calls to multiple Study Buddies)
 *   + Health badges on visual API nodes (🟢/🟡/🔴/⚪)
 *   + Per-conversation model switcher (dropdown in AI Tutor header)
 */

const CACHE_VERSION = "studybuddy-v46-offline";
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
