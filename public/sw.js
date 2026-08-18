/**
 * KILL SWITCH service worker.
 * This file exists ONLY to unregister the old service worker that was
 * causing infinite "Failed to fetch" errors. When the browser fetches
 * this file, it will:
 * 1. Clear all caches
 * 2. Unregister itself
 * 3. Not intercept any future requests
 */
self.addEventListener("install", (event) => {
  // Skip waiting — activate immediately
  self.skipWaiting();
  // Clear all caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Clear all caches again
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => caches.delete(k)))
      ),
      // Unregister this service worker from all scopes
      self.registration.unregister().then(() => {
        console.log("Service worker unregistered — no more interception.");
      }),
      // Claim all clients so they see the new SW immediately
      self.clients.claim(),
    ])
  );
});

// Don't intercept ANY requests — pass through to the network
self.addEventListener("fetch", (event) => {
  // Intentionally empty — don't handle fetch events
  // This prevents any fetch interception
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
