/**
 * Synthetic Digits — Phase 57 (MLBuddy 2.0)
 *
 * A procedurally-generated MNIST-style digit dataset that runs 100%
 * offline. Real MNIST requires an ~11 MB download; instead we rasterize
 * stroke-template digits (0-9) with per-sample jitter (rotation, scale,
 * translation, stroke width) from a seeded RNG so every run is
 * reproducible and testable in Node (no canvas/DOM required).
 *
 * The result is honest about what it is: the UI labels it
 * "Synthetic Digits (MNIST-style)" — same 28x28 grayscale shape and
 * centered-ink characteristics as MNIST, clearly not the original data.
 *
 * Also contains the MNIST-style preprocessing used by the digit-draw
 * inference pad: crop to the ink bounding box, scale to a 20x20 box,
 * center by center-of mass in the 28x28 field (the standard MNIST
 * normalization).
 */

import type { DemoDataset, ModelSpec } from "./ml-engine";

export const DIGIT_SIZE = 28;
export const DIGIT_PIXELS = DIGIT_SIZE * DIGIT_SIZE;
export const DIGIT_CLASS_NAMES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

// ---------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic across runs and environments
// ---------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// Stroke templates — points in a 28x28 field, y grows downward
// ---------------------------------------------------------------------

type Pt = [number, number];
type Stroke = Pt[];

function circle(cx: number, cy: number, rx: number, ry: number, steps = 28, start = 0, end = Math.PI * 2): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (i / steps) * (end - start);
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/**
 * Per-digit stroke templates. Coordinates live in [4, 24] so jitter has
 * room without clipping. Each entry is a list of strokes (polylines).
 */
export const DIGIT_TEMPLATES: Stroke[][] = [
  /* 0 */ [
    circle(14, 14, 6.5, 9),
  ],
  /* 1 */ [
    [[14, 6], [14, 22]],
    [[10, 9], [14, 6]],
    [[10, 22], [18, 22]],
  ],
  /* 2 */ [
    circle(14, 10, 5.5, 4.5, 24, Math.PI * 1.15, Math.PI * 0.15),
    [[9, 13], [19, 22]],
    [[9, 22], [19, 22]],
  ],
  /* 3 */ [
    circle(13.5, 9.5, 5, 4, 20, Math.PI * 1.2, Math.PI * 0.4),
    circle(14, 17.5, 6, 5, 24, Math.PI * 1.25, Math.PI * 0.45),
  ],
  /* 4 */ [
    [[17, 6], [8, 16]],
    [[6, 16], [19, 16]],
    [[17, 10], [17, 22]],
  ],
  /* 5 */ [
    [[19, 6], [10, 6]],
    [[10, 6], [9.5, 13]],
    circle(14, 17.5, 5.5, 5, 24, Math.PI * 1.4, Math.PI * 0.7),
  ],
  /* 6 */ [
    circle(14, 16.5, 5.5, 5.5),
    [[18.5, 7], [12, 12.5]],
  ],
  /* 7 */ [
    [[8, 6], [19, 6]],
    [[19, 6], [11, 22]],
  ],
  /* 8 */ [
    circle(14, 9.5, 5, 4),
    circle(14, 17.5, 6, 5),
  ],
  /* 9 */ [
    circle(14, 9.5, 5.5, 5),
    [[19, 12], [19, 20]],
    [[19, 22], [12, 22]],
  ],
];

// ---------------------------------------------------------------------
// Rasterizer — anti-aliased distance-to-segment splatting
// ---------------------------------------------------------------------

/** Squared distance from point p to segment [a, b]. */
function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

function rot(p: Pt, cx: number, cy: number, angle: number): Pt {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const x = p[0] - cx;
  const y = p[1] - cy;
  return [cx + x * c - y * s, cy + x * s + y * c];
}

/**
 * Rasterize one digit into a Float32Array of 784 values in [0, 1].
 *
 * @param digit 0-9
 * @param seed  deterministic jitter seed
 */
