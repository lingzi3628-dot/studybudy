/**
 * Plugin Adapters — Phase AC2 / AC3
 *
 * Wraps existing logic for each of the 5 initial plugins so they implement
 * the new ToolPlugin interface WITHOUT changing learner-facing behavior.
 *
 * Each adapter is a thin shim that:
 *   1. Accepts a structured PluginRequest (action + envelope + AI reply + existing attachments)
 *   2. Validates the existing attachments against the plugin's expected type
 *   3. Wraps the result in a ToolResult (ready | clarification | unsupported | failed)
 *
 * The existing parseGraphAttachments() remains the source of truth — adapters
 * do NOT replace it. They re-frame its output into WorkspaceArtifact + ToolResult.
 *
 * Phase AC3: adapters now do REAL validation (not stubs). The wire-in layer
 * (runPluginPipelineForReply) is called from postProcessReply when the
 * TUTOR_PLUGIN_FRAMEWORK_ENABLED flag is on.
 */

import type {
  ActionVerb,
  ConstraintEnvelope,
  ToolResult,
  WorkspaceArtifact,
} from "./plugin-types";
import {
  GRAPH_BAR_MANIFEST,
  DIAGRAM_FLOWCHART_MANIFEST,
  CODE_PYTHON_MANIFEST,
  CODE_JAVASCRIPT_MANIFEST,
  ASSESSMENT_QUIZ_MANIFEST,
  WRITING_COMPOSITION_MANIFEST,
  DIAGRAM_TIMELINE_MANIFEST,
  MATH_GEOMETRY_MANIFEST,
  SCIENCE_PHYSICS_MANIFEST,
  SCIENCE_CHEMISTRY_MANIFEST,
  DIAGRAM_FREE_BODY_MANIFEST,
  BUSINESS_FINANCIAL_MANIFEST,
  DIAGRAM_ANATOMY_MANIFEST,
} from "./plugin-registry";
import type { TutorAttachment } from "../tutor-chat-engine";

// ============================================================
// Plugin request shape — passed to every adapter
// ============================================================

export type PluginRequest = {
  action: ActionVerb;
  envelope: ConstraintEnvelope;
  /** Raw AI output text (the model's reply). */
  aiReply: string;
  /** Original user message. */
  userMessage: string;
  /** User ID (for any persistence calls — adapters don't persist in this phase). */
  userId: string;
  /** Conversation ID (for source attribution in WorkspaceArtifact). */
  conversationId: string | null;
  /** Message ID (for source attribution). */
  messageId: string | null;
  /**
   * AC3: Existing attachments produced by parseGraphAttachments + parseQuiz + parseDrawTask.
   * The adapter inspects these to decide if the plugin's expected artifact was produced.
   * Avoids re-parsing the reply (which would duplicate work).
   */
  existingAttachments: TutorAttachment[];
};

// ============================================================
// Plugin interface — every adapter implements this
// ============================================================

export type ToolPlugin = {
  manifestId: string;
  /** Run the plugin. Adapters MUST NOT throw — they return failed ToolResult on error. */
  run(request: PluginRequest): Promise<ToolResult>;
};

// ============================================================
// Helper — convert TutorAttachment[] to WorkspaceArtifact
// ============================================================

/**
 * Take the FIRST primary attachment from parseGraphAttachments output and
 * wrap it in a WorkspaceArtifact. Primary = graph / flowchart_v1 / code_project
 * / quiz / conceptmap. NOT source / video / image (those are secondary).
 */
function primaryAttachmentOf(attachments: TutorAttachment[]): TutorAttachment | null {
  const PRIMARY_TYPES = new Set([
    "graph", "bar", "pie", "scatter", "histogram", "function", "line",
    "flowchart_v1", "conceptmap", "network", "code_project", "quiz",
    "draw_task", "scene",
  ]);
  for (const a of attachments) {
    if (PRIMARY_TYPES.has(a.type)) return a;
  }
  return null;
}

