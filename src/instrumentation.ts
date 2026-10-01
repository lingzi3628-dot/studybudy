/**
 * Instrumentation hook for Sentry (Phase 89.1)
 * This runs once on server startup.
 * If SENTRY_DSN is not set, Sentry runs in no-op mode (no errors sent).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
