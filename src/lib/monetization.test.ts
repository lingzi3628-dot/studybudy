/**
 * monetization tests — Phase 53 (test wave 1)
 *
 * The monetization engine's cost/cap tables are the money path — an entry
 * with a cost but no daily cap (or a typo'd key) silently lets free users
 * burn unlimited calls, or blocks features entirely. These tests pin the
 * invariants the UI and routes rely on.
 *
 * DB-touching flows (checkAndDeductTokens etc.) need a live Prisma client
 * and are covered by CI against the service container later.
 *
 * Run: npx vitest run src/lib/monetization.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  FLAT_COSTS,
  FREE_DAILY_LIMITS,
  FREE_DAILY_TOKEN_ALLOWANCE,
  DAILY_COIN_FLOOR,
} from "./monetization";

describe("monetization constants — table integrity", () => {
  it("every feature with a cost also has a free daily cap", () => {
    const missingCaps = Object.keys(FLAT_COSTS).filter((k) => !(k in FREE_DAILY_LIMITS));
    expect(missingCaps).toEqual([]);
  });

  it("every capped feature also has a cost (no free-but-uncosted features)", () => {
    const missingCosts = Object.keys(FREE_DAILY_LIMITS).filter((k) => !(k in FLAT_COSTS));
    expect(missingCosts).toEqual([]);
  });

  it("all costs are positive integers within the documented 2–30 range", () => {
    for (const [feature, cost] of Object.entries(FLAT_COSTS)) {
      expect(Number.isInteger(cost), `${feature} cost must be an integer`).toBe(true);
      expect(cost, `${feature} cost must be > 0`).toBeGreaterThan(0);
      expect(cost, `${feature} cost must be <= 30`).toBeLessThanOrEqual(30);
    }
  });

  it("all free daily caps are generous (>= 5/day) — Phase 21 promise", () => {
    for (const [feature, cap] of Object.entries(FREE_DAILY_LIMITS)) {
      expect(cap, `${feature} cap must be >= 5`).toBeGreaterThanOrEqual(5);
    }
  });

  it("heavy pipelines cost more than light lookups", () => {
    expect(FLAT_COSTS.cards).toBeGreaterThan(FLAT_COSTS.search);
    expect(FLAT_COSTS.learning_path).toBeGreaterThan(FLAT_COSTS.graph);
    expect(FLAT_COSTS.quiz).toBeGreaterThan(FLAT_COSTS.tutor);
  });

  it("daily token allowance funds at least 16 tutor calls", () => {
    // 500 tokens / 15 per tutor call ≈ 33 calls — the "never hit a wall" promise
    expect(FREE_DAILY_TOKEN_ALLOWANCE / FLAT_COSTS.tutor).toBeGreaterThanOrEqual(16);
  });

  it("coin floor keeps free users spendable (never 0)", () => {
    expect(DAILY_COIN_FLOOR).toBeGreaterThanOrEqual(50);
  });

  it("allowances are positive integers", () => {
    expect(Number.isInteger(FREE_DAILY_TOKEN_ALLOWANCE)).toBe(true);
    expect(FREE_DAILY_TOKEN_ALLOWANCE).toBeGreaterThan(0);
  });
});