function artifactIdFor(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function payloadOf(attachment: TutorAttachment): unknown {
  // The existing TutorAttachment shape is { type, url, caption }.
  // The "caption" sometimes contains the JSON spec for graph-type attachments
  // (the frontend parses it). For now we return the whole attachment object
  // as the payload — a future phase will give the adapter direct access to
  // the parsed spec.
  // NOTE: this is intentionally lossy — adapters are NOT yet wired in.
  return {
    type: attachment.type,
    url: attachment.url,
    caption: attachment.caption,
  };
}

function titleFor(attachment: TutorAttachment, fallback: string): string {
  // Try to extract a title from the caption (graph specs usually have one)
  try {
    const parsed = JSON.parse(attachment.caption);
    if (parsed && typeof parsed.title === "string") return parsed.title.slice(0, 120);
  } catch {
    // caption is not JSON — use the fallback
  }
  return fallback;
}

// ============================================================
// Adapter #1: graph.bar
// ============================================================

/** Attachment types that the graph.bar adapter considers valid. */
const GRAPH_ATTACHMENT_TYPES = new Set([
  "graph", "bar", "pie", "scatter", "histogram", "function", "line",
  "venn", "numberline", "tree", "boxplot", "vector", "polygon",
  "conceptmap", "network",
]);

const graphBarAdapter: ToolPlugin = {
  manifestId: GRAPH_BAR_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const primary = request.existingAttachments.find((a) => GRAPH_ATTACHMENT_TYPES.has(a.type));
      if (!primary) {
        // No graph attachment was produced — this is a real failure.
        return {
          status: "failed",
          errorCode: "NO_GRAPH_PRODUCED",
          safeMessage: "I couldn't prepare that graph. Please try again, or give me the categories and values you'd like to use.",
        };
      }
      const artifact = wrapAttachmentAsArtifact({
        attachment: primary,
        pluginId: GRAPH_BAR_MANIFEST.id,
        pluginVersion: GRAPH_BAR_MANIFEST.version,
        titleFallback: "Graph",
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your graph is ready.",
          detail: `Rendered as a ${primary.type} graph.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "GRAPH_BAR_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that graph. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #2: diagram.flowchart
// ============================================================

const flowchartAdapter: ToolPlugin = {
  manifestId: DIAGRAM_FLOWCHART_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const primary = request.existingAttachments.find((a) => a.type === "flowchart_v1");
      if (!primary) {
        return {
          status: "failed",
          errorCode: "NO_FLOWCHART_PRODUCED",
          safeMessage: "I couldn't prepare that flowchart. Please try again with a clearer description.",
        };
      }
      const artifact = wrapAttachmentAsArtifact({
        attachment: primary,
        pluginId: DIAGRAM_FLOWCHART_MANIFEST.id,
        pluginVersion: DIAGRAM_FLOWCHART_MANIFEST.version,
        titleFallback: "Flowchart",
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your flowchart is ready.",
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "FLOWCHART_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that flowchart. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #3: code.python
// ============================================================

/**
 * Detect a Python code block in the AI reply. Looks for ```python fences
 * OR a code_project attachment whose payload indicates Python.
 */
function findPythonCodeBlock(reply: string): string | null {
  const match = reply.match(/```python\s*([\s\S]*?)```/i);
  if (match && match[1]) return match[1].trim();
  // Some models emit ```py
  const match2 = reply.match(/```py\s*([\s\S]*?)```/i);
  if (match2 && match2[1]) return match2[1].trim();
  return null;
}

const codePythonAdapter: ToolPlugin = {
  manifestId: CODE_PYTHON_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      // AC3: we only VALIDATE the code is present + syntactically a string.
      // We do NOT execute it in this phase (the existing code-sandbox runs
      // when the learner clicks "Run" in the workspace, not at chat time).
      const code = findPythonCodeBlock(request.aiReply);
      if (!code) {
        return {
          status: "failed",
          errorCode: "NO_PYTHON_CODE_FOUND",
          safeMessage: "I couldn't find any Python code in my reply. Please ask me to write some.",
        };
      }
      // Build a minimal WorkspaceArtifact with the code as the payload.
      // The existing chat flow doesn't actually use this artifact yet —
      // the learner sees the code in the AI reply text. The artifact is
      // for future workspace integration (Phase AC4+).
      const artifact: WorkspaceArtifact = {
        artifactId: artifactIdFor(CODE_PYTHON_MANIFEST.id),
        plugin: { id: CODE_PYTHON_MANIFEST.id, version: CODE_PYTHON_MANIFEST.version },
        artifactVersion: 1,
        title: "Python Code",
        status: "draft",
        source: {
          conversationId: request.conversationId,
          messageId: request.messageId,
        },
        payload: { language: "python", code, files: [{ name: "main.py", content: code }] },
      };
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your Python code is ready.",
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "PYTHON_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that Python code. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #4: code.javascript
// ============================================================

/**
 * Detect a JavaScript code block in the AI reply. Looks for ```javascript
 * OR ```js fences.
 */
function findJavascriptCodeBlock(reply: string): string | null {
  const match = reply.match(/```javascript\s*([\s\S]*?)```/i);
  if (match && match[1]) return match[1].trim();
  const match2 = reply.match(/```js\s*([\s\S]*?)```/i);
  if (match2 && match2[1]) return match2[1].trim();
  return null;
}

const codeJavascriptAdapter: ToolPlugin = {
  manifestId: CODE_JAVASCRIPT_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const code = findJavascriptCodeBlock(request.aiReply);
      if (!code) {
        return {
          status: "failed",
          errorCode: "NO_JAVASCRIPT_CODE_FOUND",
          safeMessage: "I couldn't find any JavaScript code in my reply. Please ask me to write some.",
        };
      }
      const artifact: WorkspaceArtifact = {
        artifactId: artifactIdFor(CODE_JAVASCRIPT_MANIFEST.id),
        plugin: { id: CODE_JAVASCRIPT_MANIFEST.id, version: CODE_JAVASCRIPT_MANIFEST.version },
        artifactVersion: 1,
        title: "JavaScript Code",
        status: "draft",
        source: {
          conversationId: request.conversationId,
          messageId: request.messageId,
        },
        payload: { language: "javascript", code, files: [{ name: "main.js", content: code }] },
      };
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your JavaScript code is ready.",
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "JAVASCRIPT_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that JavaScript code. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #5: assessment.quiz
// ============================================================

const quizAdapter: ToolPlugin = {
  manifestId: ASSESSMENT_QUIZ_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const primary = request.existingAttachments.find((a) => a.type === "quiz");
      if (!primary) {
        return {
          status: "failed",
          errorCode: "NO_QUIZ_PRODUCED",
          safeMessage: "I couldn't prepare that quiz. Please try again, or tell me the topic you'd like to be quizzed on.",
        };
      }
      const artifact = wrapAttachmentAsArtifact({
        attachment: primary,
        pluginId: ASSESSMENT_QUIZ_MANIFEST.id,
        pluginVersion: ASSESSMENT_QUIZ_MANIFEST.version,
        titleFallback: "Quiz",
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your quiz is ready.",
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "QUIZ_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that quiz. Please try again.",
      };
    }
  },
};

// ============================================================
// Shared helpers for the 8 critical new plugins
// ============================================================

/**
 * Generic fenced-code-block JSON parser.
 *
 * Looks for ```<fenceName> ... ``` in the AI reply, extracts the JSON
 * object between the first `{` and last `}`, and parses it. Returns null
 * on any failure (missing fence, malformed JSON, missing required fields).
 *
 * `requiredFields` is an optional list of top-level keys that MUST be
 * present (and non-null) on the parsed object. If any are missing, returns
 * null — the adapter will then return a `failed` ToolResult.
 */
function parseFencedJson<T = any>(
  reply: string,
  fenceName: string,
  requiredFields: string[] = [],
): T | null {
  const fenceRe = new RegExp("```" + fenceName + "\\s*([\\s\\S]*?)```", "i");
  const match = reply.match(fenceRe);
  if (!match || !match[1]) return null;
  let cleaned = match[1].trim();
  // Some models wrap the spec in an inner ```json fence — strip it.
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  for (const f of requiredFields) {
    if (parsed[f] === undefined || parsed[f] === null) return null;
  }
  return parsed as T;
}

/**
 * Build a WorkspaceArtifact from a parsed spec object (NOT a TutorAttachment).
 * Used by the 8 critical plugins whose adapters parse the AI reply directly
 * (no existing-attachment indirection).
 */
function wrapParsedSpecAsArtifact(opts: {
  pluginId: string;
  pluginVersion: number;
  title: string;
  payload: unknown;
  conversationId: string | null;
  messageId: string | null;
}): WorkspaceArtifact {
  return {
    artifactId: artifactIdFor(opts.pluginId),
    plugin: { id: opts.pluginId, version: opts.pluginVersion },
    artifactVersion: 1,
    title: opts.title.slice(0, 120),
    status: "ready",
    source: { conversationId: opts.conversationId, messageId: opts.messageId },
    payload: opts.payload,
  };
}

// ============================================================
// Adapter #6: writing.composition — essay / report / article writer
// ============================================================

type CompositionSpec = {
  title?: string;
  type?: string; // essay | report | article | letter | paragraph
  sections?: Array<{ heading?: string; body?: string }>;
};

const compositionAdapter: ToolPlugin = {
  manifestId: WRITING_COMPOSITION_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<CompositionSpec>(
        request.aiReply,
        "composition",
        ["sections"],
      );
      if (!spec || !Array.isArray(spec.sections) || spec.sections.length === 0) {
        return {
          status: "failed",
          errorCode: "NO_COMPOSITION_PRODUCED",
          safeMessage: "I couldn't prepare that piece of writing. Please tell me the topic and the type (essay, report, or article) you'd like me to write.",
        };
      }
      // Validate each section has body text.
      const validSections = spec.sections.filter(
        (s) => s && typeof s.body === "string" && s.body.trim().length > 0,
      );
      if (validSections.length === 0) {
        return {
          status: "failed",
          errorCode: "EMPTY_COMPOSITION_SECTIONS",
          safeMessage: "I started drafting that, but the sections came out empty. Could you give me more detail on what to cover?",
        };
      }
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: WRITING_COMPOSITION_MANIFEST.id,
        pluginVersion: WRITING_COMPOSITION_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : (spec.type ? `${spec.type} draft` : "Writing draft"),
        payload: {
          type: typeof spec.type === "string" ? spec.type : "essay",
          title: typeof spec.title === "string" ? spec.title : "",
          sections: validSections.map((s) => ({
            heading: typeof s.heading === "string" ? s.heading : "",
            body: s.body as string,
          })),
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your draft is ready.",
          detail: `${validSections.length} section${validSections.length === 1 ? "" : "s"} written.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "COMPOSITION_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that piece of writing. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #7: diagram.timeline — chronology of events
// ============================================================

type TimelineSpec = {
  title?: string;
  events?: Array<{
    date?: string;
    label?: string;
    description?: string;
  }>;
};

const timelineAdapter: ToolPlugin = {
  manifestId: DIAGRAM_TIMELINE_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<TimelineSpec>(
        request.aiReply,
        "timeline",
        ["events"],
      );
      if (!spec || !Array.isArray(spec.events) || spec.events.length === 0) {
        return {
          status: "failed",
          errorCode: "NO_TIMELINE_PRODUCED",
          safeMessage: "I couldn't prepare that timeline. Please tell me the events and dates you'd like included.",
        };
      }
      const validEvents = spec.events.filter(
        (e) => e && typeof e.label === "string" && e.label.trim().length > 0,
      );
      if (validEvents.length === 0) {
        return {
          status: "failed",
          errorCode: "EMPTY_TIMELINE_EVENTS",
          safeMessage: "I started that timeline, but the events came out empty. Could you give me the dates and what happened?",
        };
      }
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: DIAGRAM_TIMELINE_MANIFEST.id,
        pluginVersion: DIAGRAM_TIMELINE_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : "Timeline",
        payload: {
          title: typeof spec.title === "string" ? spec.title : "",
          events: validEvents.map((e) => ({
            date: typeof e.date === "string" ? e.date : "",
            label: e.label as string,
            description: typeof e.description === "string" ? e.description : "",
          })),
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your timeline is ready.",
          detail: `${validEvents.length} event${validEvents.length === 1 ? "" : "s"} plotted.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "TIMELINE_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that timeline. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #8: math.geometry — shape construction
// ============================================================

type GeometrySpec = {
  title?: string;
  shapes?: Array<Record<string, unknown> & { type?: string }>;
};

const GEOMETRY_VALID_TYPES = new Set([
  "triangle", "equilateral_triangle", "right_triangle", "isosceles_triangle",
  "square", "rectangle", "parallelogram", "rhombus", "trapezium", "trapezoid",
  "circle", "polygon", "pentagon", "hexagon", "heptagon", "octagon",
  "angle", "line_segment", "perpendicular_bisector", "angle_bisector",
  "point", "ray", "line",
]);

const geometryAdapter: ToolPlugin = {
  manifestId: MATH_GEOMETRY_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<GeometrySpec>(
        request.aiReply,
        "geometry",
        ["shapes"],
      );
      if (!spec || !Array.isArray(spec.shapes) || spec.shapes.length === 0) {
        return {
          status: "failed",
          errorCode: "NO_GEOMETRY_PRODUCED",
          safeMessage: "I couldn't prepare that construction. Please tell me which shapes you'd like me to draw.",
        };
      }
      const validShapes = spec.shapes.filter(
        (s) => s && typeof s.type === "string" && GEOMETRY_VALID_TYPES.has(s.type),
      );
      if (validShapes.length === 0) {
        return {
          status: "failed",
          errorCode: "INVALID_GEOMETRY_SHAPES",
          safeMessage: "I started that construction, but the shapes weren't recognized. Could you describe them differently?",
        };
      }
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: MATH_GEOMETRY_MANIFEST.id,
        pluginVersion: MATH_GEOMETRY_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : "Geometry construction",
        payload: {
          title: typeof spec.title === "string" ? spec.title : "",
          shapes: validShapes,
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your construction is ready.",
          detail: `${validShapes.length} shape${validShapes.length === 1 ? "" : "s"} drawn.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "GEOMETRY_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that construction. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #9: science.physics-sim — pendulum / projectile / motion
// ============================================================

type PhysicsSimSpec = {
  title?: string;
  simType?: string;
  parameters?: Record<string, unknown>;
};

const PHYSICS_VALID_SIM_TYPES = new Set([
  "pendulum", "simple_pendulum",
  "projectile", "projectile_motion",
  "free_fall", "incline", "incline_plane", "incline_motion",
  "spring", "spring_mass", "shm", "circular_motion",
  "collision", "wave", "doppler",
]);

const physicsSimAdapter: ToolPlugin = {
  manifestId: SCIENCE_PHYSICS_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<PhysicsSimSpec>(
        request.aiReply,
        "physics",
        ["simType"],
      );
      if (!spec || typeof spec.simType !== "string") {
        return {
          status: "failed",
          errorCode: "NO_PHYSICS_SIM_PRODUCED",
          safeMessage: "I couldn't prepare that simulation. Please tell me what to simulate (e.g. a pendulum, projectile motion, or free fall).",
        };
      }
      if (!PHYSICS_VALID_SIM_TYPES.has(spec.simType)) {
        return {
          status: "failed",
          errorCode: "INVALID_PHYSICS_SIM_TYPE",
          safeMessage: "I couldn't set up that simulation. Could you try a different one — like a pendulum, projectile, or free fall?",
        };
      }
      const params = (spec.parameters && typeof spec.parameters === "object")
        ? spec.parameters
        : {};
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: SCIENCE_PHYSICS_MANIFEST.id,
        pluginVersion: SCIENCE_PHYSICS_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : `Physics simulation — ${spec.simType.replace(/_/g, " ")}`,
        payload: {
          simType: spec.simType,
          parameters: params,
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your simulation is ready.",
          detail: `Type: ${spec.simType.replace(/_/g, " ")}.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "PHYSICS_SIM_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that simulation. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #10: science.chemistry-sim — molecule / reaction viewer
// ============================================================

type ChemistrySpec = {
  title?: string;
  formula?: string;
  atoms?: Array<{ element?: string; x?: number; y?: number; label?: string }>;
  bonds?: Array<{ from?: number; to?: number; type?: string }>;
  reaction?: Array<{ reactants?: string[]; products?: string[]; conditions?: string }>;
};

const PERIODIC_TABLE = new Set([
  "H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al","Si","P","S","Cl","Ar",
  "K","Ca","Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Ga","Ge","As","Se","Br","Kr",
  "Rb","Sr","Y","Zr","Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","In","Sn","Sb","Te","I","Xe",
  "Cs","Ba","La","Hf","Ta","W","Re","Os","Ir","Pt","Au","Hg","Tl","Pb","Bi","Po","At","Rn",
]);

const chemistrySimAdapter: ToolPlugin = {
  manifestId: SCIENCE_CHEMISTRY_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<ChemistrySpec>(
        request.aiReply,
        "molecule",
        [],
      );
      if (!spec) {
        return {
          status: "failed",
          errorCode: "NO_MOLECULE_PRODUCED",
          safeMessage: "I couldn't prepare that molecule or reaction. Please tell me the chemical formula or the reaction you'd like to see.",
        };
      }
      // Either an atoms/bonds molecule, OR a reaction. Both are valid.
      const hasMolecule = Array.isArray(spec.atoms) && spec.atoms.length > 0;
      const hasReaction = Array.isArray(spec.reaction) && spec.reaction.length > 0;
      if (!hasMolecule && !hasReaction) {
        return {
          status: "failed",
          errorCode: "EMPTY_CHEMISTRY_SPEC",
          safeMessage: "I started that, but I need either a molecule's atoms and bonds, or a reaction's reactants and products.",
        };
      }
      // Validate atoms reference real elements.
      if (hasMolecule) {
        for (const a of spec.atoms!) {
          if (!a || typeof a.element !== "string" || !PERIODIC_TABLE.has(a.element)) {
            return {
              status: "failed",
              errorCode: "INVALID_CHEMISTRY_ATOM",
              safeMessage: "I couldn't recognise one of the atoms in that molecule. Could you check the element symbols?",
            };
          }
        }
      }
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: SCIENCE_CHEMISTRY_MANIFEST.id,
        pluginVersion: SCIENCE_CHEMISTRY_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : (typeof spec.formula === "string" && spec.formula.trim()
            ? spec.formula.trim()
            : (hasMolecule ? "Molecule viewer" : "Reaction viewer")),
        payload: {
          formula: typeof spec.formula === "string" ? spec.formula : "",
          atoms: hasMolecule ? spec.atoms : [],
          bonds: Array.isArray(spec.bonds) ? spec.bonds : [],
          reaction: hasReaction ? spec.reaction : [],
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your molecule is ready.",
          detail: hasReaction ? "Includes a reaction step." : undefined,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "CHEMISTRY_SIM_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that molecule or reaction. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #11: diagram.free-body — force vectors on a body
// ============================================================

type FreeBodySpec = {
  title?: string;
  body?: string;
  forces?: Array<{
    label?: string;
    magnitude?: number;
    direction?: number; // degrees, 0 = right, 90 = up
  }>;
};

const freeBodyAdapter: ToolPlugin = {
  manifestId: DIAGRAM_FREE_BODY_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<FreeBodySpec>(
        request.aiReply,
        "freebody",
        ["forces"],
      );
      if (!spec || !Array.isArray(spec.forces) || spec.forces.length === 0) {
        return {
          status: "failed",
          errorCode: "NO_FREE_BODY_PRODUCED",
          safeMessage: "I couldn't prepare that force diagram. Please tell me the body and the forces acting on it.",
        };
      }
      const validForces = spec.forces.filter(
        (f) => f && typeof f.label === "string" && f.label.trim().length > 0,
      );
      if (validForces.length === 0) {
        return {
          status: "failed",
          errorCode: "EMPTY_FREE_BODY_FORCES",
          safeMessage: "I started that force diagram, but the forces came out empty. Could you label each force?",
        };
      }
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: DIAGRAM_FREE_BODY_MANIFEST.id,
        pluginVersion: DIAGRAM_FREE_BODY_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : (typeof spec.body === "string" && spec.body.trim()
            ? `Free-body diagram — ${spec.body}`
            : "Free-body diagram"),
        payload: {
          body: typeof spec.body === "string" ? spec.body : "",
          forces: validForces.map((f) => ({
            label: f.label as string,
            magnitude: typeof f.magnitude === "number" ? f.magnitude : 0,
            direction: typeof f.direction === "number" ? f.direction : 0,
          })),
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your force diagram is ready.",
          detail: `${validForces.length} force${validForces.length === 1 ? "" : "s"} labelled.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "FREE_BODY_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that force diagram. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #12: business.financial — NPV / IRR / compound interest / break-even
// ============================================================

type FinancialSpec = {
  title?: string;
  calcType?: string;
  parameters?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

const FINANCIAL_VALID_CALC_TYPES = new Set([
  "npv", "irr", "payback", "discounted_payback", "profitability_index",
  "compound_interest", "simple_interest", "break_even", "breakeven",
  "loan_payment", "amortization", "present_value", "future_value",
  "annuity", "roi", "roi_percent",
]);

const financialAdapter: ToolPlugin = {
  manifestId: BUSINESS_FINANCIAL_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<FinancialSpec>(
        request.aiReply,
        "financial",
        ["calcType"],
      );
      if (!spec || typeof spec.calcType !== "string") {
        return {
          status: "failed",
          errorCode: "NO_FINANCIAL_CALC_PRODUCED",
          safeMessage: "I couldn't prepare that calculation. Please tell me the type (e.g. NPV, IRR, compound interest, or break-even) and the values.",
        };
      }
      if (!FINANCIAL_VALID_CALC_TYPES.has(spec.calcType)) {
        return {
          status: "failed",
          errorCode: "INVALID_FINANCIAL_CALC_TYPE",
          safeMessage: "I couldn't set up that calculation. Could you try a different one — like NPV, IRR, compound interest, or break-even?",
        };
      }
      const params = (spec.parameters && typeof spec.parameters === "object")
        ? spec.parameters
        : {};
      const result = (spec.result && typeof spec.result === "object")
        ? spec.result
        : {};
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: BUSINESS_FINANCIAL_MANIFEST.id,
        pluginVersion: BUSINESS_FINANCIAL_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : `Financial calculation — ${spec.calcType.replace(/_/g, " ")}`,
        payload: {
          calcType: spec.calcType,
          parameters: params,
          result,
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your calculation is ready.",
          detail: `Type: ${spec.calcType.replace(/_/g, " ")}.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "FINANCIAL_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that calculation. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #13: diagram.anatomy — body labeling
// ============================================================

type AnatomySpec = {
  title?: string;
  system?: string;
  view?: string; // anterior | posterior | lateral | sagittal | coronal
  labels?: Array<{ part?: string; description?: string }>;
};

const ANATOMY_VALID_SYSTEMS = new Set([
  "skeletal", "muscular", "nervous", "circulatory", "cardiovascular",
  "respiratory", "digestive", "endocrine", "lymphatic", "immune",
  "urinary", "excretory", "reproductive", "integumentary", "skin",
  "cell", "tissue", "organ", "brain", "heart", "eye", "ear", "kidney", "liver",
]);

const anatomyAdapter: ToolPlugin = {
  manifestId: DIAGRAM_ANATOMY_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      const spec = parseFencedJson<AnatomySpec>(
        request.aiReply,
        "anatomy",
        ["labels"],
      );
      if (!spec || !Array.isArray(spec.labels) || spec.labels.length === 0) {
        return {
          status: "failed",
          errorCode: "NO_ANATOMY_PRODUCED",
          safeMessage: "I couldn't prepare that labelled diagram. Please tell me the body system or organ you'd like labelled.",
        };
      }
      const validLabels = spec.labels.filter(
        (l) => l && typeof l.part === "string" && l.part.trim().length > 0,
      );
      if (validLabels.length === 0) {
        return {
          status: "failed",
          errorCode: "EMPTY_ANATOMY_LABELS",
          safeMessage: "I started that diagram, but the labels came out empty. Could you tell me which parts to label?",
        };
      }
      // If a system is provided, validate it's recognized. Unknown systems are
      // accepted (the AI may know about a subsystem), but we log via the
      // status field so the client can show "system: custom".
      const systemKnown = typeof spec.system !== "string" || !spec.system.trim()
        ? false
        : ANATOMY_VALID_SYSTEMS.has(spec.system.toLowerCase());
      const artifact = wrapParsedSpecAsArtifact({
        pluginId: DIAGRAM_ANATOMY_MANIFEST.id,
        pluginVersion: DIAGRAM_ANATOMY_MANIFEST.version,
        title: typeof spec.title === "string" && spec.title.trim()
          ? spec.title.trim()
          : (typeof spec.system === "string" && spec.system.trim()
            ? `${spec.system.replace(/_/g, " ")} — labelled diagram`
            : "Labelled anatomy diagram"),
        payload: {
          system: typeof spec.system === "string" ? spec.system : "",
          systemRecognized: systemKnown,
          view: typeof spec.view === "string" ? spec.view : "",
          labels: validLabels.map((l) => ({
            part: l.part as string,
            description: typeof l.description === "string" ? l.description : "",
          })),
        },
        conversationId: request.conversationId,
        messageId: request.messageId,
      });
      return {
        status: "ready",
        artifact,
        tutorSummary: {
          shortMessage: "Your labelled diagram is ready.",
          detail: `${validLabels.length} label${validLabels.length === 1 ? "" : "s"} placed.`,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "ANATOMY_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that labelled diagram. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter registry — keyed by manifest ID
// ============================================================

const ADAPTER_REGISTRY: ReadonlyMap<string, ToolPlugin> = new Map([
  [GRAPH_BAR_MANIFEST.id, graphBarAdapter],
  [DIAGRAM_FLOWCHART_MANIFEST.id, flowchartAdapter],
  [CODE_PYTHON_MANIFEST.id, codePythonAdapter],
  [CODE_JAVASCRIPT_MANIFEST.id, codeJavascriptAdapter],
  [ASSESSMENT_QUIZ_MANIFEST.id, quizAdapter],
  // 8 critical new plugins
  [WRITING_COMPOSITION_MANIFEST.id, compositionAdapter],
  [DIAGRAM_TIMELINE_MANIFEST.id, timelineAdapter],
  [MATH_GEOMETRY_MANIFEST.id, geometryAdapter],
  [SCIENCE_PHYSICS_MANIFEST.id, physicsSimAdapter],
  [SCIENCE_CHEMISTRY_MANIFEST.id, chemistrySimAdapter],
  [DIAGRAM_FREE_BODY_MANIFEST.id, freeBodyAdapter],
  [BUSINESS_FINANCIAL_MANIFEST.id, financialAdapter],
  [DIAGRAM_ANATOMY_MANIFEST.id, anatomyAdapter],
]);

/** Look up an adapter by plugin ID. Returns null if no adapter is registered. */
export function getAdapter(pluginId: string): ToolPlugin | null {
  return ADAPTER_REGISTRY.get(pluginId) ?? null;
}

/** Run an adapter by plugin ID. Returns `unsupported` if no adapter is registered. */
export async function runAdapter(pluginId: string, request: PluginRequest): Promise<ToolResult> {
  const adapter = ADAPTER_REGISTRY.get(pluginId);
  if (!adapter) {
    return {
      status: "unsupported",
      reasonCode: "NO_ADAPTER_REGISTERED",
      alternatives: [],
    };
  }
  try {
    return await adapter.run(request);
  } catch (err) {
    return {
      status: "failed",
      errorCode: "ADAPTER_UNCAUGHT_ERROR",
      safeMessage: "Something went wrong preparing that. Please try again.",
    };
  }
}

// ============================================================
// Helper exports (used by Phase AC3 wire-in)
// ============================================================

export function wrapAttachmentAsArtifact(opts: {
  attachment: TutorAttachment;
  pluginId: string;
  pluginVersion: number;
  titleFallback: string;
  conversationId: string | null;
  messageId: string | null;
}): WorkspaceArtifact {
  const { attachment, pluginId, pluginVersion, titleFallback, conversationId, messageId } = opts;
  return {
    artifactId: artifactIdFor(pluginId),
    plugin: { id: pluginId, version: pluginVersion },
    artifactVersion: 1,
    title: titleFor(attachment, titleFallback),
    status: "ready",
    source: { conversationId, messageId },
    payload: payloadOf(attachment),
  };
}

export { primaryAttachmentOf };