export function rasterizeDigit(digit: number, seed: number): Float32Array {
  const templates = DIGIT_TEMPLATES[digit];
  if (!templates) throw new Error(`Invalid digit: ${digit}`);
  const rng = mulberry32(seed);

  // Jitter parameters
  const angle = (rng() - 0.5) * 0.28; // ±8°
  const scale = 0.9 + rng() * 0.2; // 0.9 - 1.1
  const tx = (rng() - 0.5) * 3; // ±1.5 px
  const ty = (rng() - 0.5) * 3;
  const width = 1.15 + rng() * 1.1; // stroke half-width 1.15 - 2.25

  const cx = 14, cy = 14;
  const px = new Float32Array(DIGIT_PIXELS);

  for (const stroke of templates) {
    const pts = stroke.map((p) => {
      const [x, y] = rot(p, cx, cy, angle);
      return [(x - cx) * scale + cx + tx, (y - cy) * scale + cy + ty] as Pt;
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      // Bounding box of the segment expanded by the stroke width
      const minX = Math.max(0, Math.floor(Math.min(ax, bx) - width - 1));
      const maxX = Math.min(DIGIT_SIZE - 1, Math.ceil(Math.max(ax, bx) + width + 1));
      const minY = Math.max(0, Math.floor(Math.min(ay, by) - width - 1));
      const maxY = Math.min(DIGIT_SIZE - 1, Math.ceil(Math.max(ay, by) + width + 1));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const d2 = segDistSq(x, y, ax, ay, bx, by);
          // 1 inside the half-width, smooth falloff for 1px outside
          const edge = width + 0.5;
          if (d2 < edge * edge) {
            const d = Math.sqrt(d2);
            const ink = d <= width ? 1 : Math.max(0, 1 - (d - width));
            const idx = y * DIGIT_SIZE + x;
            if (ink > px[idx]) px[idx] = ink;
          }
        }
      }
    }
  }
  return px;
}

// ---------------------------------------------------------------------
// Dataset generation
// ---------------------------------------------------------------------

export type DigitDataset = {
  xs: number[][]; // [N][784] floats in [0, 1]
  labels: number[]; // [N] ints 0-9
  classNames: string[];
};

/**
 * Generate a balanced digit dataset: `count` samples spread evenly over
 * the 10 classes. Deterministic for a given (count, seed) pair.
 */
export function generateDigitDataset(count: number, seed = 42): DigitDataset {
  const n = Math.max(10, Math.floor(count / 10) * 10); // keep it divisible by 10
  const perClass = n / 10;
  const xs: number[][] = [];
  const labels: number[] = [];
  let s = seed >>> 0;
  for (let digit = 0; digit < 10; digit++) {
    for (let i = 0; i < perClass; i++) {
      const px = rasterizeDigit(digit, s++);
      xs.push(Array.from(px));
      labels.push(digit);
    }
  }
  // Deterministic shuffle so train/val splits are class-mixed
  const rng = mulberry32(seed ^ 0x9e3779b9);
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return { xs, labels, classNames: DIGIT_CLASS_NAMES };
}

// ---------------------------------------------------------------------
// MNIST-style preprocessing for the digit-draw inference pad
// ---------------------------------------------------------------------

/**
 * Take a grayscale image (row-major floats, `w` x `h`, ink = higher
 * values), crop to the ink bounding box, scale the longest side to 20px
 * preserving aspect ratio, and center the result by center of mass in a
 * 28x28 field — the standard MNIST normalization.
 *
 * @returns Float32Array(784) in [0, 1]
 */
export function centerResizeTo28(gray: ArrayLike<number>, w: number, h: number): Float32Array {
  if (w <= 0 || h <= 0) throw new Error("empty image");
  // 1. Bounding box of ink
  let minX = w, minY = h, maxX = -1, maxY = -1, sum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      if (v > 0.08) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sum += v;
      }
    }
  }
  const out = new Float32Array(DIGIT_PIXELS);
  if (maxX < 0 || sum === 0) return out; // blank input → all zeros

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // 2. Scale so the longest box side becomes 20px
  const scale = 20 / Math.max(bw, bh);
  const tw = Math.max(1, Math.round(bw * scale));
  const th = Math.max(1, Math.round(bh * scale));

  // Area-average downsample (or nearest-upsample for small strokes)
  const small = new Float32Array(tw * th);
  for (let ty2 = 0; ty2 < th; ty2++) {
    for (let tx2 = 0; tx2 < tw; tx2++) {
      if (scale < 1) {
        // average over the source block
        const sx0 = minX + (tx2 / scale);
        const sy0 = minY + (ty2 / scale);
        const sx1 = minX + ((tx2 + 1) / scale);
        const sy1 = minY + ((ty2 + 1) / scale);
        let acc = 0, n = 0;
        for (let sy = Math.floor(sy0); sy < Math.min(h, Math.ceil(sy1)); sy++) {
          for (let sx = Math.floor(sx0); sx < Math.min(w, Math.ceil(sx1)); sx++) {
            acc += gray[sy * w + sx];
            n++;
          }
        }
        small[ty2 * tw + tx2] = n ? acc / n : 0;
      } else {
        const sx = Math.min(w - 1, Math.round(minX + tx2 / scale));
        const sy = Math.min(h - 1, Math.round(minY + ty2 / scale));
        small[ty2 * tw + tx2] = gray[sy * w + sx];
      }
    }
  }

  // 3. Center of mass of the small image
  let cx = 0, cy = 0, mass = 0;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const v = small[y * tw + x];
      cx += x * v;
      cy += y * v;
      mass += v;
    }
  }
  if (mass === 0) return out;
  cx /= mass;
  cy /= mass;

  // 4. Stamp into the 28x28 field with a sub-pixel offset so the ink
  //    COM lands exactly at (14, 14) — bilinear sample at (x - offX,
  //    y - offY) where off = 14 - COM. This avoids the ±0.5px drift a
  //    plain integer shift produces.
  const offX = 14 - cx;
  const offY = 14 - cy;
  const sample = (fx: number, fy: number): number => {
    if (fx < -1 || fy < -1 || fx > tw || fy > th) return 0;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const dx = fx - x0, dy = fy - y0;
    const at = (xx: number, yy: number) =>
      xx >= 0 && xx < tw && yy >= 0 && yy < th ? small[yy * tw + xx] : 0;
    const top = at(x0, y0) * (1 - dx) + at(x0 + 1, y0) * dx;
    const bottom = at(x0, y0 + 1) * (1 - dx) + at(x0 + 1, y0 + 1) * dx;
    return top * (1 - dy) + bottom * dy;
  };
  for (let y = 0; y < DIGIT_SIZE; y++) {
    const fy = y - offY;
    for (let x = 0; x < DIGIT_SIZE; x++) {
      const v = sample(x - offX, fy);
      const idx = y * DIGIT_SIZE + x;
      if (v > out[idx]) out[idx] = v;
    }
  }
  return out;
}

