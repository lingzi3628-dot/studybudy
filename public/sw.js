/**
 * StudyBuddy AI Service Worker
 *
 * Phase 19: Proper PWA caching for TWA + offline support.
 * - App shell: cache-first (instant load from cache)
 * - API calls: network-first (always get fresh data, fallback to cache)
 * - Images/icons: cache-first
 * - Navigation: network-first, fallback to cached index.html
 */

const CACHE_VERSION = "studybuddy-v19";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-32.png",
  "/icon-16.png",
];

// Install — cache app shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

// Activate — clear old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — routing strategy
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests
  if (req.method !== "GET") return;

  // Skip cross-origin requests (analytics, external APIs)
  if (url.origin !== self.location.origin) return;

  // API calls → network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache successful API responses for offline fallback
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Static assets (icons, images) → cache-first
  if (req.destination === "image" || url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        return res;
      }))
    );
    return;
  }

  // Navigation (HTML pages) → network-first, fallback to cached
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Everything else → cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
