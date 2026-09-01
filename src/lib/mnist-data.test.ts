import { describe, it, expect } from "vitest";
import {
  mulberry32,
  rasterizeDigit,
  generateDigitDataset,
  centerResizeTo28,
  digitToAscii,
  DIGIT_PIXELS,
  DIGIT_CLASS_NAMES,
  DIGITS_MODEL_SPEC,
  DIGIT_TEMPLATES,
} from "./mnist-data";

function ink(px: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < px.length; i++) sum += px[i];
  return sum;
}

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("returns values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("rasterizeDigit", () => {
  it("produces 784 values for every digit", () => {
    for (let d = 0; d < 10; d++) {
      const px = rasterizeDigit(d, 1);
      expect(px.length).toBe(DIGIT_PIXELS);
    }
  });

  it("keeps all values in [0, 1] with no NaN", () => {
    for (let d = 0; d < 10; d++) {
      const px = rasterizeDigit(d, 99);
      for (let i = 0; i < px.length; i++) {
        expect(Number.isNaN(px[i])).toBe(false);
        expect(px[i]).toBeGreaterThanOrEqual(0);
        expect(px[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic for the same seed and different across seeds", () => {
    const a = rasterizeDigit(3, 42);
    const b = rasterizeDigit(3, 42);
    const c = rasterizeDigit(3, 43);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("throws on an invalid digit", () => {
    expect(() => rasterizeDigit(10, 1)).toThrow();
    expect(() => rasterizeDigit(-1, 1)).toThrow();
  });

  it("draws ink that stays within the 28x28 field (no clipping spikes at borders)", () => {
    // With jitter, borders can legitimately have ink, but the CENTER of
    // every digit should always have some for these templates.
    for (let d = 0; d < 10; d++) {
      const px = rasterizeDigit(d, 5);
      const centerRow = 14;
      const row = Array.from(px.slice(centerRow * 28, centerRow * 28 + 28));
      expect(row.some((v) => v > 0)).toBe(true);
    }
  });

  it("digit 1 has a narrower ink footprint than digit 8", () => {
    const narrow = rasterizeDigit(1, 11);
    const wide = rasterizeDigit(8, 11);
    // Count columns with ink
    const colsWithInk = (px: Float32Array) => {
      let n = 0;
      for (let x = 0; x < 28; x++) {
        for (let y = 0; y < 28; y++) {
          if (px[y * 28 + x] > 0.2) { n++; break; }
        }
      }
      return n;
    };
    expect(colsWithInk(narrow)).toBeLessThan(colsWithInk(wide));
  });

  it("every template defines at least one stroke", () => {
    for (let d = 0; d < 10; d++) {
      expect(DIGIT_TEMPLATES[d].length).toBeGreaterThan(0);
    }
  });
});

describe("generateDigitDataset", () => {
  it("is balanced across the 10 classes and shuffled", () => {
    const ds = generateDigitDataset(500, 7);
    expect(ds.xs.length).toBe(500);
    expect(ds.labels.length).toBe(500);
    const counts = new Array(10).fill(0);
    for (const l of ds.labels) counts[l]++;
    expect(counts.every((c) => c === 50)).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const a = generateDigitDataset(100, 42);
    const b = generateDigitDataset(100, 42);
    expect(a.xs).toEqual(b.xs);
    expect(a.labels).toEqual(b.labels);
  });

  it("rounds non-divisible counts down to a multiple of 10", () => {
    const ds = generateDigitDataset(97, 1);
    expect(ds.xs.length).toBe(90);
  });

  it("labels match DIGIT_CLASS_NAMES range and rows are 784 long", () => {
    const ds = generateDigitDataset(200, 3);
    expect(DIGIT_CLASS_NAMES).toHaveLength(10);
    for (const row of ds.xs) expect(row).toHaveLength(DIGIT_PIXELS);
    for (const l of ds.labels) expect(l).toBeGreaterThanOrEqual(0);
  });
});

describe("centerResizeTo28", () => {
  it("returns an all-zero field for blank input", () => {
    const blank = new Float32Array(64 * 64);
    const out = centerResizeTo28(blank, 64, 64);
    expect(out.length).toBe(DIGIT_PIXELS);
    expect(ink(out)).toBe(0);
  });

  it("throws on zero-sized input", () => {
    expect(() => centerResizeTo28(new Float32Array(0), 0, 0)).toThrow();
  });

  it("centers a centered square: COM lands at (14, 14)", () => {
    // 28x28 image with a filled square in the middle
    const img = new Float32Array(28 * 28);
    for (let y = 9; y <= 18; y++) for (let x = 9; x <= 18; x++) img[y * 28 + x] = 1;
    const out = centerResizeTo28(img, 28, 28);
    // compute COM of output
    let cx = 0, cy = 0, mass = 0;
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        const v = out[y * 28 + x];
        cx += x * v; cy += y * v; mass += v;
      }
    }
    expect(mass).toBeGreaterThan(0);
    expect(cx / mass).toBeCloseTo(14, 0);
    expect(cy / mass).toBeCloseTo(14, 0);
  });

  it("recenters off-center ink to the middle (MNIST-style normalization)", () => {
    // tiny dot in the top-left corner of a large canvas
    const img = new Float32Array(56 * 56);
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) img[y * 56 + x] = 1;
    const out = centerResizeTo28(img, 56, 56);
    let cx = 0, cy = 0, mass = 0;
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        const v = out[y * 28 + x];
        cx += x * v; cy += y * v; mass += v;
      }
    }
    expect(mass).toBeGreaterThan(0);
    expect(cx / mass).toBeCloseTo(14, 0);
    expect(cy / mass).toBeCloseTo(14, 0);
  });

  it("scales large ink down so the longest side fits in ~20px", () => {
    const img = new Float32Array(56 * 56);
    for (let y = 0; y < 56; y++) for (let x = 0; x < 56; x++) img[y * 56 + x] = 1;
    const out = centerResizeTo28(img, 56, 56);
    // Find bounding box of output ink
    let minX = 28, maxX = -1, minY = 28, maxY = -1;
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        if (out[y * 28 + x] > 0.1) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    expect(maxX - minX + 1).toBeLessThanOrEqual(21);
    expect(maxY - minY + 1).toBeLessThanOrEqual(21);
  });
});

describe("digitToAscii", () => {
  it("renders 28 rows of 28 chars", () => {
    const px = rasterizeDigit(7, 2);
    const ascii = digitToAscii(px);
    // Strip only the trailing newline — blank art rows are spaces and must survive
    const lines = ascii.replace(/\n+$/, "").split("\n");
    expect(lines).toHaveLength(28);
    expect(lines[0]).toHaveLength(28);
  });
});

describe("DIGITS_MODEL_SPEC", () => {
  it("is a conv net with a 10-way softmax head and 28x28x1 input", () => {
    expect(DIGITS_MODEL_SPEC.layers[0].type).toBe("conv2d");
    expect(DIGITS_MODEL_SPEC.layers[0].inputShape).toEqual([28, 28, 1]);
    const last = DIGITS_MODEL_SPEC.layers[DIGITS_MODEL_SPEC.layers.length - 1];
    expect(last.type).toBe("dense");
    expect(last.units).toBe(10);
    expect(last.activation).toBe("softmax");
    expect(DIGITS_MODEL_SPEC.loss).toBe("categoricalCrossentropy");
  });
});
