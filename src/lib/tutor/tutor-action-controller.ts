/**
 * Tutor Action Controller — Phase AC2
 *
 * Parses the learner's message into a structured ConstraintEnvelope that
 * the ToolRouter uses to pick the right internal plugin.
 *
 * Three responsibilities:
 *   1. detectActionVerb() — what does the learner want to DO?
 *      (create / modify / inspect / run / review)
 *   2. detectCategoryAndType() — what KIND of artifact?
 *      (graph.bar, diagram.flowchart, code.python, etc.)
 *   3. buildConstraintEnvelope() — combine the above into the per-request
 *      constraint set the router enforces.
 *
 * Determinism: all detection is regex + intent-based. The AI is NOT consulted
 * by this controller. AI-assisted selection happens later, in the ToolRouter,
 * only when deterministic rules + workspace context can't decide.
 *
 * NOT WIRED INTO CHAT FLOW YET — see TUTOR_PLUGIN_FRAMEWORK_ENABLED flag.
 */

import type {
  ActionVerb,
  ConstraintEnvelope,
  ToolCategory,
  WorkspaceContext,
} from "./plugin-types";
import type { TutorIntents } from "../tutor-chat-engine";

// ============================================================
// Action verb detection
// ============================================================

const MODIFY_PATTERNS = [
  /\bchange\b/i, /\bupdate\b/i, /\bedit\b/i, /\bmodify\b/i, /\badjust\b/i,
  /\bmake (it|the|this)/i, /\breplace\b/i, /\brename\b/i, /\bremove\b/i,
  /\bswap\b/i, /\bmove\b/i, /\brecolor\b/i, /\brelabel\b/i, /\bfix\b/i,
];

