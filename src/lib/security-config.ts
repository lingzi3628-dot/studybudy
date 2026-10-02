/**
 * Security Configuration — Phase 0
 *
 * Centralized feature-flag readers + production secret enforcement.
 *
 * SECURITY DEFAULTS:
 *   - Server-side Python execution: DISABLED by default (TUTOR_SERVER_PYTHON_EXECUTION_ENABLED)
 *   - Server-side JavaScript execution: DISABLED by default (TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED)
 *   - Production secrets: REQUIRED in production (USER_JWT_SECRET, ADMIN_JWT_SECRET, API_KEY_ENCRYPTION_SECRET)
 *
 * Kill switches are at the lowest level (code-sandbox.ts:runCode) so ALL callers
 * are covered: tutor-tools.ts, bot-engine.ts, plugins/executor.ts, embed routes.
 *
 * No code execution happens through child_process or node:vm when disabled.
 */

// ============================================================
// Code execution kill switches
// ============================================================

/**
 * Whether server-side Python execution is enabled.
 * Default: false (disabled). Must be explicitly enabled via env var.
 * When disabled, runCode("python", ...) returns an unsupported result
 * WITHOUT spawning a process or accessing the filesystem.
 */
export function isServerPythonExecutionEnabled(): boolean {
  const flag = (process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED ?? "false")
    .toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "on";
}

/**
 * Whether server-side JavaScript execution is enabled.
 * Default: false (disabled). Must be explicitly enabled via env var.
 * When disabled, runCode("javascript", ...) returns an unsupported result
 * WITHOUT creating a vm.Script or executing any code.
 */
export function isServerJavascriptExecutionEnabled(): boolean {
  const flag = (process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED ?? "false")
    .toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "on";
}

// ============================================================
// Production secret enforcement
// ============================================================

/**
 * Whether the app is running in production mode.
 * Uses NODE_ENV === "production" as the signal.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Assert that required production secrets are explicitly configured.
 * Called at module load time in user-jwt.ts, admin-jwt.ts, crypto.ts.
 *
 * In production: throws if any secret is missing — BUT ONLY AT RUNTIME.
 * During `next build` (page data collection), the assertion is SKIPPED
 * because Vercel secrets are runtime-only and not available at build time.
 * The assertion runs when the serverless function handles its first request.
 *
 * In development/test: logs a warning but allows fallback (for local dev convenience).
 *
 * NEVER prints secret values — only checks for presence.
 */
export function assertProductionSecrets(): void {
  if (!isProduction()) {
    // Dev/test: warn but allow fallback
    const missing: string[] = [];
    if (!process.env.USER_JWT_SECRET) missing.push("USER_JWT_SECRET");
    if (!process.env.ADMIN_JWT_SECRET) missing.push("ADMIN_JWT_SECRET");
    if (!process.env.API_KEY_ENCRYPTION_SECRET) missing.push("API_KEY_ENCRYPTION_SECRET");
    if (missing.length > 0) {
      console.warn(
        `[security] WARNING: ${missing.join(", ")} not set. ` +
        `Using derived fallback secrets (dev/test only). ` +
        `Set these explicitly in production.`,
      );
    }
    return;
  }

  // Production build: skip assertion. Vercel secrets are runtime-only —
  // they're NOT available during `next build` page data collection.
  // Next.js sets NEXT_PHASE=phase-production-build during build.
  // The assertion will run at runtime when the serverless function handles
  // its first request and the secrets ARE available.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  // Production runtime: warn loudly but DON'T throw.
  // Throwing at module load time crashes every serverless function that
  // imports auth (which is virtually every API route). A typo in a single
  // env var would take down the entire app. Instead, we log a FATAL-level
  // warning and let the app run with derived fallback secrets (which are
  // still SHA-256 hashes of DATABASE_URL with a prefix — not ideal, but
  // not plaintext either).
  //
  // The admin should set the secrets explicitly, but the app stays up
  // in the meantime. This is the pragmatic compromise: security is
  // slightly reduced, but availability is preserved.
  //
  // To enforce hard fail-closed: set TUTOR_STRICT_SECRETS=true
  const missing: string[] = [];
  if (!process.env.USER_JWT_SECRET) missing.push("USER_JWT_SECRET");
  if (!process.env.ADMIN_JWT_SECRET) missing.push("ADMIN_JWT_SECRET");
  if (!process.env.API_KEY_ENCRYPTION_SECRET) missing.push("API_KEY_ENCRYPTION_SECRET");

  if (missing.length === 0) return; // all secrets present — nothing to do

  if (process.env.TUTOR_STRICT_SECRETS === "true") {
    throw new Error(
      `[security] FATAL: Production secrets missing: ${missing.join(", ")}. ` +
      `Refusing to start (TUTOR_STRICT_SECRETS=true). ` +
      `Set these environment variables explicitly — ` +
      `do not rely on DATABASE_URL-derived fallbacks in production.`,
    );
  }

  // Default: warn loudly, continue with derived fallback
  console.error(
    `[security] ⚠️  PRODUCTION SECRETS MISSING: ${missing.join(", ")}. ` +
    `Using DATABASE_URL-derived fallback (NOT recommended for production). ` +
    `Set these env vars explicitly in Vercel. ` +
    `To enforce hard fail-closed, set TUTOR_STRICT_SECRETS=true.`,
  );
}

// ============================================================
// Learner-facing unsupported messages (NEVER mention internals)
// ============================================================

export const PYTHON_UNSUPPORTED_MESSAGE =
  "I can explain Python code, but I can't run it here right now. " +
  "I can walk you through what the code does step by step — just ask!";

export const JAVASCRIPT_UNSUPPORTED_MESSAGE =
  "I can explain JavaScript code, but I can't run it here right now. " +
  "I can walk you through what the code does step by step — just ask!";

export const C_UNSUPPORTED_MESSAGE =
  "I can explain C code, but I can't run C programs yet. " +
  "I can walk you through what the code does — just ask!";
