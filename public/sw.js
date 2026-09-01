/**
 * StudyBuddy AI Service Worker v65 — Offline Mode + Web Push
 *
 * v23-v59 — prior upgrades.
 * v60 — Phase 51: Higher Education tracks + onboarding upgrade
 *   - New onboarding step 0: pick your track (K-12 / Dev / Data / ML / TVET / Mixed)
 *   - User.track field added to Prisma schema
 *   - HigherEdHome screen for non-K-12 tracks (8-buddy grid + recent projects)
 *   - page.tsx routes Home based on user.track
 *   - AI Tutor default buddy set per track (dev for dev track, etc.)
 *   - Profile: new TrackSwitcher (move K-12 ↔ Higher-Ed anytime)
 *   - Per-track grade/level options (Beginner/Intermediate/Advanced/CDACC/etc.)
 * v61 — Phase 52: Streaming AI tutor (SSE) + real-time group chat + Web Push
 *   - push + notificationclick handlers for Web Push notifications
 * v64 — Phase 55: BackendBuddy (SQL playground, OpenAPI designer,
 *   SSRF-guarded API tester, ER visualizer, Express/FastAPI scaffolds)
 * v65 — Phase 57: MLBuddy 2.0 (synthetic-digits CNN, confusion matrix,
 *   CSV dataset upload, notebook↔playground bridge, model export)
 */

const CACHE_VERSION = "studybuddy-v65-offline";
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

// ============================================================
// Phase 52 — Web Push notifications
// ============================================================

self.addEventListener("push", (event) => {
  let payload = { title: "StudyBuddy AI", body: "You have a new notification", url: "/" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    // Plain-text push — show the raw text
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-32.png",
      tag: payload.tag || undefined,
      renotify: !!payload.tag,
      data: { url: payload.url || "/" },
      vibrate: [80, 40, 80],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus an existing window if one is open; navigate it if needed
      for (const client of clientList) {
        const u = new URL(client.url);
        if (u.pathname === targetUrl || u.href === targetUrl) {
          return client.focus();
        }
      }
      // Otherwise open the target URL in a new window
      return self.clients.openWindow(targetUrl);
    })()
  );
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
