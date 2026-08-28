/**
 * Graph Spec Validator + Auto-Corrector — Phase 44 / hardened in Phase 45
 *
 * The AI often generates graph specs with mistakes:
 *   - Wrong type (e.g. "function" for scatter data)
 *   - Missing required fields (e.g. no "points" array in scatter)
 *   - Wrong field names (e.g. "data" instead of "points")
 *   - Placeholder data (e.g. using template values instead of user's data)
 *   - Invalid JSON (truncated, extra commas, etc.)
 *   - Inverted or zero-span ranges (e.g. xRange: [5, -5] or [0, 0])
 *   - Broken math expressions (e.g. "2x" — implicit mult not supported)
 *   - Type aliases (e.g. "line" or "linechart" instead of "function")
 *
 * This module validates and auto-corrects graph specs before they reach
 * the renderer. If a spec can't be fixed, it returns null (and the graph
 * is skipped — better to show no graph than a wrong one).
 */

import { isValidExpression } from "./safe-math";

export type ValidationResult = {
  valid: boolean;
  correctedSpec: any | null;
  errors: string[];
  warnings: string[];
};

// Maximum number of points/rows/series entries we accept. Spec exceeding this
// is truncated (the renderer would be unusably slow with 100k points anyway).
const MAX_POINTS = 5000;
const MAX_CATEGORIES = 200;
const MAX_BINS = 500;

// Type aliases — the AI sometimes uses non-canonical type strings. Map them
// to the canonical graph type before running the type-specific validator.
const TYPE_ALIASES: Record<string, string> = {
  line: "function",
  linechart: "function",
  linegraph: "function",
  curve: "function",
  chart: "bar",
  barchart: "bar",
  bargraph: "bar",
  column: "bar",
  columnchart: "bar",
  scatterplot: "scatter",
  scattergraph: "scatter",
  xyplot: "scatter",
  piechart: "pie",
  piegraph: "pie",
  circlechart: "pie",
  venn3: "venn",
  vennDiagram: "venn",
  numberLine: "numberline",
  probabilityTree: "tree",
  decisiontree: "tree",
  treeDiagram: "tree",
  networkgraph: "network",
  graph: "network",
  vectorDiagram: "vector",
  slopeField: "slopefield",
  stemandleaf: "stemleaf",
  stemLeaf: "stemleaf",
  stemplot: "stemleaf",
  frequencyPolygon: "frequency_polygon",
  argandDiagram: "argand",
  vectorField: "vectorfield",
  unitCircle: "unitcircle",
  twoWayTable: "twoway",
  crosstab: "twoway",
  contigency: "twoway",
  er: "erdiagram",
  erd: "erdiagram",
  entityrelation: "erdiagram",
  table: "csv",
  spreadsheet: "csv",
  worksheet: "csv",
  stepSolver: "steps",
  stepbystep: "steps",
  solution: "steps",
};

/**
 * Coerce a value to a finite number, falling back to `defaultValue` if NaN/Infinity.
 */
