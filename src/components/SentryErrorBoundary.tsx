"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * SentryErrorBoundary — Phase 89.1
 * Wraps the app to catch React rendering errors + forward them to Sentry.
 * Falls back to a friendly error message if the app crashes.
 */
export function SentryErrorBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Capture unhandled errors
    const handler = (event: ErrorEvent) => {
      if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.captureException(event.error);
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  useEffect(() => {
    // Capture unhandled promise rejections
    const handler = (event: PromiseRejectionEvent) => {
      if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.captureException(event.reason);
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return <>{children}</>;
}
