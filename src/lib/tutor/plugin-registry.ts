/**
 * Plugin Registry — Phase AC2
 *
 * Developer-controlled registry of approved learning tool plugins.
 *
 * INVARIANTS:
 *   1. Only developer-approved plugins enter this registry. The AI cannot
 *      provide a module path, package name, JS to execute, remote plugin URL,
 *      or React component.
 *   2. Each plugin is keyed by its stable ID ("graph.bar", "diagram.flowchart", etc.).
 *   3. Lookups fail safely with `unsupported` if a plugin is missing or disabled.
 *   4. The registry is loaded once at module init; runtime lookups are O(1).
 *
 * NOT WIRED INTO CHAT FLOW YET — see TUTOR_PLUGIN_FRAMEWORK_ENABLED flag.
 */

import type { LearningToolManifest, ToolCategory } from "./plugin-types";

// ============================================================
// Initial manifest set (5 plugins, matching advisor's recommendation)
// ============================================================

export const GRAPH_BAR_MANIFEST: LearningToolManifest = {
  id: "graph.bar",
  version: 1,
  category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: false,
    save: true,
    offline: true,
  },
  searchTerms: [
    "bar graph",
    "bar chart",
    "column chart",
    "compare values",
    "frequency by category",
    "compare class scores",
    "visualize rainfall",
  ],
  inputRequirements: ["categories", "numeric values"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const DIAGRAM_FLOWCHART_MANIFEST: LearningToolManifest = {
  id: "diagram.flowchart",
  version: 1,
  category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: false,
    save: true,
    offline: true,
  },
  searchTerms: [
    "flowchart",
    "process diagram",
    "decision flow",
    "workflow",
    "algorithm process",
    "login flow",
    "program lifecycle",
  ],
  inputRequirements: ["nodes", "edges"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const CODE_PYTHON_MANIFEST: LearningToolManifest = {
  id: "code.python",
  version: 1,
  category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: true,
    save: true,
    offline: false,
  },
  searchTerms: [
    "python",
    "run python",
    "py",
    "execute python",
    "python script",
    "python code",
  ],
  inputRequirements: ["code"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const CODE_JAVASCRIPT_MANIFEST: LearningToolManifest = {
  id: "code.javascript",
  version: 1,
  category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: {
    render: true,
    edit: true,
    execute: true,
    save: true,
    offline: true,
  },
  searchTerms: [
    "javascript",
    "js",
    "run javascript",
    "node",
    "node.js",
    "js code",
    "browser script",
  ],
  inputRequirements: ["code"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const ASSESSMENT_QUIZ_MANIFEST: LearningToolManifest = {
  id: "assessment.quiz",
  version: 1,
  category: "assessment",
  supportedActions: ["create", "modify", "run", "review"],
  capabilities: {
    render: true,
    edit: true,
    execute: false,
    save: true,
    offline: true,
  },
  searchTerms: [
    "quiz",
    "test me",
    "multiple choice",
    "mcq",
    "check my understanding",
    "practice questions",
  ],
  inputRequirements: ["questions", "answer choices"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

// ============================================================
// Registry — manifest map + lookups
// ============================================================

// --- Code & Development ---
const CODE_HTML_MANIFEST: LearningToolManifest = {
  id: "code.html", version: 1, category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["web", "html", "css", "website", "webpage", "web page", "web builder", "frontend"],
  inputRequirements: ["html", "css", "javascript"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

const CODE_SQL_MANIFEST: LearningToolManifest = {
  id: "code.sql", version: 1, category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["sql", "database", "query", "sqlite", "select", "table", "schema"],
  inputRequirements: ["sql statements"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

const CODE_C_MANIFEST: LearningToolManifest = {
  id: "code.c", version: 1, category: "code",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["c", "c++", "cpp", "c program", "c code"],
  inputRequirements: ["code"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const CODE_JSON_MANIFEST: LearningToolManifest = {
  id: "code.json", version: 1, category: "code",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["json", "data", "csv", "spreadsheet", "dataset", "table"],
  inputRequirements: ["data"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

// --- Diagrams & Visualization ---
const GRAPH_FUNCTION_MANIFEST: LearningToolManifest = {
  id: "graph.function", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["function", "plot", "y=", "f(x)", "equation graph", "curve", "parabola"],
  inputRequirements: ["function expression"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const GRAPH_SCATTER_MANIFEST: LearningToolManifest = {
  id: "graph.scatter", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["scatter", "data points", "plot points", "line of best fit", "correlation"],
  inputRequirements: ["x,y points"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const DIAGRAM_CONCEPT_MAP_MANIFEST: LearningToolManifest = {
  id: "diagram.concept-map", version: 1, category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["concept map", "mind map", "relationship", "network graph", "knowledge graph"],
  inputRequirements: ["nodes", "edges"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

const DIAGRAM_CIRCUIT_MANIFEST: LearningToolManifest = {
  id: "diagram.circuit", version: 1, category: "simulation",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["circuit", "electrical", "battery", "switch", "bulb", "lamp", "ohm", "resistor", "voltage"],
  inputRequirements: ["circuit components"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

const DIAGRAM_GEAR_MANIFEST: LearningToolManifest = {
  id: "diagram.gear", version: 1, category: "simulation",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["gear", "gear train", "gear ratio", "mechanical", "torque", "speed ratio"],
  inputRequirements: ["gears"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

const DIAGRAM_NETWORK_TOPO_MANIFEST: LearningToolManifest = {
  id: "diagram.network", version: 1, category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["network topology", "lan", "wan", "router", "switch", "ip", "subnet"],
  inputRequirements: ["network nodes", "links"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

const DIAGRAM_NGINX_MANIFEST: LearningToolManifest = {
  id: "diagram.nginx", version: 1, category: "simulation",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["nginx", "server config", "reverse proxy", "load balancer", "web server"],
  inputRequirements: ["nginx config"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

const DIAGRAM_PLC_MANIFEST: LearningToolManifest = {
  id: "diagram.plc", version: 1, category: "simulation",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["plc", "ladder logic", "ladder diagram", "programmable logic controller"],
  inputRequirements: ["ladder rungs"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

// --- Drawing ---
const DRAWING_FREEHAND_MANIFEST: LearningToolManifest = {
  id: "drawing.freehand", version: 1, category: "drawing",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["draw", "sketch", "freehand", "drawing canvas", "illustrate"],
  inputRequirements: ["prompt"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const DRAWING_SCENE_MANIFEST: LearningToolManifest = {
  id: "drawing.scene", version: 1, category: "drawing",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["diagram", "labeled diagram", "construction", "geometry", "illustration"],
  inputRequirements: ["elements"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

// --- Assessment ---
const ASSESSMENT_FLASHCARDS_MANIFEST: LearningToolManifest = {
  id: "assessment.flashcards", version: 1, category: "assessment",
  supportedActions: ["create", "modify", "run", "review"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["flashcards", "flash cards", "study cards", "spaced repetition", "review cards"],
  inputRequirements: ["cards"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const ASSESSMENT_EXAM_MANIFEST: LearningToolManifest = {
  id: "assessment.exam", version: 1, category: "assessment",
  supportedActions: ["create", "review"],
  capabilities: { render: true, edit: false, execute: false, save: true, offline: true },
  searchTerms: ["exam", "test paper", "past paper", "kcse", "mock exam", "printable exam"],
  inputRequirements: ["topic", "numQuestions"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const ASSESSMENT_DRAW_TASK_MANIFEST: LearningToolManifest = {
  id: "assessment.draw-task", version: 1, category: "assessment",
  supportedActions: ["create", "review"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["draw task", "drawing exercise", "construct", "sketch exercise"],
  inputRequirements: ["prompt", "expectedKeywords"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

// --- Math & Science ---
const MATH_MANIPULATIVE_MANIFEST: LearningToolManifest = {
  id: "math.manipulative", version: 1, category: "graph",
  supportedActions: ["create", "modify", "run"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["manipulative", "fractions", "division", "equal groups", "drag and drop", "counting"],
  inputRequirements: ["totalCount", "basketCount"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const MATH_CALCULATOR_MANIFEST: LearningToolManifest = {
  id: "math.calculator", version: 1, category: "code",
  supportedActions: ["run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: false, offline: true },
  searchTerms: ["calculator", "calculate", "compute", "math", "solve"],
  inputRequirements: ["expression"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

// --- Business ---
const BUSINESS_SPREADSHEET_MANIFEST: LearningToolManifest = {
  id: "business.spreadsheet", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["spreadsheet", "excel", "worksheet", "csv", "data table", "budget"],
  inputRequirements: ["columns", "rows"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const BUSINESS_ERDIAGRAM_MANIFEST: LearningToolManifest = {
  id: "business.erdiagram", version: 1, category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["er diagram", "entity relationship", "database schema", "database design", "tables"],
  inputRequirements: ["tables", "relationships"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

// --- Server & DevOps ---
const SERVER_SHELL_MANIFEST: LearningToolManifest = {
  id: "server.shell", version: 1, category: "code",
  supportedActions: ["create", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["linux", "bash", "shell", "terminal", "command line", "nginx", "docker", "systemctl"],
  inputRequirements: ["commands"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

// --- Writing ---
const WRITING_NOTEBOOK_MANIFEST: LearningToolManifest = {
  id: "writing.notebook", version: 1, category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: false },
  searchTerms: ["notebook", "jupyter", "data analysis", "python notebook", "data science"],
  inputRequirements: ["cells"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

// --- Quick wins: existing renderers, now registered ---
const GRAPH_VENN_MANIFEST: LearningToolManifest = {
  id: "graph.venn", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["venn diagram", "sets", "union", "intersection", "overlap", "disjoint"],
  inputRequirements: ["sets"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const GRAPH_NUMBER_LINE_MANIFEST: LearningToolManifest = {
  id: "graph.number-line", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["number line", "inequality", "integers", "less than", "greater than", "x <"],
  inputRequirements: ["ranges"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const GRAPH_BOXPLOT_MANIFEST: LearningToolManifest = {
  id: "graph.box-plot", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["box plot", "box and whisker", "quartile", "outlier", "five number summary", "median"],
  inputRequirements: ["values"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const GRAPH_TREE_MANIFEST: LearningToolManifest = {
  id: "graph.tree", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["tree diagram", "probability tree", "decision tree", "outcome tree", "branch"],
  inputRequirements: ["nodes", "branches"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const CODE_DOCKER_MANIFEST: LearningToolManifest = {
  id: "code.docker", version: 1, category: "simulation",
  supportedActions: ["create", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["docker", "container", "dockerfile", "docker-compose", "image", "build", "compose"],
  inputRequirements: ["dockerfile or commands"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

// --- 8 critical new plugins ---
export const WRITING_COMPOSITION_MANIFEST: LearningToolManifest = {
  id: "writing.composition", version: 1, category: "writing",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["essay", "report", "composition", "writing", "assignment", "article", "paragraph"],
  inputRequirements: ["prompt"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const DIAGRAM_TIMELINE_MANIFEST: LearningToolManifest = {
  id: "diagram.timeline", version: 1, category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["timeline", "chronology", "history", "sequence of events", "lifecycle", "project schedule"],
  inputRequirements: ["events"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const MATH_GEOMETRY_MANIFEST: LearningToolManifest = {
  id: "math.geometry", version: 1, category: "graph",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["geometry", "construction", "compass", "triangle", "circle", "angle", "bisector", "perpendicular"],
  inputRequirements: ["shapes"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const SCIENCE_PHYSICS_MANIFEST: LearningToolManifest = {
  id: "science.physics-sim", version: 1, category: "simulation",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["pendulum", "projectile", "motion", "force", "velocity", "acceleration", "physics simulation", "free fall"],
  inputRequirements: ["simulation type", "parameters"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

export const SCIENCE_CHEMISTRY_MANIFEST: LearningToolManifest = {
  id: "science.chemistry-sim", version: 1, category: "simulation",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["molecule", "chemical reaction", "atom", "bond", "compound", "element", "periodic table"],
  inputRequirements: ["atoms", "bonds"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

export const DIAGRAM_FREE_BODY_MANIFEST: LearningToolManifest = {
  id: "diagram.free-body", version: 1, category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["free body diagram", "force diagram", "vector", "tension", "normal force", "friction", "gravity"],
  inputRequirements: ["body", "forces"],
  availability: { enabled: true, supportedPlatforms: ["web"] },
};

export const BUSINESS_FINANCIAL_MANIFEST: LearningToolManifest = {
  id: "business.financial", version: 1, category: "code",
  supportedActions: ["create", "modify", "run", "inspect"],
  capabilities: { render: true, edit: true, execute: true, save: true, offline: true },
  searchTerms: ["npv", "irr", "compound interest", "simple interest", "break-even", "breakeven", "financial calculator", "investment"],
  inputRequirements: ["calcType", "values"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

export const DIAGRAM_ANATOMY_MANIFEST: LearningToolManifest = {
  id: "diagram.anatomy", version: 1, category: "diagram",
  supportedActions: ["create", "modify", "inspect"],
  capabilities: { render: true, edit: true, execute: false, save: true, offline: true },
  searchTerms: ["anatomy", "body", "organ", "skeleton", "muscle", "heart", "brain", "cell", "system", "human body"],
  inputRequirements: ["labels"],
  availability: { enabled: true, supportedPlatforms: ["web", "mobile"] },
};

const ALL_MANIFESTS: LearningToolManifest[] = [
  // Original 5
  GRAPH_BAR_MANIFEST,
  DIAGRAM_FLOWCHART_MANIFEST,
  CODE_PYTHON_MANIFEST,
  CODE_JAVASCRIPT_MANIFEST,
  ASSESSMENT_QUIZ_MANIFEST,
  // Phase 6 — 23 new plugins (existing components registered)
  CODE_HTML_MANIFEST,
  CODE_SQL_MANIFEST,
  CODE_C_MANIFEST,
  CODE_JSON_MANIFEST,
  GRAPH_FUNCTION_MANIFEST,
  GRAPH_SCATTER_MANIFEST,
  DIAGRAM_CONCEPT_MAP_MANIFEST,
  DIAGRAM_CIRCUIT_MANIFEST,
  DIAGRAM_GEAR_MANIFEST,
  DIAGRAM_NETWORK_TOPO_MANIFEST,
  DIAGRAM_NGINX_MANIFEST,
  DIAGRAM_PLC_MANIFEST,
  DRAWING_FREEHAND_MANIFEST,
  DRAWING_SCENE_MANIFEST,
  ASSESSMENT_FLASHCARDS_MANIFEST,
  ASSESSMENT_EXAM_MANIFEST,
  ASSESSMENT_DRAW_TASK_MANIFEST,
  MATH_MANIPULATIVE_MANIFEST,
  MATH_CALCULATOR_MANIFEST,
  BUSINESS_SPREADSHEET_MANIFEST,
  BUSINESS_ERDIAGRAM_MANIFEST,
  SERVER_SHELL_MANIFEST,
  WRITING_NOTEBOOK_MANIFEST,
  // Quick wins — existing renderers registered
  GRAPH_VENN_MANIFEST,
  GRAPH_NUMBER_LINE_MANIFEST,
  GRAPH_BOXPLOT_MANIFEST,
  GRAPH_TREE_MANIFEST,
  CODE_DOCKER_MANIFEST,
  // 8 critical new plugins
  WRITING_COMPOSITION_MANIFEST,
  DIAGRAM_TIMELINE_MANIFEST,
  MATH_GEOMETRY_MANIFEST,
  SCIENCE_PHYSICS_MANIFEST,
  SCIENCE_CHEMISTRY_MANIFEST,
  DIAGRAM_FREE_BODY_MANIFEST,
  BUSINESS_FINANCIAL_MANIFEST,
  DIAGRAM_ANATOMY_MANIFEST,
];

const MANIFEST_MAP: ReadonlyMap<string, LearningToolManifest> = new Map(
  ALL_MANIFESTS.map((m) => [m.id, m]),
);

// ============================================================
// Public API
// ============================================================

/** Look up a manifest by plugin ID. Returns null if missing or disabled. */
export function getManifest(pluginId: string): LearningToolManifest | null {
  const m = MANIFEST_MAP.get(pluginId);
  if (!m) return null;
  if (!m.availability.enabled) return null;
  return m;
}

/** Return all enabled manifests. */
export function listEnabledManifests(): LearningToolManifest[] {
  return ALL_MANIFESTS.filter((m) => m.availability.enabled);
}

/** Return enabled manifests for a category. */
export function listManifestsByCategory(category: ToolCategory): LearningToolManifest[] {
  return ALL_MANIFESTS.filter(
    (m) => m.availability.enabled && m.category === category,
  );
}

/** True if a plugin ID is registered AND enabled. */
export function isPluginAvailable(pluginId: string): boolean {
  return getManifest(pluginId) !== null;
}

/** True if a plugin supports a given action. False if plugin is missing or disabled. */
export function pluginSupportsAction(pluginId: string, action: string): boolean {
  const m = getManifest(pluginId);
  if (!m) return false;
  return m.supportedActions.includes(action as any);
}

/**
 * Filter a candidate list down to enabled plugins that support the action.
 * Used by the AI shortlist step — the AI may suggest plugin IDs that don't
 * exist or aren't enabled; this filters them out safely.
 */
export function filterCandidates(
  candidateIds: string[],
  action: string,
): LearningToolManifest[] {
  const seen = new Set<string>();
  const result: LearningToolManifest[] = [];
  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const m = getManifest(id);
    if (m && m.supportedActions.includes(action as any)) {
      result.push(m);
    }
  }
  return result;
}

/** Returns all plugin IDs (for admin tooling only — never expose to the learner). */
export function listAllPluginIds(): string[] {
  return ALL_MANIFESTS.map((m) => m.id);
}

/** Stable list of categories that have at least one enabled manifest. */
export function listEnabledCategories(): ToolCategory[] {
  const seen = new Set<ToolCategory>();
  for (const m of ALL_MANIFESTS) {
    if (m.availability.enabled) seen.add(m.category);
  }
  return Array.from(seen);
}
