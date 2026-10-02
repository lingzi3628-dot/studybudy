/**
 * Flowchart Validator + Normalizer — Phase FC
 *
 * Validates and normalizes a semantic flowchart plan from the AI.
 * The AI provides nodes + edges (meaning) — NEVER coordinates.
 * Geometry is computed by compileFlowchartLayout().
 *
 * This is a pure function — no AI calls, no DB, no side effects.
 * Fully unit-testable.
 *
 * Canonical format:
 * {
 *   type: "flowchart_v1",
 *   schemaVersion: 1,
 *   title: "How Rain Forms",
 *   direction: "top_to_bottom",
 *   nodes: [{ id, label, shape }],
 *   edges: [{ id, from, to, label? }]
 * }
 *
 * The AI must NOT supply x, y, width, height, svg, html, or any coordinates.
 */

export type FlowchartNodeShape = "rectangle" | "rounded_rectangle" | "diamond" | "terminator";
export type FlowchartDirection = "top_to_bottom" | "left_to_right";

export type FlowchartNode = {
  id: string;
  label: string;
  shape: FlowchartNodeShape;
};

export type FlowchartEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type FlowchartPlan = {
  type: "flowchart_v1";
  schemaVersion: 1;
  title: string;
  direction: FlowchartDirection;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
};

export type FlowchartValidationResult = {
  valid: boolean;
  plan: FlowchartPlan | null;
  errors: string[];
  warnings: string[];
};

// ============================================================
// Limits (conservative for low-end devices)
// ============================================================

const MAX_NODES = 30;
const MAX_EDGES = 50;
const MAX_LABEL_LENGTH = 80;
const MAX_TITLE_LENGTH = 120;
const MAX_EDGE_LABEL_LENGTH = 40;

// ============================================================
// Type aliases for shape normalization
// ============================================================

const SHAPE_ALIASES: Record<string, FlowchartNodeShape> = {
  rect: "rectangle",
  box: "rectangle",
  square: "rectangle",
  rounded: "rounded_rectangle",
  roundedrect: "rounded_rectangle",
  rounded_rectangle: "rounded_rectangle",
  pill: "rounded_rectangle",
  stadium: "rounded_rectangle",
  decision: "diamond",
  rhombus: "diamond",
  condition: "diamond",
  oval: "diamond", // close enough for normalization
  start: "terminator",
  end: "terminator",
  terminal: "terminator",
  startend: "terminator",
};

const DIRECTION_ALIASES: Record<string, FlowchartDirection> = {
  tb: "top_to_bottom",
  top_down: "top_to_bottom",
  topdown: "top_to_bottom",
  vertical: "top_to_bottom",
  lr: "left_to_right",
  left_right: "left_to_right",
  horizontal: "left_to_right",
};

// ============================================================
// Main: validate + normalize
// ============================================================

