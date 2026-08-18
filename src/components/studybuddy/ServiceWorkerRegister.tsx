/**
 * Service Worker Register — DISABLED.
 *
 * The service worker was causing infinite "Failed to fetch" errors
 * on Vercel because it was intercepting requests to Clerk's CDN
 * and other external resources that were no longer available.
 *
 * PWA installability still works via manifest.json — the SW is
 * optional and was causing more harm than good in production.
 */
export function ServiceWorkerRegister() {
  return null;
}
