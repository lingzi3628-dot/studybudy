/**
 * Plugin Framework — Phase AC2 entry point (DORMANT)
 *
 * This module exposes a single function `runPluginPipeline()` that runs the
 * full invisible-plugin architecture:
 *
 *   detectIntents → buildConstraintEnvelope → route → runAdapter → ToolResult
 *
 * In Phase AC2, this function is NOT called by the chat flow. It exists so
 * that Phase AC3 can wire it in behind the TUTOR_PLUGIN_FRAMEWORK_ENABLED
 * flag without rewriting the foundation.
 *
 * To enable in the future:
 *   1. Set TUTOR_PLUGIN_FRAMEWORK_ENABLED=true
 *   2. Wire runPluginPipeline() into /api/tutor/chat and /api/tutor/chat/stream
 *      as an alternative to the existing parseGraphAttachments() path.
 *   3. Replace adapter stubs with real calls to:
 *        - parseGraphAttachments (graph.bar)
 *        - validateFlowchartPlan + compileFlowchart (diagram.flowchart)
 *        - existing code-sandbox (code.python / code.javascript)
 *        - existing quiz parser (assessment.quiz)
 *
 * Until then, learner behavior is UNCHANGED.
 */

import type {
  ToolResult,
  WorkspaceContext,
  ConstraintEnvelope,
  RoutingDecision,
} from "./plugin-types";
import { buildConstraintEnvelope } from "./tutor-action-controller";
import { route, buildClarificationQuestion, type AIClassifierFn } from "./tool-router";
import { runAdapter } from "./plugin-adapters";
import type { TutorIntents } from "../tutor-chat-engine";

// ============================================================
// Feature flag
// ============================================================

/**
 * Returns true if the invisible plugin framework is enabled.
 *
 * Default: false (off). When off, the existing parseGraphAttachments() path
 * runs unchanged. When on, the chat flow MAY call runPluginPipeline() to
 * route through the new architecture.
 *
 * Phase AC2: flag is read but the chat flow does NOT yet use it.
 */
export function isPluginFrameworkEnabled(): boolean {
  const flag = (process.env.TUTOR_PLUGIN_FRAMEWORK_ENABLED ?? "false")
    .toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "on";
}

// ============================================================
// Pipeline output
// ============================================================

export type PluginPipelineResult = {
  decision: RoutingDecision;
  toolResult: ToolResult;
};

// ============================================================
// Main entry point — runs the full pipeline
// ============================================================

/**
 * Run the invisible plugin pipeline end-to-end.
 *
 * Phase AC3: called by postProcessReply when TUTOR_PLUGIN_FRAMEWORK_ENABLED
 * is on. Validates the existing attachments against the chosen plugin.
 *
 * Steps:
 *   1. Build the constraint envelope (action + allowedPlugins)
 *   2. Route to a single plugin (deterministic → workspace → AI → clarification)
 *   3. Run the adapter (inspects existing attachments, returns ready/failed)
 *   4. Return the ToolResult
 *
 * The caller (postProcessReply wire-in) is responsible for:
 *   - Logging the routing decision (admin observability)
 *   - Translating ToolResult.failed into a learner-facing note appended to the reply
 *   - Translating ToolResult.clarification_required into a learner-facing question
 *   - ToolResult.ready is a no-op (the existing attachments already work)
 */
export async function runPluginPipeline(opts: {
  userMessage: string;
  intents: TutorIntents;
  workspaceContext: WorkspaceContext | null;
  aiReply: string;
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  /**
   * AC3: Existing attachments produced by parseGraphAttachments + parseQuiz + parseDrawTask.
   * Adapters inspect these to decide if the plugin's expected artifact was produced.
   */
  existingAttachments: import("../tutor-chat-engine").TutorAttachment[];
  classifier?: AIClassifierFn | null;
}): Promise<PluginPipelineResult> {
  const { userMessage, intents, workspaceContext, aiReply, userId, conversationId, messageId, existingAttachments, classifier = null } = opts;

  // Step 1: build constraint envelope
  const envelope: ConstraintEnvelope = buildConstraintEnvelope({
    userMessage,
    intents,
    workspaceContext,
  });

  // Step 2: route to a single plugin (or clarification)
  const decision = await route({
    userMessage,
    intents,
    workspaceContext,
    classifier,
  });

  // Step 3: if routing picked a plugin, run its adapter
  if (decision.pluginId) {
    const toolResult = await runAdapter(decision.pluginId, {
      action: envelope.action,
      envelope,
      aiReply,
      userMessage,
      userId,
      conversationId,
      messageId,
      existingAttachments,
    });
    return { decision, toolResult };
  }

  // Step 4: no plugin selected — return clarification
  if (decision.matchedStep === "clarification") {
    // The caller is responsible for turning this into a learner-facing question
    // via buildClarificationQuestion() in tool-router.ts
    return {
      decision,
      toolResult: {
        status: "clarification_required" as const,
        question: "", // caller fills this in via buildClarificationQuestion
      },
    };
  }

  // Routing returned null but it's not a clarification step — return unsupported
  return {
    decision,
    toolResult: {
      status: "unsupported" as const,
      reasonCode: "ROUTING_NO_PLUGIN_SELECTED",
      alternatives: decision.candidatesConsidered,
    },
  };
}

