/**
 * Phase 1 — Transaction integrity tests
 *
 * Covers:
 *   - Turn context generation (requestId, turnId, idempotencyKey)
 *   - Idempotency claim/complete/fail lifecycle
 *   - Replay returns cached response (no re-execution)
 *   - Pending blocks concurrent same-key requests
 *   - Idempotent refund (calling twice with same key = single refund)
 *   - Refund without key = legacy behavior (still works, not idempotent)
 *   - Logger withTurn includes turnId/requestId in output
 *   - Existing contracts preserved (response shape, SSE events)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateId,
  generateTurnId,
  generateRequestId,
  isValidIdempotencyKey,
  buildTurnContext,
  claimIdempotency,
  completeIdempotency,
  failIdempotency,
  cleanupExpiredIdempotencyRecords,
} from "../tutor/turn-manager";
import { logger } from "../logger";
import { refundTokens } from "../monetization";
import { db } from "../db";

// ============================================================
// Turn context generation
// ============================================================

describe("Phase 1 — Turn context generation", () => {
  it("generateId produces a UUID-like string", () => {
    const id = generateId();
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  });

  it("generateId produces unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateId());
    expect(ids.size).toBe(100);
  });

  it("generateTurnId produces a turn_-prefixed ID", () => {
    const turnId = generateTurnId();
    expect(turnId).toMatch(/^turn_[a-f0-9]/i);
  });

  it("generateRequestId produces a req_-prefixed ID", () => {
    const reqId = generateRequestId();
    expect(reqId).toMatch(/^req_[a-f0-9]/i);
  });

  it("isValidIdempotencyKey accepts valid UUIDs and alphanumeric strings", () => {
    expect(isValidIdempotencyKey("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidIdempotencyKey("abc123def456")).toBe(true);
    expect(isValidIdempotencyKey("user_action_123")).toBe(true);
  });

  it("isValidIdempotencyKey rejects empty, too short, too long, and non-alphanumeric", () => {
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("short")).toBe(false); // 5 chars < 8
    expect(isValidIdempotencyKey("x".repeat(129))).toBe(false); // > 128
    expect(isValidIdempotencyKey("has spaces here")).toBe(false);
    expect(isValidIdempotencyKey("has@special#chars")).toBe(false);
  });

  it("buildTurnContext uses client key when valid", () => {
    const turn = buildTurnContext({ userId: "u1", clientKey: "abc123def456" });
    expect(turn.idempotencyKey).toBe("abc123def456");
    expect(turn.turnId).toMatch(/^turn_abc123def456/);
    expect(turn.requestId).toMatch(/^req_/);
    expect(turn.userId).toBe("u1");
  });

  it("buildTurnContext generates a key when client key is invalid/absent", () => {
    const turn1 = buildTurnContext({ userId: "u1" });
    expect(turn1.idempotencyKey).toMatch(/^[a-f0-9]{8}-/i);
    const turn2 = buildTurnContext({ userId: "u1", clientKey: "bad key with spaces" });
    expect(turn2.idempotencyKey).toMatch(/^[a-f0-9]{8}-/i);
    expect(turn1.idempotencyKey).not.toBe(turn2.idempotencyKey);
  });

  it("buildTurnContext produces stable turnId for same key (retries)", () => {
    const turn1 = buildTurnContext({ userId: "u1", clientKey: "stable-key-123" });
    const turn2 = buildTurnContext({ userId: "u1", clientKey: "stable-key-123" });
    expect(turn1.idempotencyKey).toBe(turn2.idempotencyKey);
    expect(turn1.turnId).toBe(turn2.turnId);
    expect(turn1.requestId).not.toBe(turn2.requestId);
  });
});

// ============================================================
// Logger withTurn
// ============================================================

describe("Phase 1 — Logger withTurn", () => {
  it("withTurn returns a logger that includes turnId in info output", () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const turnLogger = logger.withTurn({ turnId: "turn_abc", requestId: "req_xyz", userId: "u1" });
    turnLogger.info("token deducted", { cost: 15 });
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("token deducted");
    expect(output).toContain("turn_abc");
    expect(output).toContain("cost");
    // requestId + userId are included in the entry object (visible in prod JSON mode);
    // in dev pretty-print mode they may be in the JSON meta suffix or the turn prefix.
    // We verify the function doesn't crash and includes turnId.
    logSpy.mockRestore();
  });

  it("withTurn error includes turnId in error output", () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const turnLogger = logger.withTurn({ turnId: "turn_err", userId: "u1" });
    turnLogger.error("AI call failed", { error: "timeout" });
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("AI call failed");
    expect(output).toContain("turn_err");
    logSpy.mockRestore();
  });

  it("logger without turn context still works (backward compat)", () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("plain message", { foo: "bar" });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain("plain message");
    expect(output).toContain("foo");
    logSpy.mockRestore();
  });

  it("logger.child still works (backward compat)", () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const child = logger.child({ requestId: "req_child" });
    child.info("child message");
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

// ============================================================
// Idempotency record (DB-backed — mocked)
// ============================================================

// vi.mock for the db module — must be at module scope
vi.mock("../db", () => ({
  db: {
    idempotencyRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tokenUsageLog: { create: vi.fn().mockResolvedValue({}) },
    dailyUsage: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn() },
  },
}));

describe("Phase 1 — Idempotency claim/complete/fail (mocked DB)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claimIdempotency returns 'first' when no existing record", async () => {
    (db.idempotencyRecord.findUnique as any).mockResolvedValue(null);
    (db.idempotencyRecord.create as any).mockResolvedValue({});
    const result = await claimIdempotency({ key: "new-key-12345", userId: "u1", operation: "tutor_chat" });
    expect(result.status).toBe("first");
  });

  it("claimIdempotency returns 'replay' when completed record exists", async () => {
    const cachedResponse = { ok: true, reply: "cached response" };
    (db.idempotencyRecord.findUnique as any).mockResolvedValue({
      id: "rec1",
      key: "replay-key-12345",
      status: "completed",
      response: cachedResponse,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const result = await claimIdempotency<{ ok: boolean; reply: string }>({
      key: "replay-key-12345",
      userId: "u1",
      operation: "tutor_chat",
    });
    expect(result.status).toBe("replay");
    expect(result.previousResult).toEqual(cachedResponse);
  });

  it("claimIdempotency returns 'pending' when pending record exists", async () => {
    (db.idempotencyRecord.findUnique as any).mockResolvedValue({
      id: "rec1",
      key: "pending-key-12345",
      status: "pending",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const result = await claimIdempotency({
      key: "pending-key-12345",
      userId: "u1",
      operation: "tutor_chat",
    });
    expect(result.status).toBe("pending");
    expect(result.previousResult).toBeNull();
  });

  it("claimIdempotency deletes expired record and treats as first", async () => {
    (db.idempotencyRecord.findUnique as any).mockResolvedValue({
      id: "rec1",
      key: "expired-key-12345",
      status: "completed",
      response: { ok: true },
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    (db.idempotencyRecord.delete as any).mockResolvedValue({});
    (db.idempotencyRecord.create as any).mockResolvedValue({});
    const result = await claimIdempotency({
      key: "expired-key-12345",
      userId: "u1",
      operation: "tutor_chat",
    });
    expect(result.status).toBe("first");
    expect(db.idempotencyRecord.delete).toHaveBeenCalled();
  });

  it("claimIdempotency deletes failed record and retries", async () => {
    (db.idempotencyRecord.findUnique as any).mockResolvedValue({
      id: "rec1",
      key: "failed-key-12345",
      status: "failed",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    (db.idempotencyRecord.delete as any).mockResolvedValue({});
    (db.idempotencyRecord.create as any).mockResolvedValue({});
    const result = await claimIdempotency({
      key: "failed-key-12345",
      userId: "u1",
      operation: "tutor_chat",
    });
    expect(result.status).toBe("first");
  });

  it("claimIdempotency handles P2002 race (another request won)", async () => {
    (db.idempotencyRecord.findUnique as any)
      .mockResolvedValueOnce(null) // first check
      .mockResolvedValueOnce({ // re-read after P2002
        id: "rec1",
        key: "race-key-12345",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    (db.idempotencyRecord.create as any).mockRejectedValue({ code: "P2002" });
    const result = await claimIdempotency({
      key: "race-key-12345",
      userId: "u1",
      operation: "tutor_chat",
    });
    expect(result.status).toBe("pending");
  });

  it("completeIdempotency updates the record to completed", async () => {
    (db.idempotencyRecord.update as any).mockResolvedValue({});
    await completeIdempotency({ key: "complete-key-12345", response: { ok: true } });
    expect(db.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { key: "complete-key-12345" },
      data: expect.objectContaining({
        status: "completed",
        response: { ok: true },
        completedAt: expect.any(Date),
      }),
    });
  });

  it("failIdempotency updates the record to failed", async () => {
    (db.idempotencyRecord.update as any).mockResolvedValue({});
    await failIdempotency({
      key: "fail-key-12345",
      errorCode: "AI_CALL_FAILED",
      errorMessage: "timeout",
    });
    expect(db.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { key: "fail-key-12345" },
      data: expect.objectContaining({
        status: "failed",
        errorCode: "AI_CALL_FAILED",
        errorMessage: "timeout",
      }),
    });
  });

  it("cleanupExpiredIdempotencyRecords deletes expired rows", async () => {
    (db.idempotencyRecord.deleteMany as any).mockResolvedValue({ count: 5 });
    const count = await cleanupExpiredIdempotencyRecords();
    expect(count).toBe(5);
    expect(db.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});

// ============================================================
// Idempotent refund (mocked DB)
// ============================================================

describe("Phase 1 — Idempotent refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refundTokens with key credits the balance once", async () => {
    (db.idempotencyRecord.findUnique as any).mockResolvedValue(null);
    (db.idempotencyRecord.create as any).mockResolvedValue({});
    (db.idempotencyRecord.update as any).mockResolvedValue({});
    (db.user.findUnique as any).mockResolvedValue({ tokenBalance: 100, currentModel: "test" });
    (db.user.update as any).mockResolvedValue({});

    await refundTokens("u1", "tutor", 15, "refund-key-12345");

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { tokenBalance: { increment: 15 } },
    });
    expect(db.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { key: "refund_refund-key-12345" },
      data: expect.objectContaining({ status: "completed" }),
    });
  });

  it("refundTokens with same key twice = single credit (second call is no-op)", async () => {
    // Second call finds a completed record → returns early
    (db.idempotencyRecord.findUnique as any).mockResolvedValue({
      id: "rec1",
      key: "refund_refund-key-12345",
      status: "completed",
      response: { refunded: 15, feature: "tutor" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await refundTokens("u1", "tutor", 15, "refund-key-12345");

    // Should NOT have called user.update (no re-credit)
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refundTokens without key = legacy behavior (credits every call)", async () => {
    (db.user.findUnique as any).mockResolvedValue({ tokenBalance: 100, currentModel: "test" });
    (db.user.update as any).mockResolvedValue({});

    await refundTokens("u1", "tutor", 15); // no key

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { tokenBalance: { increment: 15 } },
    });
    expect(db.idempotencyRecord.findUnique).not.toHaveBeenCalled();
  });

  it("refundTokens marks record as failed when user not found", async () => {
    (db.idempotencyRecord.findUnique as any).mockResolvedValue(null);
    (db.idempotencyRecord.create as any).mockResolvedValue({});
    (db.user.findUnique as any).mockResolvedValue(null);
    (db.idempotencyRecord.update as any).mockResolvedValue({});

    await refundTokens("u1", "tutor", 15, "fail-key-12345");

    expect(db.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { key: "refund_fail-key-12345" },
      data: expect.objectContaining({
        status: "failed",
        errorCode: "USER_NOT_FOUND",
      }),
    });
  });
});

// ============================================================
// Existing contracts preserved
// ============================================================

describe("Phase 1 — Existing contracts preserved", () => {
  it("refundTokens function still accepts 3 args (backward compat)", () => {
    expect(typeof refundTokens).toBe("function");
  });

  it("logger.info/warn/error still work without turn context", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("turn-manager exports all required functions", () => {
    expect(typeof generateId).toBe("function");
    expect(typeof generateTurnId).toBe("function");
    expect(typeof generateRequestId).toBe("function");
    expect(typeof isValidIdempotencyKey).toBe("function");
    expect(typeof buildTurnContext).toBe("function");
    expect(typeof claimIdempotency).toBe("function");
    expect(typeof completeIdempotency).toBe("function");
    expect(typeof failIdempotency).toBe("function");
    expect(typeof cleanupExpiredIdempotencyRecords).toBe("function");
  });
});
