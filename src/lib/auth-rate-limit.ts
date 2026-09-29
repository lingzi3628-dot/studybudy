/**
 * Auth rate limiter — Phase 80
 *
 * In-memory rate limiting for auth endpoints (login, signup, forgot-password).
 * Prevents brute-force attacks by limiting attempts per IP address.
 *
 * Limits:
 *   - login: 10 attempts per 5 minutes per IP
 *   - signup: 5 attempts per 10 minutes per IP
 *   - forgot-password: 3 attempts per 15 minutes per IP
 *   - reset-password: 5 attempts per 10 minutes per IP
 *
 * Note: This is in-memory and resets on server restart. For production at
 * scale, use Redis or Vercel KV. For a single-server app, this is sufficient.
 */

type RateBucket = {
  count: number;
  firstAt: number;
};

const BUCKETS = new Map<string, RateBucket>();
const WINDOW_MS = 5 * 60 * 1000; // default 5 min

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  login: { max: 10, windowMs: 5 * 60 * 1000 },
  signup: { max: 5, windowMs: 10 * 60 * 1000 },
  "forgot-password": { max: 3, windowMs: 15 * 60 * 1000 },
  "reset-password": { max: 5, windowMs: 10 * 60 * 1000 },
  "send-otp": { max: 5, windowMs: 10 * 60 * 1000 },
  "verify-otp": { max: 10, windowMs: 5 * 60 * 1000 },
};

export function checkAuthRateLimit(
  ip: string,
  action: string,
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const config = LIMITS[action] ?? { max: 10, windowMs: WINDOW_MS };
  const key = `${action}:${ip}`;
  const now = Date.now();

  const bucket = BUCKETS.get(key);
  if (!bucket || now - bucket.firstAt > config.windowMs) {
    BUCKETS.set(key, { count: 1, firstAt: now });
    return { allowed: true, remaining: config.max - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= config.max) {
    const retryAfterSec = Math.ceil((bucket.firstAt + config.windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.count += 1;
  return { allowed: true, remaining: config.max - bucket.count, retryAfterSec: 0 };
}

/** Extract the client IP from a request. */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