export function validateFlowchartPlan(raw: any): FlowchartValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { valid: false, plan: null, errors: ["Invalid spec: not an object"], warnings };
  }

  // Type check — must be exactly "flowchart_v1"
  if (raw.type !== "flowchart_v1") {
    return { valid: false, plan: null, errors: [`Expected type "flowchart_v1", got "${raw.type}"`], warnings };
  }

  // Schema version — must be 1
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== undefined) {
    warnings.push(`schemaVersion ${raw.schemaVersion} — normalizing to 1`);
  }

  // Title — bound the length
  const title = typeof raw.title === "string" ? raw.title.slice(0, MAX_TITLE_LENGTH) : "Flowchart";

  // Direction — normalize aliases
  let direction: FlowchartDirection = "top_to_bottom";
  if (typeof raw.direction === "string") {
    const dirLower = raw.direction.toLowerCase().trim();
    if (DIRECTION_ALIASES[dirLower]) {
      direction = DIRECTION_ALIASES[dirLower];
    } else if (dirLower === "top_to_bottom" || dirLower === "left_to_right") {
      direction = dirLower;
    } else {
      warnings.push(`Unknown direction "${raw.direction}" — defaulting to top_to_bottom`);
    }
  }

  // ---- Reject coordinates from AI ----
  // The AI must NOT supply x, y, width, height, svg, html, or coordinates.
  // Check top-level fields
  const FORBIDDEN_TOP = ["x", "y", "width", "height", "svg", "html", "css", "javascript", "style"];
  for (const field of FORBIDDEN_TOP) {
    if (raw[field] !== undefined) {
      errors.push(`AI supplied forbidden top-level field "${field}" — coordinates are computed by the layout engine, not the AI`);
    }
  }

  // ---- Nodes ----
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    return { valid: false, plan: null, errors: ["flowchart requires a non-empty 'nodes' array"], warnings };
  }

  if (raw.nodes.length > MAX_NODES) {
    warnings.push(`nodes array had ${raw.nodes.length} entries — truncated to ${MAX_NODES}`);
  }

  const nodeIds = new Set<string>();
  const nodes: FlowchartNode[] = [];

  for (let i = 0; i < Math.min(raw.nodes.length, MAX_NODES); i++) {
    const rawNode = raw.nodes[i];
    if (!rawNode || typeof rawNode !== "object") {
      warnings.push(`node[${i}] is not an object — skipped`);
      continue;
    }

    // ID — must be unique, generate one if missing
    let id = typeof rawNode.id === "string" ? rawNode.id.trim() : "";
    if (!id) {
      id = `node-${i}`;
      warnings.push(`node[${i}] had no id — generated "${id}"`);
    }
    if (nodeIds.has(id)) {
      warnings.push(`duplicate node id "${id}" — skipped`);
      continue;
    }
    nodeIds.add(id);

    // Reject coordinates on nodes
    for (const field of ["x", "y", "width", "height", "cx", "cy", "r"]) {
      if (rawNode[field] !== undefined) {
        warnings.push(`node "${id}" supplied "${field}" — ignored (layout engine computes positions)`);
      }
    }

    // Label — bound the length
    const label = typeof rawNode.label === "string"
      ? rawNode.label.slice(0, MAX_LABEL_LENGTH)
      : typeof rawNode.text === "string"
        ? rawNode.text.slice(0, MAX_LABEL_LENGTH)
        : id; // fallback to id if no label

    // Shape — normalize aliases
    let shape: FlowchartNodeShape = "rectangle";
    if (typeof rawNode.shape === "string") {
      const shapeLower = rawNode.shape.toLowerCase().trim();
      if (SHAPE_ALIASES[shapeLower]) {
        shape = SHAPE_ALIASES[shapeLower];
      } else if (["rectangle", "rounded_rectangle", "diamond", "terminator"].includes(shapeLower)) {
        shape = shapeLower as FlowchartNodeShape;
      } else {
        warnings.push(`node "${id}" has unknown shape "${rawNode.shape}" — defaulting to rectangle`);
      }
    }

    // Reject unsafe content
    if (typeof rawNode.svg === "string" || typeof rawNode.html === "string") {
      errors.push(`node "${id}" contains svg/html content — flowchart nodes must be semantic, not raw markup`);
    }

    nodes.push({ id, label, shape });
  }

  if (nodes.length === 0) {
    return { valid: false, plan: null, errors: ["No valid nodes after normalization"], warnings };
  }

  // ---- Edges ----
  const edges: FlowchartEdge[] = [];
  const edgeIds = new Set<string>();
  const edgeSet = new Set<string>(); // for dedup (from+to)

  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  for (let i = 0; i < Math.min(rawEdges.length, MAX_EDGES); i++) {
    const rawEdge = rawEdges[i];
    if (!rawEdge || typeof rawEdge !== "object") {
      continue;
    }

    const from = typeof rawEdge.from === "string" ? rawEdge.from.trim() : "";
    const to = typeof rawEdge.to === "string" ? rawEdge.to.trim() : "";

    // Validate endpoints refer to existing nodes
    if (!from || !nodeIds.has(from)) {
      warnings.push(`edge[${i}] has invalid "from" "${from}" — skipped`);
      continue;
    }
    if (!to || !nodeIds.has(to)) {
      warnings.push(`edge[${i}] has invalid "to" "${to}" — skipped`);
      continue;
    }

    // Dedup edges (same from + to)
    const edgeKey = `${from}->${to}`;
    if (edgeSet.has(edgeKey)) {
      warnings.push(`duplicate edge ${edgeKey} — skipped`);
      continue;
    }
    edgeSet.add(edgeKey);

    // Generate edge ID if missing
    let edgeId = typeof rawEdge.id === "string" ? rawEdge.id.trim() : "";
    if (!edgeId || edgeIds.has(edgeId)) {
      edgeId = `edge-${i}`;
    }
    edgeIds.add(edgeId);

    // Edge label (optional)
    const edgeLabel = typeof rawEdge.label === "string"
      ? rawEdge.label.slice(0, MAX_EDGE_LABEL_LENGTH)
      : undefined;

    edges.push({ id: edgeId, from, to, label: edgeLabel });
  }

  // ---- Reject unsafe top-level content ----
  if (typeof raw.svg === "string") {
    errors.push("raw SVG content is not allowed in flowchart_v1");
  }
  if (typeof raw.html === "string") {
    errors.push("raw HTML content is not allowed in flowchart_v1");
  }

  if (errors.length > 0) {
    return { valid: false, plan: null, errors, warnings };
  }

  const plan: FlowchartPlan = {
    type: "flowchart_v1",
    schemaVersion: 1,
    title,
    direction,
    nodes,
    edges,
  };

  return { valid: true, plan, errors: [], warnings };
}

// ============================================================
// Helper: detect cycles in the flowchart (used by layout compiler)
// ============================================================

export function hasCycle(plan: FlowchartPlan): boolean {
  const adj = new Map<string, string[]>();
  for (const node of plan.nodes) {
    adj.set(node.id, []);
  }
  for (const edge of plan.edges) {
    adj.get(edge.from)?.push(edge.to);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (stack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    stack.add(nodeId);
    for (const neighbor of adj.get(nodeId) ?? []) {
      if (dfs(neighbor)) return true;
    }
    stack.delete(nodeId);
    return false;
  }

  for (const node of plan.nodes) {
    if (dfs(node.id)) return true;
  }
  return false;
}

// ============================================================
// Helper: compute layers (topological levels for layout)
// ============================================================

export function computeLayers(plan: FlowchartPlan): string[][] {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of plan.nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of plan.edges) {
    adj.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  // Kahn's algorithm for topological sort → layers
  const layers: string[][] = [];
  let queue = plan.nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id);

  if (queue.length === 0) {
    // All nodes have in-edges → cycle. Fallback: put all in one layer.
    return [plan.nodes.map(n => n.id)];
  }

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: string[] = [];
    for (const nodeId of queue) {
      for (const neighbor of adj.get(nodeId) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) nextQueue.push(neighbor);
      }
    }
    queue = nextQueue;
  }

  // Any nodes not assigned (part of a cycle) → add to last layer
  const assigned = new Set(layers.flat());
  const unassigned = plan.nodes.filter(n => !assigned.has(n.id)).map(n => n.id);
  if (unassigned.length > 0) {
    layers.push(unassigned);
  }

  return layers;
}
