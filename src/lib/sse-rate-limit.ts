/**
 * sse-rate-limit.ts — Phase 53
 *
 * Safety-net rate limiting for SSE endpoints. Phase 52 added two Server-Sent
 * Event routes (/api/tutor/chat/stream, /api/study-groups/[id]/chat/stream)
 * that were NOT covered by rate-limit.ts (which only gates the classic POST
 * path) or by the DB-backed DailyUsage counter. Without this, a runaway
 * client could open hundreds of streams and exhaust:
 *   - the Neon Postgres connection pool (group-chat streams poll the DB
 *     every 2s for up to 50s), and
 *   - self-hosted instance memory (every stream holds a ReadableStream).
 *
 * Two dimensions per user, per endpoint kind:
 *   1. OPEN RATE   — sliding 5-minute window of stream opens
 *   2. CONCURRENCY — streams currently open right now
 *
 * Limits (deliberately generous — this is a runaway-loop brake, not a
 * paywall; the DB-backed daily token/caps remain the primary gate):
 *   tutor: 30 opens / 5 min, max 5 concurrent
 *   group: 60 opens / 5 min, max 3 concurrent
 *     (the group stream self-closes every ~50s and EventSource reconnects
 *      immediately, so ONE open tab generates ~6 opens / 5 min — 60 allows
 *      ~10 simultaneously-open group chats per user)
 *
 * Per-instance (NOT Redis), same trade-off as rate-limit.ts: on serverless
 * each warm instance counts independently, which is fine for a safety net.
 *
 * Usage in a stream route:
 *
 *   const gate = checkSseOpen(user.id, "tutor");
 *   if (!gate.allowed) return new Response(...429...);
 *   const stream = new ReadableStream({
 *     async start(controller) { ... }
 *     cancel() { releaseSse(user.id, "tutor"); },   // client disconnected
 *   });
 *   // IMPORTANT: also releaseSse(...) in the normal-end finally/cleanup path.
 */

type Kind = "tutor" | "group";

type WindowEntry = { timestamps: number[] };

const WINDOW_MS = 5 * 60 * 1000;

const LIMITS: Record<Kind, { maxOpens: number; maxConcurrent: number }> = {
  tutor: { maxOpens: 30, maxConcurrent: 5 },
  group: { maxOpens: 60, maxConcurrent: 3 },
};

/** userId:kind → sliding window of open timestamps */
const openWindows = new Map<string, WindowEntry>();

/** userId:kind → currently-open stream count */
const concurrent = new Map<string, number>();

/** Lazy pruning counter — we don't want a setInterval on serverless. */
let checkCounter = 0;

function key(userId: string, kind: Kind): string {
  return `${userId}:${kind}`;
}

function pruneWindows(now: number): void {
  // Cheap periodic sweep: drop windows with no recent opens so the map
  // can't grow unbounded across many users.
  for (const [k, entry] of openWindows) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
    if (entry.timestamps.length === 0) openWindows.delete(k);
  }
  // Also drop concurrent counters that leaked to 0.
  for (const [k, v] of concurrent) {
    if (v <= 0) concurrent.delete(k);
  }
}

export type SseGateResult = {
  allowed: boolean;
  /** Suggested client retry delay in seconds (only meaningful when blocked). */
  retryAfterSec: number;
  /** Which dimension blocked (for logging). */
  reason: "ok" | "open_rate" | "concurrency";
  remainingOpens: number;
};

/**
 * Count a stream open for this user + endpoint kind.
 * Call BEFORE creating the ReadableStream; if not allowed, respond 429.
 */
export function checkSseOpen(userId: string, kind: Kind): SseGateResult {
  const now = Date.now();
  checkCounter++;
  if (checkCounter % 50 === 0) pruneWindows(now);

  const limits = LIMITS[kind];
  const k = key(userId, kind);

  // 1) Concurrency first — the more dangerous dimension.
  const current = concurrent.get(k) ?? 0;
  if (current >= limits.maxConcurrent) {
    return { allowed: false, retryAfterSec: 30, reason: "concurrency", remainingOpens: 0 };
  }

  // 2) Sliding-window open rate.
  let entry = openWindows.get(k);
  if (!entry) {
    entry = { timestamps: [] };
    openWindows.set(k, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
  if (entry.timestamps.length >= limits.maxOpens) {
    const oldest = entry.timestamps[0];
    const retryAfterSec = Math.max(5, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec, reason: "open_rate", remainingOpens: 0 };
  }

  // Allowed — record the open and bump concurrency.
  entry.timestamps.push(now);
  concurrent.set(k, current + 1);

  return {
    allowed: true,
    retryAfterSec: 0,
    reason: "ok",
    remainingOpens: limits.maxOpens - entry.timestamps.length,
  };
}

/**
 * Release one concurrency slot when a stream ends — whether it ended
 * normally (self-close / done) or the client disconnected (cancel).
 * Call this in BOTH the stream completion path and cancel().
 */
export function releaseSse(userId: string, kind: Kind): void {
  const k = key(userId, kind);
  const current = concurrent.get(k) ?? 0;
  if (current <= 1) concurrent.delete(k);
  else concurrent.set(k, current - 1);
}

/** Test/observability helper — current counter snapshot for one user+kind. */
export function sseSnapshot(userId: string, kind: Kind): { open: number; concurrent: number } {
  const k = key(userId, kind);
  const now = Date.now();
  const entry = openWindows.get(k);
  return {
    open: entry ? entry.timestamps.filter((t) => now - t < WINDOW_MS).length : 0,
    concurrent: concurrent.get(k) ?? 0,
  };
}
