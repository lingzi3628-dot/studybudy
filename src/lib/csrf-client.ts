/**
 * Client-side CSRF helper — Phase 90.2
 *
 * Reads the CSRF token from the cookie and attaches it to fetch requests.
 *
 * Usage in client components:
 *   import { getCsrfHeaders } from "@/lib/csrf-client";
 *   fetch("/api/something", {
 *     method: "POST",
 *     headers: { ...getCsrfHeaders(), "Content-Type": "application/json" },
 *     body: JSON.stringify(data),
 *   });
 *
 * Or for FormData (which already sets Content-Type):
 *   fetch("/api/upload", {
 *     method: "POST",
 *     headers: getCsrfHeaders(),
 *     body: formData,
 *   });
 */

const CSRF_COOKIE_NAME = "studybuddy_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Reads the CSRF token from the cookie.
 * Returns null if not set (e.g. user hasn't logged in since Phase 90.2).
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Returns a headers object with the CSRF token.
 * Merge with your existing headers:
 *   headers: { ...getCsrfHeaders(), "Content-Type": "application/json" }
 */
export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  if (!token) return {};
  return { [CSRF_HEADER_NAME]: token };
}
