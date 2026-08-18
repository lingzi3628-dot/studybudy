"use client";

import { useEffect } from "react";

/**
 * Registers the kill-switch service worker.
 *
 * The old sw.js was intercepting requests and causing infinite
 * "Failed to fetch" errors. This new sw.js unregisters itself and
 * clears all caches on activation. We register it in ALL environments
 * (including dev) so the browser replaces the old cached SW ASAP.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Force the new SW to take over immediately
        if (reg.waiting) {
          reg.waiting.postMessage("SKIP_WAITING");
        }
        // Also unregister after a short delay (belt and suspenders)
        setTimeout(() => {
          navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((r) => r.unregister());
          });
        }, 3000);
      } catch {
        // fail silently
      }
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
