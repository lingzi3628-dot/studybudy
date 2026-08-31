/**
 * gamify tests — Phase 53 (test wave 1)
 *
 * Covers the pure XP curve helpers that drive levels, badge criteria, and
 * the leaderboard. The DB-touching functions (awardXp, updateStreak) are
 * out of scope here — they need a live Prisma client.
 *
 * Run: npx vitest run src/lib/gamify.test.ts
 */
import { describe, it, expect } from "vitest";
import { xpForLevel, levelForXp } from "./gamify";

describe("xpForLevel — XP curve", () => {
  it("level 1 requires 0 XP", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("follows the (level - 1) * 250 curve", () => {
    expect(xpForLevel(2)).toBe(250);
    expect(xpForLevel(3)).toBe(500);
    expect(xpForLevel(5)).toBe(1000);
    expect(xpForLevel(10)).toBe(2250);
  });

  it("clamps invalid levels to 0 XP (never negative)", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-5)).toBe(0);
  });

  it("is monotonically non-decreasing", () => {
    let prev = xpForLevel(1);
    for (let level = 2; level <= 30; level++) {
      const cur = xpForLevel(level);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("levelForXp — inverse mapping", () => {
  it("0 XP → level 1", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("boundary XP lands on the higher level (curve is >=-based)", () => {
    expect(levelForXp(249)).toBe(1);
    expect(levelForXp(250)).toBe(2);
    expect(levelForXp(500)).toBe(3);
  });

  it("round-trips: levelForXp(xpForLevel(n)) === n for n >= 1", () => {
    for (let n = 1; n <= 20; n++) {
      expect(levelForXp(xpForLevel(n))).toBe(n);
    }
  });

  it("handles huge XP without hanging", () => {
    expect(levelForXp(1_000_000)).toBeGreaterThan(1);
  });
});
