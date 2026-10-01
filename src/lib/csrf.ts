/**
 * CSRF protection — Phase 90.2
 *
 * Implements double-submit cookie pattern for CSRF protection.
 * State-changing routes (POST/PUT/PATCH/DELETE) should call verifyCsrf().
 *
 * How it works:
 * 1. On login, a CSRF token is set as a cookie (non-httpOnly so JS can read it)
 * 2. Client sends the token in the X-CSRF-Token header on state-changing requests
 * 3. Server compares header vs cookie — if they match, the request is legitimate
 *
 * This prevents cross-site request forgery because an attacker's site can:
 * - Send cookies (automatic) ✓
 * - Read cookies (non-httpOnly) ✗ (SameSite=Lax blocks this)
 * - Set custom headers ✗ (CORS preflight blocks this)
 *
 * Usage in API routes:
 *   import { verifyCsrf } from "@/lib/csrf";
 *   export async function POST(req: NextRequest) {
 *     const csrfError = verifyCsrf(req);
 *     if (csrfError) return csrfError;
 *     // ... route logic
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

const CSRF_COOKIE_NAME = "studybuddy_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a new CSRF token (32 random bytes as hex)
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Verify the CSRF token on state-changing requests.
 * Returns null if valid, or a NextResponse(403) if invalid.
 *
 * Only checks POST/PUT/PATCH/DELETE — GET is always allowed.
 */
export function verifyCsrf(req: NextRequest): NextResponse | null {
  // Skip for GET/HEAD/OPTIONS
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = req.headers.get(CSRF_HEADER_NAME);

  // If no CSRF cookie is set yet (user hasn't logged in since Phase 90.2),
  // allow the request through — backward compat
  if (!cookieToken) {
    return null;
  }

  // If cookie exists but header doesn't match → CSRF attack
  if (!headerToken || headerToken !== cookieToken) {
    return NextResponse.json(
      { error: "CSRF token mismatch. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Get the CSRF cookie name (for setting on login)
 */
export function getCsrfCookieName(): string {
  return CSRF_COOKIE_NAME;
}

/**
 * Get the CSRF header name (for client to send)
 */
export function getCsrfHeaderName(): string {
  return CSRF_HEADER_NAME;
}
