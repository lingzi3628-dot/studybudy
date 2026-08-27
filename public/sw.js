/**
 * StudyBuddy AI Service Worker v34 — Offline Mode
 *
 * v23-v33 — prior upgrades (graphs, voice, KaTeX, free Web Speech API, ER, CSV).
 * v34 — Phase 33 mega-upgrade:
 *   1. Bug fix: AI now forbids markdown tables for database/spreadsheet
 *      requests — only the mathgraph JSON spec is used. Added explicit
 *      "CRITICAL RULES — NO MARKDOWN TABLES WHEN A GRAPH IS REQUESTED"
 *      section to system prompt.
 *   2. E + B: ER diagrams + CSV tables are now EDITABLE inline. Tap the
 *      ✏️ Edit button to add/remove tables, fields, rows, columns, rename
 *      them, toggle primary keys, etc. Edits persist in the conversation
 *      (the attachment's JSON spec is updated in place — no duplicate
 *      graph is created).
 *   3. C: Image input (vision) — tap the 📎 paperclip button in the input
 *      bar to upload a photo of homework, textbook page, or diagram. The
 *      AI uses the GLM-4 vision model to analyze the image and answer.
 *   4. F: Continuous voice conversation mode — tap the mic in the header
 *      to start a back-and-forth conversation. The AI listens for your
 *      question, sends it, then speaks the reply, then listens again
 *      automatically. Tap again to stop. Uses free browser Web Speech API.
 *   5. H: Step-by-step math solver — new "steps" graph type renders each
 *      step as a numbered expandable block. Use when the user says
 *      "solve step by step", "show your work", "explain how to solve".
 *   6. I: Concept map → flashcards — every concept map attachment now
 *      has a "Flashcards" button. Tap it to generate a study set of
 *      flashcards + MCQs from the concept map nodes, then automatically
 *      navigate to the flashcards screen to start studying.
 *
 *   Total graph types: 32. SW cache bumped v33 → v34.
 */

const CACHE_VERSION = "studybuddy-v34-offline";
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
