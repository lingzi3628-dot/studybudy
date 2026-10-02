/**
 * Turn Manager — Phase 1
 *
 * Provides:
 *   - Generation of turn IDs, request IDs, and idempotency keys
 *   - Deduplication of retried requests via IdempotencyRecord table
 *   - "Is this turn still active?" check before persistence
 *   - Structured logging context with turn/request IDs
 *
 * DESIGN:
 *   - The CLIENT generates an idempotency key (UUID) per user action.
 *     If the client retries (network blip, timeout), it sends the SAME key.
 *   - The SERVER stores the key in IdempotencyRecord with status "pending".
 *     On completion, it updates to "completed" with the cached response.
 *   - On retry, the server finds the existing record and returns the cached
 *     response WITHOUT re-executing (no duplicate token deduction, no
 *     duplicate message write).
 *
 * ATOMICITY:
 *   - The dedup check uses Prisma's unique constraint on `key`. A race
 *     between two concurrent requests with the same key is resolved by
 *     the database: one insert succeeds, the other fails with P2002.
 *     The loser reads the winner's record.
 *
 * NOT WIRED INTO ALL ROUTES YET — Phase 1 wires it into:
 *   - /api/tutor/chat (non-streaming)
 *   - /api/tutor/chat/stream (streaming — adds turnId to SSE events)
 *   - checkAndDeductTokens (atomic conditional update)
 *   - refundTokens (idempotent via idempotency key)
 * Future phases can extend to other routes.
 */

import { db } from "../db";
import { logger } from "../logger";

// ============================================================
// Types
// ============================================================

export type TurnContext = {
  /** Client-supplied idempotency key (UUID). Same key = same result. */
  idempotencyKey: string;
  /** Server-generated request ID (unique per HTTP request, even retries). */
  requestId: string;
  /** Server-generated turn ID (one per user action — same across retries). */
  turnId: string;
  /** The user ID this turn belongs to. */
  userId: string;
};

export type IdempotencyResult<T> =
  | { status: "first"; record: null; previousResult: null }
  | { status: "replay"; record: any; previousResult: T | null }
  | { status: "pending"; record: any; previousResult: null };

// ============================================================
// ID generation
// ============================================================

/**
 * Generate a new UUID v4 (using crypto.randomUUID when available).
 * Falls back to a manual implementation for older runtimes.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback — manual UUID v4
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Last resort — Math.random (less secure)
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/**
 * Generate a turn ID with a recognizable prefix for log scanning.
 * Format: "turn_<uuid>"
 */
export function generateTurnId(): string {
  return `turn_${generateId()}`;
}

/**
 * Generate a request ID with a recognizable prefix.
 * Format: "req_<uuid>"
 */
export function generateRequestId(): string {
  return `req_${generateId()}`;
}

/**
 * Validate that a string looks like a valid idempotency key.
 * Accepts UUID v4 format (with or without hyphens) or any string 32-128 chars.
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.length < 8 || key.length > 128) return false;
  // Allow UUID format, alphanumeric, dashes, underscores
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

// ============================================================
// Idempotency record management
// ============================================================

const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Try to claim an idempotency key for this user + operation.
 *
 * Returns:
 *   - "first" — this is the first request with this key; proceed with execution
 *   - "replay" — a completed record exists; return its cached response
 *   - "pending" — another request with this key is in-flight; reject (client should retry later)
 *
 * Race-safety: uses Prisma's unique constraint on `key`. If two concurrent
 * requests try to insert the same key, one succeeds and the other gets P2002.
 * The loser reads the winner's record.
 */