/** ASCII preview of a 784-vector — used by tests and the misclassification inspector. */
export function digitToAscii(px: ArrayLike<number>): string {
  const chars = " .:-=+*#%@";
  let out = "";
  for (let y = 0; y < DIGIT_SIZE; y++) {
    for (let x = 0; x < DIGIT_SIZE; x++) {
      const v = px[y * DIGIT_SIZE + x];
      out += chars[Math.min(9, Math.floor(v * 9.99))];
    }
    out += "\n";
  }
  return out;
}

// ---------------------------------------------------------------------
// CNN model spec for the digits demo
// ---------------------------------------------------------------------

/**
 * Small CNN — fast enough to train ~8 epochs on ~800 samples in WebGL
 * in under a minute, accurate (>90%) on the clean synthetic digits.
 */
export const DIGITS_MODEL_SPEC: ModelSpec = {
  layers: [
    { type: "conv2d", filters: 8, kernelSize: 3, activation: "relu", inputShape: [28, 28, 1] },
    { type: "maxPooling2d", poolSize: 2 },
    { type: "conv2d", filters: 16, kernelSize: 3, activation: "relu" },
    { type: "maxPooling2d", poolSize: 2 },
    { type: "flatten" },
    { type: "dense", units: 32, activation: "relu" },
    { type: "dense", units: 10, activation: "softmax" },
  ],
  optimizer: "adam",
  learningRate: 0.005,
  loss: "categoricalCrossentropy",
  metrics: ["accuracy"],
};

// ---------------------------------------------------------------------
// Demo dataset wrapper (plugs into the Phase 50 playground picker)
// ---------------------------------------------------------------------

function oneHot10(label: number): number[] {
  const row = new Array(10).fill(0);
  row[label] = 1;
  return row;
}

/**
 * The playground-facing digits demo: 800 training + 200 held-out
 * samples, drawn with a different seed so the confusion matrix reflects
 * generalization rather than memorization.
 */
export const DIGITS_DEMO: DemoDataset = {
  id: "digits",
  name: "Synthetic Digits (MNIST-style)",
  description: "800 procedurally drawn 28×28 digits (0-9) with rotation/scale jitter, plus 200 held-out for evaluation. Train a real CNN, then draw your own digits to test it.",
  inputShape: [28, 28, 1],
  outputShape: [10],
  loss: "categoricalCrossentropy",
  modelSpec: DIGITS_MODEL_SPEC,
  recommendedEpochs: 8,
  recommendedBatchSize: 32,
  generateData: async () => {
    const ds = generateDigitDataset(800, 42);
    return { xs: ds.xs, ys: ds.labels.map(oneHot10), featureNames: ["pixel_0_0 … pixel_27_27"] };
  },
  generateEvalData: async () => {
    const ds = generateDigitDataset(200, 424242);
    return { xs: ds.xs, ys: ds.labels.map(oneHot10) };
  },
};
