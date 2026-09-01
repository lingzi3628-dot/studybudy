import { describe, it, expect } from "vitest";
import { TRADES, getTrade, generateAssessmentSheet, type TradeId } from "./cdacc-data";

describe("CDACC data structure", () => {
  it("covers the seven trades from the buddy stub", () => {
    expect(TRADES.map((t) => t.id).sort()).toEqual(
      ["automotive", "building", "business", "electrical", "hospitality", "ict", "mechanical"].sort()
    );
  });

  it("every trade has competencies with checklists", () => {
    for (const t of TRADES) {
      expect(t.competencies.length).toBeGreaterThanOrEqual(3);
      for (const c of t.competencies) {
        expect(c.code).toMatch(/^[A-Z]{2}-\d{2}$/);
        expect(c.statement.length).toBeGreaterThan(15);
        expect(c.checklist.length).toBeGreaterThanOrEqual(3);
        for (const item of c.checklist) expect(item.length).toBeGreaterThan(10);
      }
    }
  });

  it("safety-critical trades carry safety points; clerical ones may not", () => {
    expect(getTrade("electrical" as TradeId)!.competencies.every((c) => c.safety.length > 0)).toBe(true);
    expect(getTrade("business" as TradeId)!.competencies.every((c) => c.safety.length === 0)).toBe(true);
  });

  it("getTrade resolves by id", () => {
    expect(getTrade("ict")?.name).toContain("Information");
    expect(getTrade("nonexistent" as TradeId)).toBeUndefined();
  });
});

describe("generateAssessmentSheet", () => {
  it("renders trade name, candidate, checklist tables and sign-off", () => {
    const trade = getTrade("electrical")!;
    const sheet = generateAssessmentSheet(trade, "Jane Wanjiku", "2026-09-01");
    expect(sheet).toContain("# Practical Assessment Sheet — Electrical Installation");
    expect(sheet).toContain("**Candidate:** Jane Wanjiku");
    expect(sheet).toContain("CDACC Level 4-6");
    for (const c of trade.competencies) {
      expect(sheet).toContain(c.code);
      expect(sheet).toContain(c.statement);
    }
    expect(sheet).toContain("| # | Performance step | Done |");
    expect(sheet).toContain("☐ C ☐ NY");
    expect(sheet).toContain("Assessor signature");
  });

  it("includes the safety gate and the official-curriculum disclaimer", () => {
    const sheet = generateAssessmentSheet(getTrade("automotive")!, "", "2026-09-01");
    expect(sheet).toContain("Safety (must all be observed to pass)");
    expect(sheet).toContain("Confirm requirements against the current official CDACC curriculum");
    expect(sheet).toContain("**Candidate:** ________________"); // blank candidate
  });
});
