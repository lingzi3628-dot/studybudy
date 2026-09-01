/**
 * CSV Dataset Pipeline — Phase 57 (MLBuddy 2.0)
 *
 * Turns a pasted/uploaded CSV into normalized training tensors, fully
 * client-side. Generalizes the Phase 50 Housing demo logic:
 *
 *   parseCsv → profileColumns → buildTabularDataset → recommendModelSpec
 *
 * Handling rules:
 *   - Numeric features: missing values mean-imputed, z-score normalized
 *     (means/stds returned so the same transform can be reused at
 *     inference time).
 *   - Categorical (string) features: one-hot encoded, capped at 12
 *     levels — columns with more levels are dropped and reported.
 *   - Boolean features: 0/1.
 *   - Classification target: strings or few-unique integers → one-hot
 *     with sorted class names; everything else regresses with MSE.
 *   - Rows with a missing target are dropped (and counted).
 */

import type { ModelSpec } from "./ml-engine";

// ---------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------

export type CsvTable = { headers: string[]; rows: string[][] };

/**
 * RFC-4180-ish CSV parser: quoted fields with escaped quotes ("" → "),
 * comma and CRLF/LF handling, skips a trailing empty line. Cells are
 * trimmed. Rows shorter than the header are padded with "".
 */
export function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => { row.push(field.trim()); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => r.some((cell) => cell !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h, i) => (h === "" ? `column_${i + 1}` : h));
  const dataRows = nonEmpty.slice(1).map((r) => {
    const padded = r.slice(0, headers.length);
    while (padded.length < headers.length) padded.push("");
    return padded;
  });
  return { headers, rows: dataRows };
}

/**
 * Serialize a table back to CSV — used by the Notebook → Playground
 * bridge (dataframe table output → CSV → ML Playground).
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) lines.push(row.map(esc).join(","));
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// Profiling / dtype inference
// ---------------------------------------------------------------------

export type ColumnDtype = "number" | "string" | "boolean" | "empty";

export type ColumnProfile = {
  name: string;
  index: number;
  dtype: ColumnDtype;
  missing: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
  samples: string[];
};

const NUM_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const TRUE_SET = new Set(["true", "yes", "y", "1"]);
const FALSE_SET = new Set(["false", "no", "n", "0"]);

export function inferDtype(values: string[]): ColumnDtype {
  const nonEmpty = values.filter((v) => v !== "");
  if (nonEmpty.length === 0) return "empty";
  let numeric = 0, bool = 0;
  for (const v of nonEmpty) {
    if (NUM_RE.test(v)) numeric++;
    const lv = v.toLowerCase();
    if (TRUE_SET.has(lv) || FALSE_SET.has(lv)) bool++;
  }
  if (numeric === nonEmpty.length) return "number";
  if (bool === nonEmpty.length) return "boolean";
  return "string";
}

export function profileColumns(table: CsvTable): ColumnProfile[] {
  return table.headers.map((name, index) => {
    const values = table.rows.map((r) => r[index] ?? "");
    const missing = values.filter((v) => v === "").length;
    const dtype = inferDtype(values);
    const uniq = new Set(values.filter((v) => v !== "")).size;
    const profile: ColumnProfile = {
      name,
      index,
      dtype,
      missing,
      unique: uniq,
      samples: [...new Set(values.filter((v) => v !== ""))].slice(0, 3),
    };
    if (dtype === "number") {
      const nums = values.filter((v) => v !== "").map(Number);
      profile.min = Math.min(...nums);
      profile.max = Math.max(...nums);
      profile.mean = nums.reduce((s, v) => s + v, 0) / nums.length;
    }
    return profile;
  });
}

// ---------------------------------------------------------------------
// Tabular dataset builder
// ---------------------------------------------------------------------

export type TabularBuildOptions = {
  target: string;               // target column name (required)
  features?: string[];          // default: all other columns
  testSplit?: number;           // 0 - 0.5, default 0.2
  seed?: number;                // shuffle seed, default 42
  normalize?: boolean;          // z-score numeric features, default true
  maxOneHotLevels?: number;     // default 12
};

export type TabularDataset = {
  featureNames: string[];
  featureCount: number;
  isClassification: boolean;
  classNames?: string[];
  trainXs: number[][];
  trainYs: number[][];
  testXs: number[][];
  testYs: number[][];
  inputShape: number[];
  outputShape: number[];
  loss: string;
  /** z-score params per numeric feature (aligned with featureNames), null when not normalized */
  normalization: { means: number[]; stds: number[] } | null;
  /** dropped feature names + why (e.g. too many levels) */
  droppedFeatures: { name: string; reason: string }[];
  rowCount: number;             // usable rows (target present)
  droppedRows: number;          // rows removed for missing target
};

