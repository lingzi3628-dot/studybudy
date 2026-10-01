import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // NOTE: Set NEXT_PUBLIC_SENTRY_DSN in your .env to enable Sentry.
  // If not set, Sentry runs in no-op mode (no errors sent).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV || "development",
  // Only send errors in production
  enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Ignore common noise errors
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Network request failed",
    "Failed to fetch",
  ],
});
