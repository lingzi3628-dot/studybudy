import { describe, it, expect } from "vitest";
import {
  computeConfusionMatrix,
  summarizeMatrix,
  topConfusions,
} from "./confusion-matrix";

describe("computeConfusionMatrix", () => {
  it("fills matrix[truth][predicted] cells", () => {
    const m = computeConfusionMatrix(
      [0, 0, 1, 1, 2],
      [0, 1, 1, 1, 0],
      3
    );
    expect(m).toEqual([
      [1, 1, 0],
      [0, 2, 0],
      [1, 0, 0],
    ]);
  });

  it("produces a perfect diagonal for perfect predictions", () => {
    const truth = [0, 1, 2, 3, 4];
    const m = computeConfusionMatrix(truth, [...truth], 5);
    for (let i = 0; i < 5; i++) {
      expect(m[i][i]).toBe(1);
    }
    // off-diagonals empty
    expect(m.flat().filter((v, idx) => idx % 5 !== Math.floor(idx / 5)).every((v) => v === 0)).toBe(true);
  });

  it("throws on length mismatch and out-of-range labels", () => {
    expect(() => computeConfusionMatrix([0, 1], [0], 2)).toThrow(/mismatch/);
    expect(() => computeConfusionMatrix([5], [0], 2)).toThrow(/out of range/);
    expect(() => computeConfusionMatrix([0], [2], 2)).toThrow(/out of range/);
    expect(() => computeConfusionMatrix([1.5], [0], 2)).toThrow(/out of range/);
  });
});

describe("summarizeMatrix", () => {
  // Classic 2-class example:
  //             pred+  pred-
  //   truth + [  40     10 ]  → precision 40/50=0.8, recall 40/50=0.8
  //   truth - [  10     40 ]
  const m = [
    [40, 10],
    [10, 40],
  ];

  it("computes accuracy", () => {
    const s = summarizeMatrix(m);
    expect(s.total).toBe(100);
    expect(s.correct).toBe(80);
    expect(s.accuracy).toBeCloseTo(0.8);
  });

  it("computes per-class precision/recall/F1", () => {
    const s = summarizeMatrix(m);
    expect(s.perClass[0].precision).toBeCloseTo(0.8);
    expect(s.perClass[0].recall).toBeCloseTo(0.8);
    expect(s.perClass[0].f1).toBeCloseTo(0.8);
    expect(s.perClass[0].support).toBe(50);
  });

  it("computes macro F1 as the unweighted mean", () => {
    const s = summarizeMatrix(m);
    expect(s.macroF1).toBeCloseTo(0.8);
  });

  it("handles zero-division for classes never predicted", () => {
    const m2 = [
      [0, 5],
      [0, 5],
    ];
    const s = summarizeMatrix(m2);
    expect(s.perClass[0].precision).toBe(0);
    expect(s.perClass[0].recall).toBe(0);
    expect(s.perClass[0].f1).toBe(0);
    expect(s.accuracy).toBeCloseTo(0.5);
  });

  it("is safe on an empty matrix", () => {
    const s = summarizeMatrix([[]]);
    expect(s.total).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.macroF1).toBe(0);
  });
});

describe("topConfusions", () => {
  const m = [
    [50, 8, 2],
    [3, 40, 7],
    [1, 4, 45],
  ];

  it("returns only off-diagonal cells sorted by count", () => {
    const top = topConfusions(m, 5);
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual({ truth: 0, predicted: 1, count: 8, rate: 8 / 60 });
    for (let i = 1; i < top.length; i++) {
      expect(top[i].count).toBeLessThanOrEqual(top[i - 1].count);
    }
  });

  it("computes rates against the true-class row total", () => {
    const top = topConfusions(m, 10);
    const t1p2 = top.find((c) => c.truth === 1 && c.predicted === 2);
    expect(t1p2).toBeDefined();
    expect(t1p2!.rate).toBeCloseTo(7 / 50);
  });

  it("respects the k limit and excludes diagonal", () => {
    const top = topConfusions(m, 2);
    expect(top).toHaveLength(2);
    expect(top.every((c) => c.truth !== c.predicted)).toBe(true);
  });

  it("returns empty for a perfect diagonal matrix", () => {
    expect(topConfusions([[5, 0], [0, 5]])).toEqual([]);
  });
});