const INSPECT_PATTERNS = [
  /\bexplain (this|the|what)/i, /\bwhat is (this|the)/i,
  /\bdescribe\b/i, /\btell me about\b/i, /\bwhy\b/i, /\bhow does\b/i,
  /\bwhat does\b/i, /\bwhat's (in|on|the)/i, /\bshow me\b/i,
  /\bwhat('?s| is) (the|its)\b/i,
];

const RUN_PATTERNS = [
  /\brun\b/i, /\bexecute\b/i, /\bplay\b/i, /\bstart\b/i, /\blaunch\b/i,
  /\btry it\b/i, /\btest it\b/i, /\bcompile\b/i,
];

const REVIEW_PATTERNS = [
  /\bcheck my (answer|work|solution)/i, /\bgrade\b/i, /\bsubmit\b/i,
  /\bam i right\b/i, /\bis this correct\b/i, /\breview my\b/i,
];

const CREATE_PATTERNS = [
  /\bcreate\b/i, /\bmake\b/i, /\bdraw\b/i, /\bsketch\b/i, /\billustrat/i,
  /\bvisuali[sz]e\b/i, /\bbuild\b/i, /\bgenerate\b/i, /\bdesign\b/i,
  /\bplot\b/i, /\bchart\b/i, /\bgraph\b/i, /\bquiz me\b/i, /\btest me\b/i,
];

/**
 * Detect the action verb from the learner's message. Order matters:
 * inspect/modify/run/review come BEFORE create because phrases like
 * "change Diana to 8" or "explain this graph" should not be misread as
 * create-new.
 */
export function detectActionVerb(userMessage: string): ActionVerb {
  const msg = userMessage.trim();
  if (!msg) return "create"; // safe default for empty input

  if (REVIEW_PATTERNS.some((re) => re.test(msg))) return "review";
  if (RUN_PATTERNS.some((re) => re.test(msg))) return "run";
  if (MODIFY_PATTERNS.some((re) => re.test(msg))) return "modify";
  if (INSPECT_PATTERNS.some((re) => re.test(msg))) return "inspect";
  if (CREATE_PATTERNS.some((re) => re.test(msg))) return "create";

  // Default: assume create. Short follow-ups like "why" / "how" already match
  // INSPECT_PATTERNS above, so we don't need a length-based heuristic here.
  return "create";
}

// ============================================================
// Category + requestedType detection
// ============================================================

/**
 * Map intent + message to a { category, requestedType } pair.
 * requestedType is the user-facing word (bar, pie, flowchart, python, etc.).
 * category is the registry-level family (graph, diagram, code, assessment).
 *
 * Returns null for category if the message doesn't indicate any of the
 * supported plugin families.
 */
export function detectCategoryAndType(opts: {
  userMessage: string;
  intents: TutorIntents;
}): { category: ToolCategory | null; requestedType: string | null } {
  const { userMessage, intents } = opts;

  // --- graph family (ordered by specificity) ---
  if (intents.wantsBar) return { category: "graph", requestedType: "bar" };
  if (intents.wantsHistogram) return { category: "graph", requestedType: "histogram" };
  if (intents.wantsPie) return { category: "graph", requestedType: "pie" };
  if (intents.wantsScatter) return { category: "graph", requestedType: "scatter" };
  if (intents.wantsFunctionPlot) return { category: "graph", requestedType: "function" };
  if (detectWantsLineGraph(userMessage)) return { category: "graph", requestedType: "line" };
  if (intents.wantsVenn) return { category: "graph", requestedType: "venn" };
  if (intents.wantsNumberLine) return { category: "graph", requestedType: "numberline" };
  if (intents.wantsTree) return { category: "graph", requestedType: "tree" };
  if (intents.wantsBoxPlot) return { category: "graph", requestedType: "boxplot" };
  if (intents.wantsVector) return { category: "graph", requestedType: "vector" };
  if (intents.wantsPolygon) return { category: "graph", requestedType: "polygon" };
  if (intents.wantsCSV) return { category: "graph", requestedType: "csv" };
  if (intents.wantsERDiagram) return { category: "graph", requestedType: "erdiagram" };

  // --- diagram family ---
  if (/\bflowchart\b|\bprocess diagram\b|\bdecision flow\b|\bflow.?chart\b/i.test(userMessage)) {
    const fcEnabled = (process.env.TUTOR_FLOWCHART_GENERATION_ENABLED ?? "false")
      .toLowerCase().trim();
    if (fcEnabled === "true" || fcEnabled === "1" || fcEnabled === "on") {
      return { category: "diagram", requestedType: "flowchart" };
    }
  }
  if (intents.wantsConceptMap) return { category: "diagram", requestedType: "concept_map" };
  if (intents.wantsNetwork) return { category: "diagram", requestedType: "network" };

  // --- code family ---
  if (/\bpython\b|\bpy\b(?!\w)/i.test(userMessage)) {
    return { category: "code", requestedType: "python" };
  }
  if (/\bjavascript\b|\bjs\b(?!\w)/i.test(userMessage)) {
    return { category: "code", requestedType: "javascript" };
  }
  if (/\btypescript\b|\bts\b(?!\w)/i.test(userMessage)) {
    return { category: "code", requestedType: "typescript" };
  }
  if (/\bhtml\b|\bcss\b|\bweb\s*page\b|\bwebpage\b|\bwebsite\b/i.test(userMessage)) {
    return { category: "code", requestedType: "web" };
  }
  if (/\bc\b(?!\w)/i.test(userMessage) && /\bcode\b|\bprogram\b|\brun\b/i.test(userMessage)) {
    return { category: "code", requestedType: "c" };
  }
  // Generic "code" / "program" / "script" without a specific language —
  // routes to the code category with no specific type. The router will
  // use AI classification on the shortlist [code.python, code.javascript].
  if (/\bcode\b|\bprogram\b|\bscript\b/i.test(userMessage)) {
    return { category: "code", requestedType: null };
  }

  // --- assessment family ---
  if (/\bquiz\b|\btest me\b|\bquiz me\b|\bmcq\b|\bmultiple choice\b/i.test(userMessage) ||
      intents.wantsSteps === false && /\bpractice\b|\bcheck my\b/i.test(userMessage)) {
    return { category: "assessment", requestedType: "quiz" };
  }
  if (/\bflashcards?\b/i.test(userMessage)) {
    return { category: "assessment", requestedType: "flashcards" };
  }
  if (/\bexam\b|\bpast paper\b/i.test(userMessage)) {
    return { category: "assessment", requestedType: "exam" };
  }

  // --- 8 critical new plugins (Phase 6) ---
  // Checked BEFORE the wantsDrawing fallthrough so that specific requests like
  // "draw a timeline" or "construct a perpendicular bisector" route to the
  // right plugin, not to drawing.scene. Generic "draw me a picture" still
  // falls through to drawing.scene below.
  if (/\bessay\b|\bcomposition\b|\barticle\b|\bwrite (?:me )?(?:an? )?(?:essay|report|article|composition)\b/i.test(userMessage)) {
    return { category: "writing", requestedType: "essay" };
  }
  if (/\breport\b|\bassignment\b/i.test(userMessage)) {
    return { category: "writing", requestedType: "report" };
  }
  if (/\btimeline\b|\bchronology\b|\bsequence of events\b/i.test(userMessage)) {
    return { category: "diagram", requestedType: "timeline" };
  }
  // Geometry — must come AFTER wantsPolygon check above so a generic "polygon"
  // prompt still routes to graph.bar. Only fires when the learner explicitly
  // says "geometry", "construction", or "compass".
  if (/\bgeometry\b|\bcompass (?:and )?(?:straightedge|construction)\b|\bperpendicular bisector\b|\bangle bisector\b|\bconstruct (?:an? )?\b/i.test(userMessage)) {
    return { category: "graph", requestedType: "geometry" };
  }
  if (/\bpendulum\b|\bprojectile\b|\bfree fall\b|\bfree-fall\b|\bphysics sim(?:ulation)?\b/i.test(userMessage)) {
    return { category: "simulation", requestedType: "pendulum" };
  }
  if (/\bmolecule\b|\bchemical reaction\b|\batoms? and bonds?\b/i.test(userMessage)) {
    return { category: "simulation", requestedType: "molecule" };
  }
  if (/\bfree[- ]?body (?:diagram)?\b|\bforce diagram\b/i.test(userMessage)) {
    return { category: "diagram", requestedType: "free-body" };
  }
  if (/\bnpv\b|\birr\b|\bcompound interest\b|\bsimple interest\b|\bbreak[- ]?even\b|\bfinancial calc(?:ulator|ulation)?\b/i.test(userMessage)) {
    return { category: "code", requestedType: "npv" };
  }
  if (/\banatomy\b|\bhuman body\b|\bbody system\b|\bskeleton\b|\bskeletal\b|\bmuscular system\b|\blabel (?:the|a) (?:heart|brain|eye|ear|cell|organ|body)/i.test(userMessage)) {
    return { category: "diagram", requestedType: "anatomy" };
  }

  // --- drawing / simulation / writing — not yet in registry, fall through ---
  if (intents.wantsDrawing) return { category: "drawing", requestedType: "scene" };

  return { category: null, requestedType: null };
}

// ============================================================
// Build the constraint envelope
// ============================================================

/**
 * Translate the requestedType + category into the allowed plugin IDs.
 * This is the WHITELIST the router enforces.
 *
 * Example: requestedType "bar" → ["graph.bar"]
 * Example: requestedType "python" → ["code.python"]
 */
function allowedPluginsFor(category: ToolCategory, requestedType: string | null): string[] {
  if (!requestedType) {
    // No specific type — allow any enabled plugin in the category
    switch (category) {
      case "graph": return ["graph.bar"];
      case "diagram": return ["diagram.flowchart"];
      case "code": return ["code.python", "code.javascript"];
      case "assessment": return ["assessment.quiz"];
      default: return [];
    }
  }
  const TYPE_TO_PLUGIN: Record<string, string> = {
    bar: "graph.bar",
    histogram: "graph.bar",
    pie: "graph.bar",
    scatter: "graph.scatter",
    function: "graph.function",
    line: "graph.bar",
    venn: "graph.venn",
    numberline: "graph.number-line",
    tree: "graph.tree",
    boxplot: "graph.box-plot",
    vector: "graph.bar",
    polygon: "graph.bar",
    csv: "business.spreadsheet",
    spreadsheet: "business.spreadsheet",
    erdiagram: "business.erdiagram",
    flowchart: "diagram.flowchart",
    concept_map: "diagram.concept-map",
    network: "diagram.network",
    python: "code.python",
    javascript: "code.javascript",
    typescript: "code.javascript",
    web: "code.html",
    html: "code.html",
    c: "code.c",
    cpp: "code.c",
    sql: "code.sql",
    json: "code.json",
    quiz: "assessment.quiz",
    flashcards: "assessment.flashcards",
    exam: "assessment.exam",
    draw_task: "assessment.draw-task",
    scene: "drawing.scene",
    drawing: "drawing.freehand",
    circuit: "diagram.circuit",
    gear: "diagram.gear",
    nginx: "diagram.nginx",
    plc: "diagram.plc",
    shell: "server.shell",
    linux: "server.shell",
    docker: "code.docker",
    notebook: "writing.notebook",
    manipulative: "math.manipulative",
    calculator: "math.calculator",
    essay: "writing.composition",
    report: "writing.composition",
    composition: "writing.composition",
    timeline: "diagram.timeline",
    geometry: "math.geometry",
    construction: "math.geometry",
    pendulum: "science.physics-sim",
    projectile: "science.physics-sim",
    molecule: "science.chemistry-sim",
    reaction: "science.chemistry-sim",
    "free-body": "diagram.free-body",
    "force diagram": "diagram.free-body",
    npv: "business.financial",
    "compound interest": "business.financial",
    "break-even": "business.financial",
    anatomy: "diagram.anatomy",
    "human body": "diagram.anatomy",
  };
  const id = TYPE_TO_PLUGIN[requestedType];
  return id ? [id] : [];
}

/**
 * Build the constraint envelope from the learner's message + intents + active workspace.
 *
 * Workspace context takes precedence: if the learner is looking at a graph.bar
 * artifact and asks "change Diana to 8", the envelope becomes:
 *   { action: "modify", category: "graph", requestedType: "bar",
 *     allowedPlugins: ["graph.bar"], maximumPrimaryArtifacts: 1 }
 */
export function buildConstraintEnvelope(opts: {
  userMessage: string;
  intents: TutorIntents;
  workspaceContext: WorkspaceContext | null;
}): ConstraintEnvelope {
  const { userMessage, intents, workspaceContext } = opts;
  const action = detectActionVerb(userMessage);

  // Workspace-context shortcut: follow-up modifications inspect/modify the active artifact
  if (workspaceContext && (action === "modify" || action === "inspect")) {
    const wsType = workspaceContext.artifactType;
    const wsCategory = categoryForArtifactType(wsType);
    if (wsCategory) {
      const allowed = allowedPluginsFor(wsCategory, requestedTypeForArtifactType(wsType));
      if (allowed.length > 0) {
        return {
          action,
          category: wsCategory,
          requestedType: requestedTypeForArtifactType(wsType),
          allowedPlugins: allowed,
          maximumPrimaryArtifacts: 1,
        };
      }
    }
  }

  // Otherwise: parse from the message itself
  const { category, requestedType } = detectCategoryAndType({ userMessage, intents });
  const allowedPlugins = category
    ? allowedPluginsFor(category, requestedType)
    : [];

  return {
    action,
    category,
    requestedType,
    allowedPlugins,
    maximumPrimaryArtifacts: 1, // always 1 primary artifact max (advisor rule)
  };
}

// ============================================================
// Workspace-context type mapping
// ============================================================

function categoryForArtifactType(artifactType: string): ToolCategory | null {
  switch (artifactType) {
    case "graph":
    case "bar":
    case "pie":
    case "scatter":
    case "histogram":
      return "graph";
    case "flowchart_v1":
    case "conceptmap":
    case "network":
      return "diagram";
    case "code_project":
    case "python":
    case "javascript":
      return "code";
    case "quiz":
    case "flashcards":
      return "assessment";
    case "draw_task":
    case "scene":
      return "drawing";
    default:
      return null;
  }
}

function requestedTypeForArtifactType(artifactType: string): string | null {
  switch (artifactType) {
    case "graph":
    case "bar": return "bar";
    case "pie": return "pie";
    case "scatter": return "scatter";
    case "histogram": return "histogram";
    case "flowchart_v1": return "flowchart";
    case "conceptmap": return "concept_map";
    case "network": return "network";
    case "code_project": return "python"; // default — the client should send the language
    case "quiz": return "quiz";
    default: return null;
  }
}

// ============================================================
// Line graph detection — used internally (not added to TutorIntents type
// to avoid breaking the existing contract)
// ============================================================

function detectWantsLineGraph(userMessage: string): boolean {
  return /\bline (graph|chart|plot)\b|\btrend\b|\bchange over time\b|\bmonthly (?:values|trend)\b/i.test(userMessage);
}

// Re-exported for unit tests:
export function _internalDetectWantsLineGraph(userMessage: string): boolean {
  return detectWantsLineGraph(userMessage);
}