export async function claimIdempotency<T = any>(opts: {
  key: string;
  userId: string;
  operation: string;
}): Promise<IdempotencyResult<T>> {
  const { key, userId, operation } = opts;

  // First, check if a record already exists (fast path for replays)
  const existing = await db.idempotencyRecord.findUnique({
    where: { key },
  }).catch(() => null);

  if (existing) {
    // Check if expired — if so, treat as first (delete old record)
    if (existing.expiresAt < new Date()) {
      await db.idempotencyRecord.delete({ where: { id: existing.id } }).catch(() => {});
    } else if (existing.status === "completed") {
      return {
        status: "replay",
        record: existing,
        previousResult: (existing.response as T) ?? null,
      };
    } else if (existing.status === "pending") {
      // Another request is in-flight with this key
      return { status: "pending", record: existing, previousResult: null };
    } else if (existing.status === "failed") {
      // Previous attempt failed — allow retry by deleting + re-claiming
      await db.idempotencyRecord.delete({ where: { id: existing.id } }).catch(() => {});
    }
  }

  // Try to insert a new pending record
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);
  try {
    await db.idempotencyRecord.create({
      data: {
        key,
        userId,
        operation,
        status: "pending",
        expiresAt,
      },
    });
    return { status: "first", record: null, previousResult: null };
  } catch (e: any) {
    // P2002 = unique constraint violation — another request won the race
    if (e?.code === "P2002") {
      // Re-read the winner's record
      const winner = await db.idempotencyRecord.findUnique({ where: { key } }).catch(() => null);
      if (winner) {
        if (winner.status === "completed") {
          return {
            status: "replay",
            record: winner,
            previousResult: (winner.response as T) ?? null,
          };
        }
        return { status: "pending", record: winner, previousResult: null };
      }
    }
    // Other error — log + treat as first (best-effort, not perfectly idempotent)
    logger.warn("claimIdempotency insert failed", {
      key,
      operation,
      error: e?.message ?? String(e),
    });
    return { status: "first", record: null, previousResult: null };
  }
}

/**
 * Mark an idempotency record as completed with the cached response.
 */
export async function completeIdempotency(opts: {
  key: string;
  response: unknown;
}): Promise<void> {
  try {
    await db.idempotencyRecord.update({
      where: { key: opts.key },
      data: {
        status: "completed",
        response: opts.response as any,
        completedAt: new Date(),
      },
    });
  } catch (e: any) {
    // Non-fatal — the operation already succeeded, we just can't cache the result
    logger.warn("completeIdempotency failed", {
      key: opts.key,
      error: e?.message ?? String(e),
    });
  }
}

/**
 * Mark an idempotency record as failed (so the client can retry with the same key).
 */
export async function failIdempotency(opts: {
  key: string;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.idempotencyRecord.update({
      where: { key: opts.key },
      data: {
        status: "failed",
        errorCode: opts.errorCode ?? null,
        errorMessage: opts.errorMessage?.slice(0, 500) ?? null,
        completedAt: new Date(),
      },
    });
  } catch (e: any) {
    logger.warn("failIdempotency failed", {
      key: opts.key,
      error: e?.message ?? String(e),
    });
  }
}

/**
 * Delete the idempotency record (used when a "first" request fails before
 * completion, allowing the client to retry with the same key).
 */
export async function releaseIdempotency(opts: { key: string }): Promise<void> {
  try {
    await db.idempotencyRecord.delete({ where: { key: opts.key } });
  } catch {
    // Ignore — record may already be deleted or expired
  }
}

// ============================================================
// Turn context helper
// ============================================================

/**
 * Build a TurnContext from a request body.
 *
 * The client MAY send `idempotencyKey` in the body. If absent, the server
 * generates one (but then retries can't be deduped — the client should
 * always send a key for idempotent operations).
 *
 * The server always generates `requestId` (unique per HTTP request) and
 * `turnId` (stable across retries — derived from the idempotency key).
 */
export function buildTurnContext(opts: {
  userId: string;
  clientKey?: string | null;
}): TurnContext {
  const idempotencyKey = opts.clientKey && isValidIdempotencyKey(opts.clientKey)
    ? opts.clientKey
    : generateId(); // generated key = no dedup (but still useful for logging)

  // turnId is derived from the idempotency key so retries share the same turnId
  const turnId = `turn_${idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`;
  const requestId = generateRequestId();

  return { idempotencyKey, requestId, turnId, userId: opts.userId };
}

// ============================================================
// Cleanup (for cron or lazy use)
// ============================================================

/**
 * Delete expired idempotency records. Safe to call from a cron route.
 * Returns the count of deleted records.
 */
export async function cleanupExpiredIdempotencyRecords(): Promise<number> {
  try {
    const result = await db.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  } catch (e: any) {
    logger.warn("cleanupExpiredIdempotencyRecords failed", {
      error: e?.message ?? String(e),
    });
    return 0;
  }
}
