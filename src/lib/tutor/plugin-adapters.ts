/**
 * Plugin Adapters — Phase AC2
 *
 * Wraps existing logic for each of the 5 initial plugins so they implement
 * the new ToolPlugin interface WITHOUT changing learner-facing behavior.
 *
 * Each adapter is a thin shim that:
 *   1. Accepts a structured PluginRequest (action + envelope + raw AI output)
 *   2. Calls the existing parsing/validation logic
 *   3. Wraps the result in a ToolResult (ready | clarification | unsupported | failed)
 *
 * The existing parseGraphAttachments() remains the source of truth — adapters
 * do NOT replace it. They re-frame its output into WorkspaceArtifact + ToolResult.
 *
 * NOT WIRED INTO CHAT FLOW YET — see TUTOR_PLUGIN_FRAMEWORK_ENABLED flag.
 */

import type {
  ActionVerb,
  ConstraintEnvelope,
  ToolResult,
  WorkspaceArtifact,
} from "./plugin-types";
import { GRAPH_BAR_MANIFEST, DIAGRAM_FLOWCHART_MANIFEST, CODE_PYTHON_MANIFEST, CODE_JAVASCRIPT_MANIFEST, ASSESSMENT_QUIZ_MANIFEST } from "./plugin-registry";
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

const graphBarAdapter: ToolPlugin = {
  manifestId: GRAPH_BAR_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      // DELEGATE to the existing logic — we do NOT call parseGraphAttachments
      // here directly because that function is async + needs DB/userId context.
      // Instead, the wire-in layer (Phase AC3) will call parseGraphAttachments
      // and pass us the results via request.aiReply (already-parsed attachments
      // are passed separately by the wire-in layer).
      //
      // For Phase AC2 we are NOT wired in. This adapter is a stub that returns
      // `failed` to indicate "not implemented in this phase". Real adapter
      // logic lands in Phase AC3 when we wire it in.

      // When wired in, the actual logic will be:
      //   const attachments = await parseGraphAttachments({...});
      //   const primary = primaryAttachmentOf(attachments);
      //   if (!primary) return { status: "failed", errorCode: "NO_GRAPH_PRODUCED", safeMessage: ... };
      //   return { status: "ready", artifact: {...}, tutorSummary: {...} };

      // Stub:
      return {
        status: "failed",
        errorCode: "ADAPTER_NOT_WIRED",
        safeMessage: "The bar graph plugin is not yet wired into the chat flow.",
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "GRAPH_BAR_ADAPTER_ERROR",
        safeMessage: "I couldn't prepare that bar graph. Please try again.",
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
      // Stub — Phase AC3 will call validateFlowchartPlan + compileFlowchart.
      return {
        status: "failed",
        errorCode: "ADAPTER_NOT_WIRED",
        safeMessage: "The flowchart plugin is not yet wired into the chat flow.",
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

const codePythonAdapter: ToolPlugin = {
  manifestId: CODE_PYTHON_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      // Stub — Phase AC3 will call the existing code-sandbox.
      return {
        status: "failed",
        errorCode: "ADAPTER_NOT_WIRED",
        safeMessage: "The Python plugin is not yet wired into the chat flow.",
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "PYTHON_ADAPTER_ERROR",
        safeMessage: "I couldn't run that Python code. Please try again.",
      };
    }
  },
};

// ============================================================
// Adapter #4: code.javascript
// ============================================================

const codeJavascriptAdapter: ToolPlugin = {
  manifestId: CODE_JAVASCRIPT_MANIFEST.id,
  async run(request: PluginRequest): Promise<ToolResult> {
    try {
      // Stub — Phase AC3 will call the existing JS sandbox.
      return {
        status: "failed",
        errorCode: "ADAPTER_NOT_WIRED",
        safeMessage: "The JavaScript plugin is not yet wired into the chat flow.",
      };
    } catch (err) {
      return {
        status: "failed",
        errorCode: "JAVASCRIPT_ADAPTER_ERROR",
        safeMessage: "I couldn't run that JavaScript code. Please try again.",
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
      // Stub — Phase AC3 will call the existing quiz parser.
      return {
        status: "failed",
        errorCode: "ADAPTER_NOT_WIRED",
        safeMessage: "The quiz plugin is not yet wired into the chat flow.",
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
// Adapter registry — keyed by manifest ID
// ============================================================

const ADAPTER_REGISTRY: ReadonlyMap<string, ToolPlugin> = new Map([
  [GRAPH_BAR_MANIFEST.id, graphBarAdapter],
  [DIAGRAM_FLOWCHART_MANIFEST.id, flowchartAdapter],
  [CODE_PYTHON_MANIFEST.id, codePythonAdapter],
  [CODE_JAVASCRIPT_MANIFEST.id, codeJavascriptAdapter],
  [ASSESSMENT_QUIZ_MANIFEST.id, quizAdapter],
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
