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
