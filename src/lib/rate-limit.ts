/**
 * Simple in-memory rate limiter for AI calls.
 *
 * Phase 21 — raised limits so this never blocks legitimate daily use.
 * The DB-backed DailyUsage counter (in monetization.ts FREE_DAILY_LIMITS)
 * is now the primary gate; this in-memory limiter is just a safety net
 * against runaway loops within a single server instance.
 *
 * - Free plan: 200 calls/day per user  (was 20 — too restrictive)
 * - Pro plan:  2000 calls/day per user (was 100)
 *
 * Resets at midnight UTC. Per-instance (NOT Redis) — on serverless cold
 * starts the in-memory count is reset, which is fine because the DB-backed
 * DailyUsage counter persists across instances.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const LIMITS = {
  free: 200,
  pro: 2000,
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