function oneHot(levels: string[], value: string): number[] {
  const row = new Array(levels.length).fill(0);
  const idx = levels.indexOf(value);
  if (idx >= 0) row[idx] = 1;
  return row;
}

export function buildTabularDataset(table: CsvTable, opts: TabularBuildOptions): TabularDataset {
  const {
    target,
    testSplit = 0.2,
    seed = 42,
    normalize = true,
    maxOneHotLevels = 12,
  } = opts;

  const targetIdx = table.headers.indexOf(target);
  if (targetIdx < 0) throw new Error(`Target column "${target}" not found in CSV`);
  if (table.rows.length < 10) throw new Error("Need at least 10 rows to train");

  // --- Resolve feature columns (default: everything except target)
  const requested = opts.features ?? table.headers.filter((h) => h !== target);
  const featureCols = requested
    .filter((h) => h !== target && table.headers.includes(h))
    .map((name) => ({ name, index: table.headers.indexOf(name) }));

  // --- Drop rows with missing target
  const usable = table.rows.filter((r) => (r[targetIdx] ?? "") !== "");
  const droppedRows = table.rows.length - usable.length;

  // --- Profile the target
  const targetValues = usable.map((r) => r[targetIdx]);
  const targetDtype = inferDtype(targetValues);
  const targetNum = targetValues.map(Number);
  const targetAllInts = targetDtype === "number" && targetNum.every((v) => Number.isInteger(v));
  const targetUniques = new Set(targetValues).size;

  // Classification when: strings/booleans, or integer-coded with few levels
  const isClassification =
    targetDtype === "string" ||
    targetDtype === "boolean" ||
    (targetAllInts && targetUniques <= maxOneHotLevels && targetUniques >= 2);

  // --- Build numeric feature vectors
  const featureNames: string[] = [];
  const normalization = { means: [] as number[], stds: [] as number[] };
  const droppedFeatures: { name: string; reason: string }[] = [];
  type Transform =
    | { kind: "numeric"; index: number; name: string }
    | { kind: "boolean"; index: number; name: string }
    | { kind: "onehot"; index: number; name: string; levels: string[] };

  const transforms: Transform[] = [];
  for (const col of featureCols) {
    const values = usable.map((r) => r[col.index] ?? "");
    const dtype = inferDtype(values);
    if (dtype === "empty") {
      droppedFeatures.push({ name: col.name, reason: "column is empty" });
      continue;
    }
    if (dtype === "number") {
      transforms.push({ kind: "numeric", index: col.index, name: col.name });
      featureNames.push(col.name);
    } else if (dtype === "boolean") {
      transforms.push({ kind: "boolean", index: col.index, name: col.name });
      featureNames.push(col.name);
    } else {
      const levels = [...new Set(values.filter((v) => v !== ""))].sort();
      if (levels.length > maxOneHotLevels) {
        droppedFeatures.push({ name: col.name, reason: `${levels.length} unique values (max ${maxOneHotLevels})` });
        continue;
      }
      transforms.push({ kind: "onehot", index: col.index, name: col.name, levels });
      for (const lv of levels) featureNames.push(`${col.name}=${lv}`);
    }
  }

  if (featureNames.length === 0) throw new Error("No usable feature columns found");

  // Raw per-row numeric vectors (pre-normalization) + imputation stats
  const rawRows: number[][] = usable.map((r) => {
    const vec: number[] = [];
    for (const t of transforms) {
      const v = (r[t.index] ?? "").trim();
      if (t.kind === "numeric") {
        vec.push(v === "" || !NUM_RE.test(v) ? NaN : Number(v));
      } else if (t.kind === "boolean") {
        vec.push(TRUE_SET.has(v.toLowerCase()) ? 1 : 0);
      } else {
        vec.push(...oneHot(t.levels, v));
      }
    }
    return vec;
  });

  // Mean-impute NaNs per column (computed over non-NaN values)
  const colCount = featureNames.length;
  const colMeans = new Array(colCount).fill(0);
  const colHas = new Array(colCount).fill(false);
  for (let c = 0; c < colCount; c++) {
    let sum = 0, n = 0;
    for (const row of rawRows) {
      const v = row[c];
      if (!Number.isNaN(v)) { sum += v; n++; }
    }
    if (n > 0) { colMeans[c] = sum / n; colHas[c] = true; }
  }
  for (const row of rawRows) {
    for (let c = 0; c < colCount; c++) {
      if (Number.isNaN(row[c])) row[c] = colHas[c] ? colMeans[c] : 0;
    }
  }

  // Z-score normalize the numeric transform columns
  const numericStarts = new Map<string, number>();
  let cursor = 0;
  for (const t of transforms) {
    if (t.kind === "numeric") numericStarts.set(t.name, cursor);
    cursor += t.kind === "onehot" ? t.levels.length : 1;
  }
  let normalizationOut: { means: number[]; stds: number[] } | null = null;
  if (normalize) {
    const means = new Array(colCount).fill(0);
    const stds = new Array(colCount).fill(1);
    for (const [name, start] of numericStarts) {
      const col = rawRows.map((r) => r[start]);
      const mean = col.reduce((s, v) => s + v, 0) / col.length;
      const std = Math.sqrt(col.reduce((s, v) => s + (v - mean) ** 2, 0) / col.length) || 1;
      means[start] = mean;
      stds[start] = std;
      for (const row of rawRows) row[start] = (row[start] - mean) / std;
    }
    normalizationOut = { means, stds };
  }

  // --- Encode the target
  let classNames: string[] | undefined;
  let ys: number[][];
  if (isClassification) {
    const levels = [...new Set(targetValues)].sort();
    classNames = levels;
    ys = targetValues.map((v) => oneHot(levels, v));
  } else {
    ys = targetValues.map((v) => [Number(v)]);
  }

  // --- Deterministic shuffle + split
  const indices = usable.map((_, i) => i);
  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const testCount = Math.min(
    Math.floor(usable.length * Math.max(0, Math.min(0.5, testSplit))),
    Math.floor(usable.length / 2)
  );
  const testIdx = indices.slice(0, testCount);
  const trainIdx = indices.slice(testCount);

  const pick = (idxs: number[], side: "x" | "y") =>
    idxs.map((i) => (side === "x" ? rawRows[i] : ys[i]));

  const loss = isClassification ? "categoricalCrossentropy" : "meanSquaredError";

  const outShape = isClassification ? (classNames as string[]).length : 1;

  return {
    featureNames,
    featureCount: colCount,
    isClassification,
    classNames,
    trainXs: pick(trainIdx, "x"),
    trainYs: pick(trainIdx, "y"),
    testXs: pick(testIdx, "x"),
    testYs: pick(testIdx, "y"),
    inputShape: [colCount],
    outputShape: [outShape],
    loss,
    normalization: normalizationOut,
    droppedFeatures,
    rowCount: usable.length,
    droppedRows,
  };
}

// ---------------------------------------------------------------------
// Model recommendation
// ---------------------------------------------------------------------

/**
 * A sensible starter dense net for a tabular dataset: width ramps with
 * feature count, softmax/sigmoid-free output (softmax handles both 1
 * and 2+ class one-hot shapes; linear for regression).
 */
export function recommendModelSpec(ds: TabularDataset): ModelSpec {
  const units = Math.min(64, Math.max(8, Math.round(ds.featureCount * 2)));
  const outputUnits = ds.outputShape[0];
  const layers: ModelSpec["layers"] = [
    { type: "dense", units, activation: "relu", inputShape: [ds.featureCount] },
    { type: "dense", units: Math.max(4, Math.round(units / 2)), activation: "relu" },
    {
      type: "dense",
      units: outputUnits,
      activation: ds.isClassification ? "softmax" : "linear",
    },
  ];
  return {
    layers,
    optimizer: "adam",
    learningRate: ds.isClassification ? 0.01 : 0.005,
    loss: ds.loss,
    metrics: ds.isClassification ? ["accuracy"] : ["mse"],
  };
}
