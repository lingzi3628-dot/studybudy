/**
 * Graph Spec Validator + Auto-Corrector — Phase 44
 *
 * The AI often generates graph specs with mistakes:
 *   - Wrong type (e.g. "function" for scatter data)
 *   - Missing required fields (e.g. no "points" array in scatter)
 *   - Wrong field names (e.g. "data" instead of "points")
 *   - Placeholder data (e.g. using template values instead of user's data)
 *   - Invalid JSON (truncated, extra commas, etc.)
 *
 * This module validates and auto-corrects graph specs before they reach
 * the renderer. If a spec can't be fixed, it returns null (and the graph
 * is skipped — better to show no graph than a wrong one).
 */

export type ValidationResult = {
  valid: boolean;
  correctedSpec: any | null;
  errors: string[];
  warnings: string[];
};

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
  let corrected = { ...spec };

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
    case "function":
      if (!corrected.expr) {
        errors.push("function spec missing 'expr' field");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!corrected.xRange) corrected.xRange = [-5, 5];
      if (!corrected.yRange) corrected.yRange = [-25, 25];
      if (!corrected.title) corrected.title = `y = ${corrected.expr}`;
      break;

    case "scatter":
      if (!Array.isArray(corrected.points)) {
        errors.push("scatter spec missing 'points' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (corrected.points.length === 0) {
        errors.push("scatter spec has empty points array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Validate each point is [number, number]
      corrected.points = corrected.points.map((p: any, i: number) => {
        if (Array.isArray(p) && p.length >= 2) {
          return [Number(p[0]) || 0, Number(p[1]) || 0];
        }
        warnings.push(`Point ${i} is not [x, y] — using [0, 0]`);
        return [0, 0];
      });
      break;

    case "bar":
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
      break;

    case "pie":
      if (!Array.isArray(corrected.slices) || corrected.slices.length === 0) {
        errors.push("pie spec missing 'slices' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Ensure each slice has label + value
      corrected.slices = corrected.slices.map((s: any, i: number) => {
        if (!s.label) s.label = `Slice ${i + 1}`;
        if (typeof s.value !== "number") s.value = Number(s.value) || 1;
        return s;
      });
      break;

    case "venn":
      if (!Array.isArray(corrected.sets) || corrected.sets.length < 2) {
        errors.push("venn spec needs at least 2 sets");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "numberline":
      if (!Array.isArray(corrected.range)) {
        corrected.range = [-10, 10];
        warnings.push("numberline: auto-added range [-10, 10]");
      }
      break;

    case "tree":
      if (!corrected.root) {
        errors.push("tree spec missing 'root' node");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Ensure root has children array
      if (!Array.isArray(corrected.root.children)) corrected.root.children = [];
      break;

    case "network":
      if (!Array.isArray(corrected.nodes)) {
        errors.push("network spec missing 'nodes' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!Array.isArray(corrected.edges)) corrected.edges = [];
      // Ensure each node has id + label
      corrected.nodes = corrected.nodes.map((n: any, i: number) => {
        if (!n.id) n.id = `n${i}`;
        if (!n.label) n.label = `Node ${i + 1}`;
        return n;
      });
      break;

    case "vector":
      if (!Array.isArray(corrected.vectors) || corrected.vectors.length === 0) {
        errors.push("vector spec missing 'vectors' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "polygon":
      if (!Array.isArray(corrected.vertices) || corrected.vertices.length < 3) {
        errors.push("polygon spec needs at least 3 vertices");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "boxplot":
      if (!Array.isArray(corrected.datasets) || corrected.datasets.length === 0) {
        errors.push("boxplot spec missing 'datasets' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "slopefield":
      if (!corrected.expr) {
        errors.push("slopefield spec missing 'expr' field");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!corrected.xRange) corrected.xRange = [-5, 5];
      if (!corrected.yRange) corrected.yRange = [-5, 5];
      break;

    case "stemleaf":
      if (!Array.isArray(corrected.data) || corrected.data.length === 0) {
        errors.push("stemleaf spec missing 'data' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "frequency_polygon":
      if (!Array.isArray(corrected.points) && !Array.isArray(corrected.bins)) {
        errors.push("frequency_polygon spec needs 'points' or 'bins'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "freeform":
      if (!corrected.svg || typeof corrected.svg !== "string") {
        errors.push("freeform spec missing 'svg' field");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!corrected.width) corrected.width = 480;
      if (!corrected.height) corrected.height = 360;
      break;

    case "argand":
      if (!Array.isArray(corrected.points) || corrected.points.length === 0) {
        errors.push("argand spec missing 'points' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "contour":
      if (!Array.isArray(corrected.levels) || corrected.levels.length === 0) {
        errors.push("contour spec missing 'levels' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "vectorfield":
      if (!corrected.exprP && !Array.isArray(corrected.vectors)) {
        errors.push("vectorfield spec needs 'exprP/exprQ' or 'vectors'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "tessellation":
      if (!corrected.tile) corrected.tile = "hexagon";
      if (!corrected.cols) corrected.cols = 6;
      if (!corrected.rows) corrected.rows = 5;
      if (!corrected.tileSize) corrected.tileSize = 50;
      break;

    case "knot":
      if (!corrected.knotType) corrected.knotType = "trefoil";
      break;

    case "pictogram":
      if (!Array.isArray(corrected.categories) || !Array.isArray(corrected.values)) {
        errors.push("pictogram spec missing 'categories' or 'values'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!corrected.symbol) corrected.symbol = "●";
      if (!corrected.symbolValue) corrected.symbolValue = 1;
      break;

    case "tally":
      if (!Array.isArray(corrected.categories) || !Array.isArray(corrected.counts)) {
        errors.push("tally spec missing 'categories' or 'counts'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "carroll":
      if (!corrected.cells) corrected.cells = {};
      break;

    case "ogive":
      if (!Array.isArray(corrected.points) && !Array.isArray(corrected.bins)) {
        errors.push("ogive spec needs 'points' or 'bins'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "unitcircle":
      if (corrected.angle === undefined) corrected.angle = 45;
      if (typeof corrected.angle === "string") corrected.angle = parseFloat(corrected.angle) || 45;
      break;

    case "transform":
      if (!Array.isArray(corrected.original)) {
        errors.push("transform spec missing 'original' vertices");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!corrected.transformType) corrected.transformType = "reflect";
      break;

    case "axes3d":
      if (!Array.isArray(corrected.points)) corrected.points = [];
      if (!corrected.range) corrected.range = [-3, 3];
      break;

    case "twoway":
      if (!Array.isArray(corrected.rowLabels) || !Array.isArray(corrected.colLabels)) {
        errors.push("twoway spec missing 'rowLabels' or 'colLabels'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      if (!Array.isArray(corrected.data)) {
        errors.push("twoway spec missing 'data' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "erdiagram":
      if (!Array.isArray(corrected.tables) || corrected.tables.length === 0) {
        errors.push("erdiagram spec missing 'tables' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      // Ensure each table has fields array
      corrected.tables = corrected.tables.map((t: any) => {
        if (!Array.isArray(t.fields)) t.fields = [];
        return t;
      });
      if (!corrected.relationships) corrected.relationships = [];
      break;

    case "csv":
      if (!Array.isArray(corrected.headers) || !Array.isArray(corrected.rows)) {
        errors.push("csv spec missing 'headers' or 'rows'");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    case "steps":
      if (!Array.isArray(corrected.steps) || corrected.steps.length === 0) {
        errors.push("steps spec missing 'steps' array");
        return { valid: false, correctedSpec: null, errors, warnings };
      }
      break;

    default:
      warnings.push(`Unknown graph type: ${corrected.type} — rendering as-is`);
      break;
  }

  // Ensure title exists
  if (!corrected.title) {
    corrected.title = corrected.type.charAt(0).toUpperCase() + corrected.type.slice(1);
    warnings.push(`Auto-corrected: added title="${corrected.title}"`);
  }

  return {
    valid: errors.length === 0,
    correctedSpec: errors.length === 0 ? corrected : null,
    errors,
    warnings,
  };
}
