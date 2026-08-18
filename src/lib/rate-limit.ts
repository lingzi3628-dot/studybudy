/**
 * Simple in-memory rate limiter for AI calls.
 *
 * - Free plan: 20 calls/day per user
 * - Pro plan:  100 calls/day per user
 *
 * Resets at midnight UTC. This is intentionally simple and per-instance;
 * for production you'd want Redis or Upstash.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const LIMITS = {
  free: 20,
  pro: 100,
} as const;

function today(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime();
}

export function checkRateLimit(userId: string, plan: "free" | "pro"): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
  const limit = LIMITS[plan] ?? LIMITS.free;
  const now = Date.now();
  const key = `${userId}:${new Date().toISOString().slice(0, 10)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: today() };
    buckets.set(key, bucket);
  }
  const allowed = bucket.count < limit;
  if (allowed) bucket.count += 1;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    limit,
  };
}

/** Force-decrement (when the call failed before consuming AI budget). */
export function refundRateLimit(userId: string): void {
  const key = `${userId}:${new Date().toISOString().slice(0, 10)}`;
  const bucket = buckets.get(key);
  if (bucket) bucket.count = Math.max(0, bucket.count - 1);
}
