/**
 * Tool Router — Phase AC2
 *
 * 4-step plugin selection:
 *   1. Deterministic routing — clear requests handled by rules (cheap, fast)
 *   2. Workspace context — follow-up modify/inspect targets the active artifact
 *   3. AI classification — ambiguous requests use AI on a SHORT shortlist
 *   4. Clarification — if confidence is low, ask the learner
 *
 * The AI is only consulted in step 3, and only with a server-provided shortlist
 * (it cannot invent plugin IDs).
 *
 * NOT WIRED INTO CHAT FLOW YET — see TUTOR_PLUGIN_FRAMEWORK_ENABLED flag.
 */

import type {
  ActionVerb,
  ConstraintEnvelope,
  RoutingDecision,
  WorkspaceContext,
  ToolResult,
} from "./plugin-types";
import { getManifest, filterCandidates, listManifestsByCategory } from "./plugin-registry";
import { buildConstraintEnvelope } from "./tutor-action-controller";
import type { TutorIntents } from "../tutor-chat-engine";

// ============================================================
// Routing thresholds
// ============================================================

/** Confidence threshold below which the router asks for clarification. */
const CLARIFICATION_THRESHOLD = 0.55;

/** Confidence assigned to deterministic matches. */
const DETERMINISTIC_CONFIDENCE = 1.0;

/** Confidence assigned to workspace-context matches. */
const WORKSPACE_CONTEXT_CONFIDENCE = 0.95;

/** Confidence assigned to AI classification when it picks from the shortlist. */
const AI_SHORTLIST_CONFIDENCE = 0.7;

// ============================================================
// Step 1 — Deterministic routing
// ============================================================

/**
 * Check whether the constraint envelope already pins a single plugin.
 * This is the fast path — no AI needed.
 */
function tryDeterministic(envelope: ConstraintEnvelope): RoutingDecision | null {
  if (envelope.allowedPlugins.length === 1) {
    const pluginId = envelope.allowedPlugins[0];
    const manifest = getManifest(pluginId);
    if (!manifest) {
      return null; // plugin not available — let the next step handle it
    }
    if (!manifest.supportedActions.includes(envelope.action)) {
      // Plugin doesn't support the requested action — return a decision with
      // null pluginId so the caller can surface "unsupported".
      return {
        pluginId: null,
        confidence: 1.0,
        matchedStep: "deterministic",
        candidatesConsidered: [pluginId],
        envelope,
      };
    }
    return {
      pluginId,
      confidence: DETERMINISTIC_CONFIDENCE,
      matchedStep: "deterministic",
      candidatesConsidered: [pluginId],
      envelope,
    };
  }
  return null;
}

// ============================================================
// Step 2 — Workspace context (follow-up on active artifact)
// ============================================================

/**
 * If the learner is looking at an artifact and asks an inspect/modify question,
 * the router should NOT search for a new plugin. The envelope is already
 * constrained to the active plugin by buildConstraintEnvelope.
 *
 * This step re-confirms the workspace plugin is enabled and supports the action.
 */
function tryWorkspaceContext(
  envelope: ConstraintEnvelope,
  workspaceContext: WorkspaceContext | null,
): RoutingDecision | null {
  if (!workspaceContext) return null;
  if (envelope.action !== "modify" && envelope.action !== "inspect") return null;
  if (envelope.allowedPlugins.length !== 1) return null;

  const pluginId = envelope.allowedPlugins[0];
  const manifest = getManifest(pluginId);
  if (!manifest) return null;
  if (!manifest.supportedActions.includes(envelope.action)) return null;

  return {
    pluginId,
    confidence: WORKSPACE_CONTEXT_CONFIDENCE,
    matchedStep: "workspace_context",
    candidatesConsidered: [pluginId],
    envelope,
  };
}

// ============================================================
// Step 3 — AI classification (only on a shortlist)
// ============================================================

export type AIClassifierFn = (opts: {
  userMessage: string;
  shortlist: Array<{ id: string; searchTerms: string[]; description: string }>;
}) => Promise<{ pluginId: string | null; confidence: number }>;

/**
 * Build a shortlist of candidate plugins for the AI to choose from.
 * Sources:
 *   - envelope.allowedPlugins (if any)
 *   - all enabled plugins in envelope.category (if category is set)
 *   - all enabled plugins (last resort — should be rare)
 *
 * The shortlist is ALWAYS server-provided. The AI picks from this list only.
 */
function buildShortlist(envelope: ConstraintEnvelope): string[] {
  if (envelope.allowedPlugins.length > 0) {
    return filterCandidates(envelope.allowedPlugins, envelope.action).map((m) => m.id);
  }
  if (envelope.category) {
    return listManifestsByCategory(envelope.category)
      .filter((m) => m.supportedActions.includes(envelope.action))
      .map((m) => m.id);
  }
  // No category and no allowedPlugins — this is an unusual case. Return an
  // empty shortlist so the router asks for clarification rather than guessing.
  return [];
}