function toFiniteNum(v: any, defaultValue: number = 0): number {
  if (typeof v === "number") return isFinite(v) ? v : defaultValue;
  if (typeof v === "string") {
    const n = Number(v);
    return isFinite(n) ? n : defaultValue;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return defaultValue;
}

/**
 * Validate a 2-element [min, max] range and auto-correct:
 *   - Missing → defaults
 *   - min > max → swap them
 *   - min === max → pad to a non-zero span
 */
function validateRange(range: any, defaults: [number, number], warnings: string[], label: string): [number, number] {
  if (!Array.isArray(range) || range.length !== 2) {
    warnings.push(`${label}: auto-added default range [${defaults[0]}, ${defaults[1]}]`);
    return defaults;
  }
  let min = toFiniteNum(range[0], defaults[0]);
  let max = toFiniteNum(range[1], defaults[1]);
  if (min > max) {
    warnings.push(`${label}: range [${min}, ${max}] was inverted — swapped`);
    [min, max] = [max, min];
  }
  if (min === max) {
    warnings.push(`${label}: range had zero span — padded to ±1 around ${min}`);
    min -= 1;
    max += 1;
  }
  return [min, max];
}

/**
 * Truncate an array to MAX_POINTS (or other cap) and warn if it was truncated.
 */
function capArray<T>(arr: T[], cap: number, label: string, warnings: string[]): T[] {
  if (arr.length > cap) {
    warnings.push(`${label}: array had ${arr.length} entries — truncated to ${cap}`);
    return arr.slice(0, cap);
  }
  return arr;
}

/**
 * Validate and auto-correct a graph spec.
 * Returns { valid, correctedSpec, errors, warnings }.
 */
export function validateAndCorrectGraphSpec(spec: any): ValidationResult {
  if (!spec || typeof spec !== "object") {
    return { valid: false, correctedSpec: null, errors: ["Invalid spec: not an object"], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  // Deep clone so we never mutate the caller's spec object
  let corrected = JSON.parse(JSON.stringify(spec));

  // Apply type aliases first
  if (corrected.type && TYPE_ALIASES[corrected.type]) {
    const canonical = TYPE_ALIASES[corrected.type];
    warnings.push(`Auto-corrected: type "${corrected.type}" → "${canonical}"`);
    corrected.type = canonical;
  }

  // Field rename: AI often uses "data" where the renderer expects "points".
  // (This is the failure mode explicitly called out in the header comment.)
  if (!corrected.points && Array.isArray(corrected.data)) {
    // Heuristic: only rename if the spec type expects "points" and not "data"
    const typesExpectingPoints = ["scatter", "argand", "axes3d", "frequency_polygon", "ogive"];
    if (typesExpectingPoints.includes(corrected.type) || (!corrected.type && Array.isArray(corrected.data) && corrected.data[0] && Array.isArray(corrected.data[0]))) {
      corrected.points = corrected.data;
      delete corrected.data;
      warnings.push(`Auto-corrected: renamed "data" → "points"`);
    }
  }

  // Ensure type field exists
  if (!corrected.type) {
    // Try to infer type from field names
    if (Array.isArray(corrected.points)) corrected.type = "scatter";
    else if (Array.isArray(corrected.categories) && Array.isArray(corrected.values)) corrected.type = "bar";
    else if (Array.isArray(corrected.slices)) corrected.type = "pie";
    else if (Array.isArray(corrected.sets)) corrected.type = "venn";
    else if (corrected.expr) corrected.type = "function";
    else if (Array.isArray(corrected.nodes) && Array.isArray(corrected.edges)) corrected.type = "network";
    else if (corrected.angle !== undefined) corrected.type = "unitcircle";
    else if (Array.isArray(corrected.headers) && Array.isArray(corrected.rows)) corrected.type = "csv";
    else if (Array.isArray(corrected.tables)) corrected.type = "erdiagram";
    else if (Array.isArray(corrected.steps)) corrected.type = "steps";
    else if (corrected.svg) corrected.type = "freeform";
    else if (corrected.knotType) corrected.type = "knot";
    else if (corrected.tile) corrected.type = "tessellation";
    else {
      errors.push("Missing 'type' field and could not infer from other fields");
      return { valid: false, correctedSpec: null, errors, warnings };
    }
    warnings.push(`Auto-corrected: added type="${corrected.type}" (inferred from fields)`);
  }

  // Type-specific validation + correction
  switch (corrected.type) {
    case "function": {
      if (!corrected.expr || typeof corrected.expr !== "string") {
        errors.push("function spec missing 'expr' field");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Validate the expression parses cleanly via mathjs — catches "2x" (no implicit
      // mult in old evaluator was a silent killer), broken syntax, etc.
      if (!isValidExpression(corrected.expr, "x")) {
        warnings.push(`function: expression "${corrected.expr.slice(0, 40)}" failed to parse — graph may be empty`);
      }
      corrected.xRange = validateRange(corrected.xRange, [-5, 5], warnings, "function.xRange");
      corrected.yRange = validateRange(corrected.yRange, [-25, 25], warnings, "function.yRange");
      if (!corrected.title) corrected.title = `y = ${corrected.expr}`;
      break;
    }

    case "scatter": {
      if (!Array.isArray(corrected.points)) {
        errors.push("scatter spec missing 'points' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (corrected.points.length === 0) {
        errors.push("scatter spec has empty points array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      corrected.points = capArray(corrected.points, MAX_POINTS, "scatter.points", warnings);
      // Validate each point is [number, number] — preserve NaN as 0 (with warning)
      let badCount = 0;
      corrected.points = corrected.points.map((p: any, i: number) => {
        if (Array.isArray(p) && p.length >= 2) {
          const x = toFiniteNum(p[0], 0);
          const y = toFiniteNum(p[1], 0);
          if (!isFinite(p[0]) || !isFinite(p[1])) badCount++;
          return [x, y];
        }
        warnings.push(`Point ${i} is not [x, y] — using [0, 0]`);
        return [0, 0];
      });
      if (badCount > 0) warnings.push(`scatter: ${badCount} point(s) had non-finite coordinates — coerced to 0`);
      break;
    }

    case "bar": {
      if (!Array.isArray(corrected.categories) || !Array.isArray(corrected.values)) {
        errors.push("bar spec missing 'categories' or 'values' arrays");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (corrected.categories.length !== corrected.values.length) {
        warnings.push(`categories (${corrected.categories.length}) and values (${corrected.values.length}) have different lengths — truncating to shorter`);
        const minLen = Math.min(corrected.categories.length, corrected.values.length);
        corrected.categories = corrected.categories.slice(0, minLen);
        corrected.values = corrected.values.slice(0, minLen);
      }
      corrected.categories = capArray(corrected.categories, MAX_CATEGORIES, "bar.categories", warnings);
      corrected.values = corrected.values.slice(0, corrected.categories.length);
      // Coerce values to finite numbers
      corrected.values = corrected.values.map((v: any) => toFiniteNum(v, 0));
      break;
    }

    case "histogram": {
      // Histogram case was missing in Phase 44 — adding now.
      if (!Array.isArray(corrected.bins) || corrected.bins.length === 0) {
        errors.push("histogram spec missing 'bins' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      corrected.bins = capArray(corrected.bins, MAX_BINS, "histogram.bins", warnings);
      // Ensure each bin has {label, count} or {range, count} structure
      corrected.bins = corrected.bins.map((b: any, i: number) => {
        if (!b || typeof b !== "object") return { label: `Bin ${i + 1}`, count: 0 };
        const count = toFiniteNum(b.count, 0);
        if (b.label) return { label: String(b.label), count };
        if (Array.isArray(b.range) && b.range.length === 2) {
          return { label: `${toFiniteNum(b.range[0], 0)}–${toFiniteNum(b.range[1], 0)}`, count };
        }
        return { label: `Bin ${i + 1}`, count };
      });
      break;
    }

    case "pie": {
      if (!Array.isArray(corrected.slices) || corrected.slices.length === 0) {
        errors.push("pie spec missing 'slices' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      corrected.slices = capArray(corrected.slices, MAX_CATEGORIES, "pie.slices", warnings);
      // Ensure each slice has label + value
      corrected.slices = corrected.slices.map((s: any, i: number) => {
        if (!s || typeof s !== "object") return { label: `Slice ${i + 1}`, value: 1 };
        return {
          label: s.label ? String(s.label) : `Slice ${i + 1}`,
          value: toFiniteNum(s.value, 1),
          color: s.color,
        };
      });
      break;
    }

    case "venn": {
      if (!Array.isArray(corrected.sets) || corrected.sets.length < 2) {
        errors.push("venn spec needs at least 2 sets");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Ensure each set has label + values
      corrected.sets = corrected.sets.map((s: any, i: number) => ({
        label: s?.label ? String(s.label) : `Set ${String.fromCharCode(65 + i)}`,
        values: Array.isArray(s?.values) ? s.values : [],
      }));
      break;
    }

    case "numberline": {
      corrected.range = validateRange(corrected.range, [-10, 10], warnings, "numberline.range");
      if (corrected.point !== undefined) {
        corrected.point = toFiniteNum(corrected.point, 0);
      }
      if (Array.isArray(corrected.points)) {
        corrected.points = corrected.points.map((p: any) => toFiniteNum(p, 0));
      }
      break;
    }

    case "tree": {
      if (!corrected.root || typeof corrected.root !== "object") {
        errors.push("tree spec missing 'root' node");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!Array.isArray(corrected.root.children)) corrected.root.children = [];
      if (!corrected.root.label) corrected.root.label = "Root";
      break;
    }

    case "network": {
      if (!Array.isArray(corrected.nodes) || corrected.nodes.length === 0) {
        errors.push("network spec missing 'nodes' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!Array.isArray(corrected.edges)) corrected.edges = [];
      // Ensure each node has id + label; detect duplicate ids
      const seenIds = new Set<string>();
      corrected.nodes = corrected.nodes.map((n: any, i: number) => {
        const id = n?.id ? String(n.id) : `n${i}`;
        if (seenIds.has(id)) {
          warnings.push(`network: duplicate node id "${id}" — renumbered to n${i}`);
          return { ...n, id: `n${i}`, label: n?.label ? String(n.label) : `Node ${i + 1}` };
        }
        seenIds.add(id);
        return { ...n, id, label: n?.label ? String(n.label) : `Node ${i + 1}` };
      });
      break;
    }

    case "vector": {
      if (!Array.isArray(corrected.vectors) || corrected.vectors.length === 0) {
        errors.push("vector spec missing 'vectors' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Ensure each vector has from + to (or magnitude + angle)
      corrected.vectors = corrected.vectors.map((v: any, i: number) => {
        if (!v || typeof v !== "object") return { from: [0, 0], to: [1, 0], label: `v${i + 1}` };
        const from = Array.isArray(v.from) ? v.from.map((x: any) => toFiniteNum(x, 0)) : [0, 0];
        const to = Array.isArray(v.to) ? v.to.map((x: any) => toFiniteNum(x, 0)) : [from[0] + 1, from[1]];
        return { ...v, from, to, label: v.label ? String(v.label) : `v${i + 1}` };
      });
      break;
    }

    case "polygon": {
      if (!Array.isArray(corrected.vertices) || corrected.vertices.length < 3) {
        errors.push("polygon spec needs at least 3 vertices");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      corrected.vertices = corrected.vertices.map((v: any) =>
        Array.isArray(v) ? [toFiniteNum(v[0], 0), toFiniteNum(v[1], 0)] : [0, 0]
      );
      break;
    }

    case "boxplot": {
      if (!Array.isArray(corrected.datasets) || corrected.datasets.length === 0) {
        errors.push("boxplot spec missing 'datasets' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Validate each dataset: {label, min, q1, median, q3, max} — all numbers, ordered
      corrected.datasets = corrected.datasets.map((d: any, i: number) => {
        if (!d || typeof d !== "object") {
          warnings.push(`boxplot: dataset ${i} invalid — replaced with zeros`);
          return { label: `Box ${i + 1}`, min: 0, q1: 0, median: 0, q3: 0, max: 0 };
        }
        const min = toFiniteNum(d.min, 0);
        const q1 = toFiniteNum(d.q1, min);
        const median = toFiniteNum(d.median, q1);
        const q3 = toFiniteNum(d.q3, median);
        const max = toFiniteNum(d.max, q3);
        // Enforce ordering min ≤ q1 ≤ median ≤ q3 ≤ max
        const ordered = [min, q1, median, q3, max].sort((a, b) => a - b);
        if (ordered[0] !== min || ordered[4] !== max) {
          warnings.push(`boxplot: dataset ${i} had inconsistent min/q1/median/q3/max — auto-ordered`);
        }
        return {
          label: d.label ? String(d.label) : `Box ${i + 1}`,
          min: ordered[0],
          q1: ordered[1],
          median: ordered[2],
          q3: ordered[3],
          max: ordered[4],
        };
      });
      break;
    }

    case "slopefield": {
      if (!corrected.expr || typeof corrected.expr !== "string") {
        errors.push("slopefield spec missing 'expr' field");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Validate the bivariate expression
      if (!isValidExpression(corrected.expr, "x", "y")) {
        warnings.push(`slopefield: expression "${corrected.expr.slice(0, 40)}" failed to parse — field may be empty`);
      }
      corrected.xRange = validateRange(corrected.xRange, [-5, 5], warnings, "slopefield.xRange");
      corrected.yRange = validateRange(corrected.yRange, [-5, 5], warnings, "slopefield.yRange");
      break;
    }

    case "stemleaf": {
      if (!Array.isArray(corrected.data) || corrected.data.length === 0) {
        errors.push("stemleaf spec missing 'data' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      corrected.data = capArray(corrected.data, MAX_POINTS, "stemleaf.data", warnings);
      corrected.data = corrected.data.map((d: any) => toFiniteNum(d, 0));
      break;
    }

    case "frequency_polygon":
    case "ogive": {
      // Both types accept either `points` or `bins`
      if (!Array.isArray(corrected.points) && !Array.isArray(corrected.bins)) {
        errors.push(`${corrected.type} spec needs 'points' or 'bins'`);
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (Array.isArray(corrected.points)) {
        corrected.points = capArray(corrected.points, MAX_BINS, `${corrected.type}.points`, warnings);
      }
      if (Array.isArray(corrected.bins)) {
        corrected.bins = capArray(corrected.bins, MAX_BINS, `${corrected.type}.bins`, warnings);
      }
      break;
    }

    case "freeform": {
      if (!corrected.svg || typeof corrected.svg !== "string") {
        errors.push("freeform spec missing 'svg' field");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Clamp width/height to reasonable bounds (≤ 2000px) — huge SVGs break layout
      corrected.width = Math.min(2000, Math.max(100, toFiniteNum(corrected.width, 480)));
      corrected.height = Math.min(2000, Math.max(100, toFiniteNum(corrected.height, 360)));
      break;
    }

    case "argand": {
      if (!Array.isArray(corrected.points) || corrected.points.length === 0) {
        errors.push("argand spec missing 'points' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Each point: { re, im, label?, color? } — coerce re/im to numbers
      corrected.points = corrected.points.map((p: any, i: number) => {
        if (Array.isArray(p) && p.length >= 2) {
          return { re: toFiniteNum(p[0], 0), im: toFiniteNum(p[1], 0), label: p[2] ? String(p[2]) : `z${i + 1}` };
        }
        return {
          re: toFiniteNum(p?.re, 0),
          im: toFiniteNum(p?.im, 0),
          label: p?.label ? String(p.label) : `z${i + 1}`,
          color: p?.color,
        };
      });
      corrected.range = validateRange(corrected.range, [-5, 5], warnings, "argand.range");
      break;
    }

    case "contour": {
      if (!Array.isArray(corrected.levels) || corrected.levels.length === 0) {
        errors.push("contour spec missing 'levels' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Each level: { level: number, points?: [[x,y],...] }
      corrected.levels = corrected.levels.map((lvl: any, i: number) => {
        if (!lvl || typeof lvl !== "object") return { level: i + 1, points: [] };
        const level = toFiniteNum(lvl.level, i + 1);
        const pts = Array.isArray(lvl.points)
          ? lvl.points.map((p: any) =>
              Array.isArray(p) ? [toFiniteNum(p[0], 0), toFiniteNum(p[1], 0)] : [0, 0]
            )
          : [];
        return { level, points: pts };
      });
      break;
    }

    case "vectorfield": {
      if (!corrected.exprP && !Array.isArray(corrected.vectors)) {
        errors.push("vectorfield spec needs 'exprP/exprQ' or 'vectors'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (corrected.exprP) {
        if (!isValidExpression(corrected.exprP, "x", "y")) {
          warnings.push(`vectorfield: exprP "${String(corrected.exprP).slice(0, 40)}" failed to parse`);
        }
        if (!corrected.exprQ) corrected.exprQ = "0";
        if (!isValidExpression(corrected.exprQ, "x", "y")) {
          warnings.push(`vectorfield: exprQ "${String(corrected.exprQ).slice(0, 40)}" failed to parse`);
        }
      }
      corrected.range = validateRange(corrected.range, [-3, 3], warnings, "vectorfield.range");
      break;
    }

    case "tessellation": {
      if (!corrected.tile || !["hexagon", "triangle", "square"].includes(corrected.tile)) {
        corrected.tile = "hexagon";
        warnings.push("tessellation: tile set to 'hexagon' (default)");
      }
      if (!corrected.cols) corrected.cols = 6;
      if (!corrected.rows) corrected.rows = 5;
      if (!corrected.tileSize) corrected.tileSize = 50;
      break;
    }

    case "knot": {
      if (!corrected.knotType || !["trefoil", "figure8", "unknot"].includes(corrected.knotType)) {
        corrected.knotType = "trefoil";
      }
      break;
    }

    case "pictogram": {
      if (!Array.isArray(corrected.categories) || !Array.isArray(corrected.values)) {
        errors.push("pictogram spec missing 'categories' or 'values'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (corrected.categories.length !== corrected.values.length) {
        const minLen = Math.min(corrected.categories.length, corrected.values.length);
        corrected.categories = corrected.categories.slice(0, minLen);
        corrected.values = corrected.values.slice(0, minLen);
        warnings.push(`pictogram: truncated to ${minLen} entries`);
      }
      if (!corrected.symbol) corrected.symbol = "●";
      if (!corrected.symbolValue) corrected.symbolValue = 1;
      corrected.values = corrected.values.map((v: any) => toFiniteNum(v, 0));
      break;
    }

    case "tally": {
      if (!Array.isArray(corrected.categories) || !Array.isArray(corrected.counts)) {
        errors.push("tally spec missing 'categories' or 'counts'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (corrected.categories.length !== corrected.counts.length) {
        const minLen = Math.min(corrected.categories.length, corrected.counts.length);
        corrected.categories = corrected.categories.slice(0, minLen);
        corrected.counts = corrected.counts.slice(0, minLen);
      }
      corrected.counts = corrected.counts.map((c: any) => toFiniteNum(c, 0));
      break;
    }

    case "carroll": {
      // Carroll diagram — 2x2 grid with row label (e.g. "is red?") and col label (e.g. "is square?")
      if (!corrected.rowLabel) corrected.rowLabel = "Property A";
      if (!corrected.colLabel) corrected.colLabel = "Property B";
      if (!corrected.cells || typeof corrected.cells !== "object") corrected.cells = {};
      // Ensure all 4 cells exist with arrays
      const keys = ["yesYes", "yesNo", "noYes", "noNo"];
      for (const k of keys) {
        if (!Array.isArray(corrected.cells[k])) corrected.cells[k] = [];
      }
      break;
    }

    case "unitcircle": {
      if (corrected.angle === undefined) corrected.angle = 45;
      corrected.angle = toFiniteNum(corrected.angle, 45);
      break;
    }

    case "transform": {
      if (!Array.isArray(corrected.original) || corrected.original.length < 3) {
        errors.push("transform spec missing 'original' vertices (need ≥3)");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!corrected.transformType || !["reflect", "rotate", "translate", "dilate"].includes(corrected.transformType)) {
        corrected.transformType = "reflect";
        warnings.push("transform: type set to 'reflect' (default)");
      }
      corrected.original = corrected.original.map((v: any) =>
        Array.isArray(v) ? [toFiniteNum(v[0], 0), toFiniteNum(v[1], 0)] : [0, 0]
      );
      break;
    }

    case "axes3d": {
      if (!Array.isArray(corrected.points)) corrected.points = [];
      corrected.points = capArray(corrected.points, MAX_POINTS, "axes3d.points", warnings);
      // Each point: [x, y, z] — coerce to numbers, default to 0
      corrected.points = corrected.points.map((p: any) =>
        Array.isArray(p)
          ? [toFiniteNum(p[0], 0), toFiniteNum(p[1], 0), toFiniteNum(p[2] ?? 0, 0)]
          : [0, 0, 0]
      );
      corrected.range = validateRange(corrected.range, [-3, 3], warnings, "axes3d.range");
      // Warn if user asked for axes3d but provided no points (renderer draws an empty box)
      if (corrected.points.length === 0) {
        warnings.push("axes3d: no points provided — renderer will show empty coordinate box");
      }
      break;
    }

    case "twoway": {
      if (!Array.isArray(corrected.rowLabels) || !Array.isArray(corrected.colLabels)) {
        errors.push("twoway spec missing 'rowLabels' or 'colLabels'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!Array.isArray(corrected.data)) {
        errors.push("twoway spec missing 'data' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Validate that data is a 2D array matching rowLabels × colLabels dimensions
      if (corrected.data.length !== corrected.rowLabels.length) {
        warnings.push(`twoway: data has ${corrected.data.length} rows but rowLabels has ${corrected.rowLabels.length} — truncated`);
        corrected.data = corrected.data.slice(0, corrected.rowLabels.length);
      }
      corrected.data = corrected.data.map((row: any) => {
        if (!Array.isArray(row)) return corrected.colLabels.map(() => 0);
        return corrected.colLabels.map((_: any, j: number) => toFiniteNum(row[j], 0));
      });
      break;
    }

    case "erdiagram": {
      if (!Array.isArray(corrected.tables) || corrected.tables.length === 0) {
        errors.push("erdiagram spec missing 'tables' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Ensure each table has fields array
      const tableIds = new Set<string>();
      corrected.tables = corrected.tables.map((t: any, i: number) => {
        if (!t || typeof t !== "object") return { id: `t${i}`, name: `Table ${i + 1}`, fields: [] };
        const id = t.id ? String(t.id) : `t${i}`;
        if (tableIds.has(id)) warnings.push(`erdiagram: duplicate table id "${id}" — renumbered`);
        tableIds.add(id);
        return {
          ...t,
          id,
          name: t.name ? String(t.name) : `Table ${i + 1}`,
          fields: Array.isArray(t.fields) ? t.fields.map((f: any) =>
            typeof f === "string" ? { name: f, type: "string" } : { name: f?.name ?? "field", type: f?.type ?? "string", pk: !!f?.pk }
          ) : [],
        };
      });
      if (!Array.isArray(corrected.relationships)) corrected.relationships = [];
      break;
    }

    case "csv": {
      if (!Array.isArray(corrected.headers) || !Array.isArray(corrected.rows)) {
        errors.push("csv spec missing 'headers' or 'rows'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      corrected.rows = capArray(corrected.rows, MAX_POINTS, "csv.rows", warnings);
      // Ensure each row has the right number of cells
      corrected.rows = corrected.rows.map((r: any) => {
        if (!Array.isArray(r)) return corrected.headers.map(() => "");
        return corrected.headers.map((_: any, j: number) => (r[j] !== undefined ? String(r[j]) : ""));
      });
      break;
    }

    case "steps": {
      if (!Array.isArray(corrected.steps) || corrected.steps.length === 0) {
        errors.push("steps spec missing 'steps' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Ensure each step is a string
      corrected.steps = corrected.steps.map((s: any, i: number) => {
        if (typeof s === "string") return s;
        if (s && typeof s === "object" && s.text) return String(s.text);
        return `Step ${i + 1}`;
      });
      break;
    }

    default:
      warnings.push(`Unknown graph type: ${corrected.type} — rendering as-is`);
      break;
  }

  // Ensure title exists
  if (!corrected.title) {
    corrected.title = String(corrected.type).charAt(0).toUpperCase() + String(corrected.type).slice(1);
    warnings.push(`Auto-corrected: added title="${corrected.title}"`);
  }

  return {
    valid: errors.length === 0,
    correctedSpec: errors.length === 0 ? corrected : null,
    errors,
    warnings,
  };
}

/**
 * Detect whether a raw reply text likely contains a graph spec — used by the
 * proof engine and other pre-render checks to decide whether to surface
 * "graph missing" warnings.
 */
export function hasGraphSpec(reply: string): boolean {
  if (!reply) return false;
  // mathgraph block
  if (/```mathgraph\s*[\s\S]*?```/i.test(reply)) return true;
  // Any fenced code block whose body looks like {"type":"..."}
  const blocks = reply.match(/```[\w-]*\s*([\s\S]*?)```/g) ?? [];
  for (const b of blocks) {
    if (/"type"\s*:\s*"(function|scatter|bar|histogram|pie|venn|numberline|tree|network|vector|polygon|boxplot|slopefield|stemleaf|frequency_polygon|freeform|argand|contour|vectorfield|tessellation|knot|pictogram|tally|carroll|ogive|unitcircle|transform|axes3d|twoway|erdiagram|csv|steps)"/i.test(b)) {
      return true;
    }
  }
  // Inline JSON-looking text
  if (/\{\s*"(?:type|title)"\s*:\s*"[^"]*"\s*,/i.test(reply)) return true;
  return false;
}