// ============================================================
// Phase AC3 — wire-in helper for postProcessReply
// ============================================================

/**
 * Thin wrapper that builds a learner-facing appendix from the pipeline result.
 *
 * Used by postProcessReply when TUTOR_PLUGIN_FRAMEWORK_ENABLED is on:
 *   - Logs the routing decision (admin observability only)
 *   - If toolResult.status === "failed": returns the safeMessage to append
 *   - If toolResult.status === "clarification_required": returns the question to append
 *   - If toolResult.status === "ready": returns empty string (no appendix needed)
 *   - If toolResult.status === "unsupported": returns empty string (existing behavior)
 *
 * The returned appendix is appended to the learner's reply as a NEW paragraph,
 * separated by a blank line. It NEVER mentions plugin IDs, schemas, or internals.
 */
export async function runPluginPipelineForReply(opts: {
  userMessage: string;
  intents: TutorIntents;
  workspaceContext: WorkspaceContext | null;
  aiReply: string;
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  existingAttachments: import("../tutor-chat-engine").TutorAttachment[];
}): Promise<{
  /** Learner-facing appendix (empty if no appendix is needed). */
  appendix: string;
  /** The full pipeline result, for admin logging. */
  pipeline: PluginPipelineResult | null;
}> {
  // If the framework flag is off, return empty appendix + null pipeline.
  if (!isPluginFrameworkEnabled()) {
    return { appendix: "", pipeline: null };
  }

  try {
    const pipeline = await runPluginPipeline(opts);

    // Admin observability log — NEVER shown to the learner
    console.log(
      `[plugin-framework] routing: pluginId=${pipeline.decision.pluginId ?? "null"}, ` +
      `step=${pipeline.decision.matchedStep}, confidence=${pipeline.decision.confidence.toFixed(2)}, ` +
      `status=${pipeline.toolResult.status}`,
    );

    if (pipeline.toolResult.status === "failed") {
      return { appendix: pipeline.toolResult.safeMessage, pipeline };
    }
    if (pipeline.toolResult.status === "clarification_required") {
      // Build a learner-facing clarifying question
      const q = pipeline.toolResult.question ||
        buildClarificationQuestion(pipeline.decision.envelope, pipeline.decision.candidatesConsidered);
      return { appendix: q, pipeline };
    }
    // ready or unsupported: no appendix
    return { appendix: "", pipeline };
  } catch (err) {
    console.warn("[plugin-framework] pipeline threw — returning empty appendix:", err);
    return { appendix: "", pipeline: null };
  }
}

// ============================================================
// Re-exports — single import site for Phase AC3 wire-in
// ============================================================

export type {
  LearningToolManifest,
  LearningToolCapabilities,
  ToolCategory,
  ActionVerb,
  ConstraintEnvelope,
  RoutingDecision,
  WorkspaceArtifact,
  WorkspaceContext,
  ToolResult,
  ToolSummary,
  LEARNER_STATUS,
} from "./plugin-types";

export {
  getManifest,
  listEnabledManifests,
  listManifestsByCategory,
  isPluginAvailable,
  pluginSupportsAction,
  filterCandidates,
} from "./plugin-registry";

export {
  detectActionVerb,
  detectCategoryAndType,
  buildConstraintEnvelope,
} from "./tutor-action-controller";

export {
  route,
  routingMismatch,
  buildClarificationQuestion,
  type AIClassifierFn,
} from "./tool-router";

export {
  getAdapter,
  runAdapter,
  wrapAttachmentAsArtifact,
  primaryAttachmentOf,
  type ToolPlugin,
  type PluginRequest,
} from "./plugin-adapters";