async function tryAIClassification(
  envelope: ConstraintEnvelope,
  userMessage: string,
  classifier: AIClassifierFn | null,
): Promise<RoutingDecision | null> {
  if (!classifier) return null; // no AI classifier available → fall through
  const shortlistIds = buildShortlist(envelope);
  if (shortlistIds.length === 0) return null;

  const shortlist = shortlistIds.map((id) => {
    const m = getManifest(id)!;
    return {
      id,
      searchTerms: m.searchTerms,
      description: `${m.category} plugin supporting: ${m.supportedActions.join(", ")}`,
    };
  });

  try {
    const result = await classifier({ userMessage, shortlist });
    if (!result.pluginId) return null;
    // Verify the AI's pick is on the shortlist (defense in depth)
    if (!shortlistIds.includes(result.pluginId)) {
      console.warn(
        `[tool-router] AI returned pluginId "${result.pluginId}" which is NOT on the shortlist — ignoring`,
      );
      return null;
    }
    const manifest = getManifest(result.pluginId);
    if (!manifest) return null;
    if (!manifest.supportedActions.includes(envelope.action)) return null;

    return {
      pluginId: result.pluginId,
      confidence: Math.min(result.confidence, AI_SHORTLIST_CONFIDENCE),
      matchedStep: "ai_shortlist" as const,
      candidatesConsidered: shortlistIds,
      envelope,
    };
  } catch (err) {
    console.warn("[tool-router] AI classifier threw, falling through to clarification:", err);
    return null;
  }
}

// ============================================================
// Step 4 — Clarification
// ============================================================

function clarificationDecision(
  envelope: ConstraintEnvelope,
  candidates: string[],
): RoutingDecision {
  return {
    pluginId: null,
    confidence: 0,
    matchedStep: "clarification",
    candidatesConsidered: candidates,
    envelope,
  };
}

// ============================================================
// Main entry — route()
// ============================================================

/**
 * Run the 4-step routing pipeline.
 *
 * @param userMessage The learner's message
 * @param intents Detected intents (from detectIntents in tutor-chat-engine)
 * @param workspaceContext Active workspace artifact, or null
 * @param classifier Optional AI classifier — only invoked when steps 1+2 fail
 *
 * @returns RoutingDecision with pluginId (or null for clarification) + confidence
 */
export async function route(opts: {
  userMessage: string;
  intents: TutorIntents;
  workspaceContext: WorkspaceContext | null;
  classifier?: AIClassifierFn | null;
}): Promise<RoutingDecision> {
  const { userMessage, intents, workspaceContext, classifier = null } = opts;

  // Build the constraint envelope first — this captures action + allowedPlugins
  const envelope = buildConstraintEnvelope({ userMessage, intents, workspaceContext });

  // Step 2 FIRST: workspace context — follow-up on active artifact.
  // We check this BEFORE deterministic because the envelope already has
  // allowedPlugins=["<active>"] when workspace context applies, and we want
  // the matchedStep to record "workspace_context" (not "deterministic") so
  // downstream analytics can distinguish follow-up turns from new requests.
  // If workspace-context check returns null (e.g. action not supported),
  // we fall through to the deterministic path.
  const wsContext = tryWorkspaceContext(envelope, workspaceContext);
  if (wsContext) return wsContext;

  // Step 1: deterministic routing — fast path for explicit type requests.
  const deterministic = tryDeterministic(envelope);
  if (deterministic) return deterministic;

  // Step 3: AI classification — only on a server-provided shortlist
  const aiPick = await tryAIClassification(envelope, userMessage, classifier);
  if (aiPick && aiPick.confidence >= CLARIFICATION_THRESHOLD) {
    return aiPick;
  }

  // Step 4: clarification — confidence too low, ask the learner
  const candidates = buildShortlist(envelope);
  return clarificationDecision(envelope, candidates);
}

// ============================================================
// Helper — convert a routing mismatch into a ToolResult
// ============================================================

/**
 * If the AI produced a valid spec but the requested type doesn't match what
 * was selected, return `unsupported`. The caller should then route to the
 * correct plugin OR ask for missing values.
 *
 * Example: learner asks for a bar graph, AI produced a scatter spec →
 *   { status: "unsupported", reasonCode: "ROUTING_MISMATCH",
 *     alternatives: ["graph.bar"] }
 */
export function routingMismatch(expectedPluginId: string): ToolResult {
  return {
    status: "unsupported",
    reasonCode: "ROUTING_MISMATCH",
    alternatives: [expectedPluginId],
  };
}

// ============================================================
// Helper — build clarification ToolResult for the learner
// ============================================================

/**
 * Generate a learner-facing clarifying question. NEVER mentions plugin IDs.
 */
export function buildClarificationQuestion(
  envelope: ConstraintEnvelope,
  candidates: string[],
): string {
  if (candidates.length === 0) {
    return "Could you tell me a bit more about what you'd like to do?";
  }
  if (envelope.category === "diagram") {
    return "Would you like a step-by-step flowchart, or a concept map showing the relationships?";
  }
  if (envelope.category === "code") {
    return "Would you like me to use Python or JavaScript for that?";
  }
  if (envelope.category === "assessment") {
    return "Would you like a quiz, flashcards, or a practice exam?";
  }
  return "Could you tell me a bit more about what you'd like to do?";
}
