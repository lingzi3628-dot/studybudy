/**
 * curriculum-engine Phase 94 tests — KICD source citations
 *
 * Tests the new KICD source URL helpers and the updated
 * buildCurriculumContext() that emits `Source: <url>` + citation rules.
 *
 * Run: npx vitest run src/lib/tutor/__tests__/curriculum-engine.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  getCurriculumSourceUrl,
  KICD_BASE_URL,
  buildCurriculumContext,
  getCurriculumForGrade,
} from "@/lib/curriculum-engine";

describe("getCurriculumSourceUrl — Phase 94", () => {
  it("returns the pre-primary URL for PP1", () => {
    expect(getCurriculumSourceUrl("PP1")).toBe(KICD_BASE_URL + "pre-primary/");
  });

  it("returns the pre-primary URL for PP2", () => {
    expect(getCurriculumSourceUrl("PP2")).toBe(KICD_BASE_URL + "pre-primary/");
  });

  it("returns grade-specific URL for Grade 1-9", () => {
    expect(getCurriculumSourceUrl("Grade 1")).toBe(KICD_BASE_URL + "grade-1/");
    expect(getCurriculumSourceUrl("Grade 4")).toBe(KICD_BASE_URL + "grade-4/");
    expect(getCurriculumSourceUrl("Grade 9")).toBe(KICD_BASE_URL + "grade-9/");
  });

  it("handles lowercase grade names", () => {
    expect(getCurriculumSourceUrl("grade 4")).toBe(KICD_BASE_URL + "grade-4/");
  });

  it("returns the senior-school URL for Form 1-4", () => {
    expect(getCurriculumSourceUrl("Form 1")).toBe(KICD_BASE_URL + "senior-school/");
    expect(getCurriculumSourceUrl("Form 4")).toBe(KICD_BASE_URL + "senior-school/");
  });

  it("falls back to the KICD index for unknown grades", () => {
    expect(getCurriculumSourceUrl("Unknown Grade")).toBe(KICD_BASE_URL);
    expect(getCurriculumSourceUrl("")).toBe(KICD_BASE_URL);
  });
});

describe("buildCurriculumContext — Phase 94 KICD citation", () => {
  it("emits 'Source: <url>' line in the curriculum context", () => {
    const ctx = buildCurriculumContext("Grade 4");
    expect(ctx).toContain("Source: ");
    expect(ctx).toContain(KICD_BASE_URL + "grade-4/");
  });

  it("includes the CITATION RULE block", () => {
    const ctx = buildCurriculumContext("Grade 4");
    expect(ctx).toContain("CITATION RULE (Phase 94)");
    expect(ctx).toContain("cite the KICD source inline");
    expect(ctx).toContain("Markdown link");
  });

  it("includes the source URL in the citation example", () => {
    const ctx = buildCurriculumContext("Grade 4");
    // The citation example should reference the grade-4 URL
    expect(ctx).toContain(KICD_BASE_URL + "grade-4/");
    expect(ctx).toContain("KICD Grade 4 curriculum design");
  });

  it("instructs the AI to cite at most once per reply", () => {
    const ctx = buildCurriculumContext("Grade 4");
    expect(ctx).toContain("at most ONCE per reply");
  });

  it("instructs the AI NOT to cite KICD for non-curriculum topics", () => {
    const ctx = buildCurriculumContext("Grade 4");
    expect(ctx).toContain("do NOT cite KICD");
  });

  it("uses the correct KICD URL for each grade level", () => {
    const pp1 = buildCurriculumContext("PP1");
    expect(pp1).toContain(KICD_BASE_URL + "pre-primary/");

    const g7 = buildCurriculumContext("Grade 7");
    expect(g7).toContain(KICD_BASE_URL + "grade-7/");

    const f3 = buildCurriculumContext("Form 3");
    expect(f3).toContain(KICD_BASE_URL + "senior-school/");
  });

  it("returns empty string for an unknown grade (no false citations)", () => {
    const ctx = buildCurriculumContext("Nonexistent Grade");
    expect(ctx).toBe("");
  });

  it("still includes the curriculum grounding + subjects + topics", () => {
    const ctx = buildCurriculumContext("Grade 4");
    expect(ctx).toContain("CURRICULUM GROUNDING");
    expect(ctx).toContain("Kenya CBC");
    expect(ctx).toContain("SUBJECTS AND TOPICS");
    // Spot-check a subject that should be in Grade 4
    expect(ctx).toContain("Mathematics");
  });

  it("still includes the original RULES block (no regression)", () => {
    const ctx = buildCurriculumContext("Grade 4");
    expect(ctx).toContain("Only teach topics listed above");
    expect(ctx).toContain("Use age-appropriate language");
  });
});

describe("getCurriculumForGrade — Phase 94 sourceUrl field (optional)", () => {
  it("returns a CurriculumGrade (sourceUrl is optional, may be undefined)", () => {
    const g = getCurriculumForGrade("Grade 4");
    expect(g).not.toBeNull();
    expect(g!.name).toBe("Grade 4");
    // sourceUrl is optional — undefined is fine; buildCurriculumContext()
    // falls back to getCurriculumSourceUrl() when sourceUrl is unset.
    // We just verify the type allows the field.
    expect(typeof g).toBe("object");
  });
});
