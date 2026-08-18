"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in the browser.
 * Skips registration in dev mode (NODE_ENV === "development") to avoid
 * caching issues during development.
 *
 * Mounted once in RootLayout so it runs on every page.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Successful registration — no console output in production
      } catch {
        // Registration failed — fail silently (PWA is non-critical)
      }
    };

    // Register after page load so it doesn't block first paint
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
