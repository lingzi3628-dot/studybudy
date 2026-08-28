/**
 * Graph Validator Test Suite — Phase 45
 *
 * First test file in the repo. Covers the validateAndCorrectGraphSpec
 * function with one or more cases per supported graph type, plus
 * golden "AI mistake" fixtures captured from production failure modes.
 *
 * Run:  npx vitest run src/lib/graph-validator.test.ts
 */
import { describe, it, expect } from "vitest";
import { validateAndCorrectGraphSpec, hasGraphSpec } from "./graph-validator";

describe("validateAndCorrectGraphSpec — type aliases", () => {
  it("accepts canonical types unchanged", () => {
    const r = validateAndCorrectGraphSpec({ type: "scatter", points: [[1, 2], [3, 4]] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("scatter");
  });

  it("renames 'line' → 'function'", () => {
    const r = validateAndCorrectGraphSpec({ type: "line", expr: "x*x" });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("function");
    expect(r.warnings.join(" ")).toMatch(/line.*function/);
  });

  it("renames 'chart' → 'bar'", () => {
    const r = validateAndCorrectGraphSpec({ type: "chart", categories: ["A", "B"], values: [1, 2] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("bar");
  });

  it("renames 'scatterplot' → 'scatter'", () => {
    const r = validateAndCorrectGraphSpec({ type: "scatterplot", points: [[0, 0]] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("scatter");
  });

  it("renames 'stepSolver' → 'steps'", () => {
    const r = validateAndCorrectGraphSpec({ type: "stepSolver", steps: ["add 2", "divide by 5"] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("steps");
  });
});

describe("validateAndCorrectGraphSpec — type inference", () => {
  it("infers scatter from 'points'", () => {
    const r = validateAndCorrectGraphSpec({ points: [[0, 0], [1, 1]] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("scatter");
  });

  it("infers bar from 'categories'+'values'", () => {
    const r = validateAndCorrectGraphSpec({ categories: ["A"], values: [1] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("bar");
  });

  it("infers function from 'expr'", () => {
    const r = validateAndCorrectGraphSpec({ expr: "sin(x)" });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("function");
  });

  it("rejects empty spec with no inferable type", () => {
    const r = validateAndCorrectGraphSpec({ foo: "bar" });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/missing 'type'/i);
  });
});

describe("validateAndCorrectGraphSpec — field rename (data → points)", () => {
  it("renames 'data' → 'points' for scatter", () => {
    const r = validateAndCorrectGraphSpec({ type: "scatter", data: [[0, 0], [1, 1]] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.points).toEqual([[0, 0], [1, 1]]);
    expect(r.correctedSpec.data).toBeUndefined();
  });

  it("does NOT rename 'data' for stemleaf (it expects data)", () => {
    const r = validateAndCorrectGraphSpec({ type: "stemleaf", data: [12, 25, 38] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.data).toEqual([12, 25, 38]);
  });
});

describe("validateAndCorrectGraphSpec — range sanity", () => {
  it("swaps inverted xRange", () => {
    const r = validateAndCorrectGraphSpec({ type: "function", expr: "x", xRange: [5, -5] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.xRange).toEqual([-5, 5]);
    expect(r.warnings.join(" ")).toMatch(/inverted/i);
  });

  it("pads zero-span range to ±1", () => {
    const r = validateAndCorrectGraphSpec({ type: "function", expr: "x", xRange: [3, 3] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.xRange).toEqual([2, 4]);
    expect(r.warnings.join(" ")).toMatch(/zero span/i);
  });

  it("adds default range when missing", () => {
    const r = validateAndCorrectGraphSpec({ type: "function", expr: "x" });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.xRange).toEqual([-5, 5]);
    expect(r.correctedSpec.yRange).toEqual([-25, 25]);
  });
});

describe("validateAndCorrectGraphSpec — per-type validation", () => {
  it("scatter: rejects empty points", () => {
    const r = validateAndCorrectGraphSpec({ type: "scatter", points: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/empty points/i);
  });

  it("scatter: coerces non-numeric points to [0,0]", () => {
    const r = validateAndCorrectGraphSpec({ type: "scatter", points: [["a", "b"], [1, 2]] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.points[0]).toEqual([0, 0]);
    expect(r.correctedSpec.points[1]).toEqual([1, 2]);
  });

  it("bar: truncates mismatched categories/values", () => {
    const r = validateAndCorrectGraphSpec({ type: "bar", categories: ["A", "B", "C"], values: [1, 2] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.categories).toEqual(["A", "B"]);
    expect(r.correctedSpec.values).toEqual([1, 2]);
  });

  it("histogram: validates bins (was missing in Phase 44)", () => {
    const r = validateAndCorrectGraphSpec({ type: "histogram", bins: [{ range: [0, 10], count: 5 }] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.bins[0].label).toBe("0–10");
    expect(r.correctedSpec.bins[0].count).toBe(5);
  });

  it("histogram: rejects missing bins", () => {
    const r = validateAndCorrectGraphSpec({ type: "histogram" });
    expect(r.valid).toBe(false);
  });

  it("pie: auto-fills missing label", () => {
    const r = validateAndCorrectGraphSpec({ type: "pie", slices: [{ value: 10 }, { value: 20 }] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.slices[0].label).toBe("Slice 1");
    expect(r.correctedSpec.slices[1].label).toBe("Slice 2");
  });

  it("network: detects duplicate ids", () => {
    const r = validateAndCorrectGraphSpec({
      type: "network",
      nodes: [{ id: "a" }, { id: "a" }, { id: "b" }],
    });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.nodes[1].id).toBe("n1"); // renumbered
    expect(r.warnings.join(" ")).toMatch(/duplicate/i);
  });

  it("boxplot: orders min/q1/median/q3/max", () => {
    const r = validateAndCorrectGraphSpec({
      type: "boxplot",
      datasets: [{ label: "X", min: 10, q1: 5, median: 7, q3: 12, max: 8 }],
    });
    expect(r.valid).toBe(true);
    const d = r.correctedSpec.datasets[0];
    expect(d.min).toBeLessThanOrEqual(d.q1);
    expect(d.q1).toBeLessThanOrEqual(d.median);
    expect(d.median).toBeLessThanOrEqual(d.q3);
    expect(d.q3).toBeLessThanOrEqual(d.max);
    expect(r.warnings.join(" ")).toMatch(/auto-ordered/i);
  });

  it("function: validates expression parses via mathjs", () => {
    const r = validateAndCorrectGraphSpec({ type: "function", expr: "2*x + sin(x)" });
    expect(r.valid).toBe(true);
    // Should not have a "failed to parse" warning
    expect(r.warnings.join(" ")).not.toMatch(/failed to parse/i);
  });

  it("function: warns (not errors) when expr can't parse", () => {
    const r = validateAndCorrectGraphSpec({ type: "function", expr: "2x +" }); // invalid syntax
    // Still valid — the validator is permissive; the renderer will show an empty graph
    expect(r.valid).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/failed to parse/i);
  });

  it("vectorfield: validates exprP/exprQ are parseable", () => {
    const r = validateAndCorrectGraphSpec({ type: "vectorfield", exprP: "-y", exprQ: "x" });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.exprQ).toBe("x");
  });

  it("carroll: ensures all 4 cells exist as arrays", () => {
    const r = validateAndCorrectGraphSpec({ type: "carroll" });
    expect(r.valid).toBe(true);
    expect(Array.isArray(r.correctedSpec.cells.yesYes)).toBe(true);
    expect(Array.isArray(r.correctedSpec.cells.yesNo)).toBe(true);
    expect(Array.isArray(r.correctedSpec.cells.noYes)).toBe(true);
    expect(Array.isArray(r.correctedSpec.cells.noNo)).toBe(true);
  });

  it("axes3d: warns when no points provided", () => {
    const r = validateAndCorrectGraphSpec({ type: "axes3d" });
    expect(r.valid).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/no points/i);
  });

  it("twoway: truncates data to rowLabels length", () => {
    const r = validateAndCorrectGraphSpec({
      type: "twoway",
      rowLabels: ["M", "F"],
      colLabels: ["football", "tennis"],
      data: [[15, 8], [3, 6], [99, 99]], // 3 rows but only 2 rowLabels
    });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.data).toHaveLength(2);
  });

  it("erdiagram: normalizes field strings to objects", () => {
    const r = validateAndCorrectGraphSpec({
      type: "erdiagram",
      tables: [{ name: "Students", fields: ["id", "name"] }],
    });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.tables[0].fields[0]).toMatchObject({ name: "id", type: "string" });
  });

  it("csv: pads rows to match headers length", () => {
    const r = validateAndCorrectGraphSpec({
      type: "csv",
      headers: ["A", "B", "C"],
      rows: [["x", "y"]],
    });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.rows[0]).toEqual(["x", "y", ""]);
  });

  it("steps: coerces step objects to strings", () => {
    const r = validateAndCorrectGraphSpec({
      type: "steps",
      steps: [{ text: "add 2 both sides" }, "divide by 5"],
    });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.steps[0]).toBe("add 2 both sides");
    expect(r.correctedSpec.steps[1]).toBe("divide by 5");
  });

  it("freeform: clamps width/height to ≤2000", () => {
    const r = validateAndCorrectGraphSpec({ type: "freeform", svg: "<circle/>", width: 50000, height: 50000 });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.width).toBeLessThanOrEqual(2000);
    expect(r.correctedSpec.height).toBeLessThanOrEqual(2000);
  });

  it("transform: defaults transformType to reflect", () => {
    const r = validateAndCorrectGraphSpec({
      type: "transform",
      original: [[0, 0], [1, 0], [0, 1]],
    });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.transformType).toBe("reflect");
  });
});

describe("validateAndCorrectGraphSpec — array length caps", () => {
  it("truncates scatter points above MAX_POINTS (5000)", () => {
    const big = Array.from({ length: 6000 }, (_, i) => [i, i * 2]);
    const r = validateAndCorrectGraphSpec({ type: "scatter", points: big });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.points.length).toBe(5000);
    expect(r.warnings.join(" ")).toMatch(/truncated/i);
  });
});

describe("validateAndCorrectGraphSpec — deep clone safety", () => {
  it("does not mutate the input spec", () => {
    const input = { type: "scatter", points: [[1, 2], [3, 4]] };
    const inputJSON = JSON.stringify(input);
    validateAndCorrectGraphSpec(input);
    expect(JSON.stringify(input)).toBe(inputJSON);
  });
});

describe("hasGraphSpec", () => {
  it("detects mathgraph-tagged block", () => {
    expect(hasGraphSpec("Here is your graph:\n```mathgraph\n{\"type\":\"scatter\",\"points\":[[1,2]]}\n```")).toBe(true);
  });

  it("detects json-tagged block with graph type", () => {
    expect(hasGraphSpec("```json\n{\"type\":\"bar\",\"categories\":[\"A\"],\"values\":[1]}\n```")).toBe(true);
  });

  it("detects inline JSON-looking text", () => {
    expect(hasGraphSpec('Here is the spec: {"type":"pie","slices":[{"value":1}]} done.')).toBe(true);
  });

  it("returns false for plain text without spec", () => {
    expect(hasGraphSpec("This is just a regular explanation about photosynthesis.")).toBe(false);
  });

  it("returns false for code blocks that are not graphs", () => {
    expect(hasGraphSpec("```python\nprint('hello')\n```")).toBe(false);
  });
});

describe("validateAndCorrectGraphSpec — known AI mistake fixtures", () => {
  it("handles 'AI wrote line instead of function' mistake", () => {
    // AI often writes "type":"line" for line charts instead of "function"
    const r = validateAndCorrectGraphSpec({ type: "line", expr: "2*x + 1" });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("function");
  });

  it("handles 'AI used data field instead of points for scatter' mistake", () => {
    const r = validateAndCorrectGraphSpec({ type: "scatter", data: [[0, 1], [2, 3], [4, 5]] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.points).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it("handles 'AI used chart instead of bar' mistake", () => {
    const r = validateAndCorrectGraphSpec({ type: "chart", categories: ["Q1", "Q2", "Q3"], values: [100, 150, 120] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.type).toBe("bar");
  });

  it("handles 'AI forgot xRange for function' mistake", () => {
    const r = validateAndCorrectGraphSpec({ type: "function", expr: "x^2" });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.xRange).toEqual([-5, 5]);
    expect(r.correctedSpec.yRange).toEqual([-25, 25]);
  });

  it("handles 'AI inverted the xRange' mistake", () => {
    const r = validateAndCorrectGraphSpec({ type: "function", expr: "x", xRange: [10, -10] });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.xRange).toEqual([-10, 10]);
  });

  it("handles 'AI put non-numeric values in bar chart' mistake", () => {
    const r = validateAndCorrectGraphSpec({
      type: "bar",
      categories: ["Math", "English", "Science"],
      values: ["85", "72", "90"], // strings, not numbers
    });
    expect(r.valid).toBe(true);
    expect(r.correctedSpec.values).toEqual([85, 72, 90]);
  });
});
