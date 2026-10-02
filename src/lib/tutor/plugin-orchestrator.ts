/**
 * Plugin Orchestrator — Phase 3
 *
 * Pre-AI action resolution + plugin selection.
 *
 * ARCHITECTURE SHIFT (Phase 3):
 *   OLD (AC1-AC3): AI replies freely → parseGraphAttachments validates afterward
 *   NEW (Phase 3): resolve action → select plugin → give AI bounded schema → validate
 *
 * Pipeline:
 *   1. detectIntents (already done by caller)
 *   2. buildConstraintEnvelope (action + allowedPlugins)
 *   3. route (deterministic → workspace → AI shortlist → clarification)
 *   4. If a plugin is selected: inject that plugin's BOUNDED SCHEMA into the
 *      system prompt so the AI can only emit the selected artifact type.
 *   5. After AI replies: the existing adapter validates the output (unchanged
 *      from AC3). The difference is the AI was constrained upfront, so the
 *      output is much more likely to be valid.
 *
 * FEATURE FLAG:
 *   TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED (default: off)
 *   When off: existing behavior (AI replies freely, post-validated by AC1/AC3)
 *   When on: pre-AI plugin selection + bounded schema injection
 *
 * BACKWARD COMPATIBILITY:
 *   - When flag is off: zero behavior change
 *   - When flag is on but no plugin is selected (e.g. general question):
 *     the AI replies freely (same as flag off — no constraint injected)
 *   - When flag is on + clarification required: the route short-circuits
 *     with a clarifying question (no AI call wasted)
 *   - Existing parseGraphAttachments still runs for backward compat with
 *     any specs the AI emits. When a plugin was pre-selected, the adapter
 *     validates the output. When no plugin was selected, the legacy
 *     post-validation path runs unchanged.
 */

import type { TutorIntents } from "../tutor-chat-engine";
import type { WorkspaceContext, ConstraintEnvelope, RoutingDecision } from "./plugin-types";
import { buildConstraintEnvelope } from "./tutor-action-controller";
import { route, buildClarificationQuestion } from "./tool-router";
import { getManifest } from "./plugin-registry";
import { logger } from "../logger";

// ============================================================
// Feature flag
// ============================================================

export function isPluginFirstOrchestrationEnabled(): boolean {
  const flag = (process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED ?? "false")
    .toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "on";
}

// ============================================================
// Types
// ============================================================

export type PluginOrchestrationResult = {
  /** Whether plugin-first orchestration ran (flag on + plugin selected) */
  activated: boolean;
  /** The routing decision (for logging + adapter validation) */
  decision: RoutingDecision | null;
  /** The constraint envelope (action + allowedPlugins) */
  envelope: ConstraintEnvelope | null;
  /**
   * The bounded prompt block to inject into the system prompt.
   * Empty string when no plugin was selected (AI replies freely).
   * Non-empty when a plugin was selected — constrains the AI to emit
   * only that plugin's artifact format.
   */
  boundedPromptBlock: string;
  /**
   * If the router returned "clarification_required", this is the
   * learner-facing question. The route should short-circuit and
   * return this question instead of calling the AI.
   */
  clarificationQuestion: string | null;
};

// ============================================================
// Per-plugin bounded schemas
// ============================================================

/**
 * Each plugin's bounded schema tells the AI:
 *   - What artifact type to produce (and ONLY that type)
 *   - The exact JSON shape to emit
 *   - What NOT to emit (no coordinates, no HTML, no SVG, no scripts)
 *   - Where to put the spec (```mathgraph block)
 *
 * These are MINIMAL — they constrain the AI's output without duplicating
 * the full STUDY_PROMPT_GRAPH_RULES (which still applies for teaching style).
 */
const PLUGIN_BOUNDED_SCHEMAS: Record<string, string> = {
  "graph.bar": `
=== ACTIVE PLUGIN: graph.bar (DO NOT mention this name to the learner) ===
The learner requested a bar graph. You MUST produce a bar graph spec and NOTHING else visual.

Emit the spec inside a \`\`\`mathgraph block with this EXACT shape:
\`\`\`mathgraph
{
  "type": "bar",
  "title": "<short title>",
  "categories": ["<category1>", "<category2>", ...],
  "values": [<number1>, <number2>, ...],
  "xAxisLabel": "<optional label>",
  "yAxisLabel": "<optional label>"
}
\`\`\`

RULES:
- type MUST be "bar" — do NOT emit scatter, pie, line, or any other type.
- categories and values arrays MUST have the same length.
- values MUST be numbers (not strings).
- If the learner didn't provide data, ask them for it — do NOT invent data.
- You MAY include a short teaching explanation BEFORE the mathgraph block.
- Do NOT emit raw JSON outside the mathgraph block.
- Do NOT emit SVG, HTML, or coordinates.
=== END ACTIVE PLUGIN ===
`.trim(),

  "diagram.flowchart": `
=== ACTIVE PLUGIN: diagram.flowchart (DO NOT mention this name to the learner) ===
The learner requested a flowchart. You MUST produce a flowchart_v1 spec and NOTHING else visual.

Emit the spec inside a \`\`\`mathgraph block with this EXACT shape:
\`\`\`mathgraph
{
  "type": "flowchart_v1",
  "schemaVersion": 1,
  "title": "<short title>",
  "direction": "top_to_bottom",
  "nodes": [
    { "id": "n1", "label": "<short label>", "shape": "terminator" },
    { "id": "n2", "label": "<short label>", "shape": "rectangle" },
    { "id": "n3", "label": "<question?>", "shape": "diamond" }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" }
  ]
}
\`\`\`

RULES:
- type MUST be "flowchart_v1" — do NOT emit scene, network, or any other type.
- Do NOT include x, y, width, height, svg, html, or any coordinates.
- shape MUST be one of: "rectangle", "rounded_rectangle", "diamond", "terminator", "input_output".
- Node labels MUST be short (max 80 chars).
- Max 30 nodes, max 50 edges.
- You MAY include a short teaching explanation BEFORE the mathgraph block.
- Do NOT emit raw JSON outside the mathgraph block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "code.python": `
=== ACTIVE PLUGIN: code.python (DO NOT mention this name to the learner) ===
The learner requested Python code. You MUST produce a Python code block.

Emit the code inside a \`\`\`python block:
\`\`\`python
# your code here
\`\`\`

RULES:
- The code MUST be valid Python 3.
- Include a brief comment explaining what the code does.
- You MAY include a short teaching explanation BEFORE the code block.
- Do NOT attempt to run the code — the learner will run it themselves.
- Do NOT emit JavaScript, HTML, or any other language.
=== END ACTIVE PLUGIN ===
`.trim(),

  "code.javascript": `
=== ACTIVE PLUGIN: code.javascript (DO NOT mention this name to the learner) ===
The learner requested JavaScript code. You MUST produce a JavaScript code block.

Emit the code inside a \`\`\`javascript block:
\`\`\`javascript
// your code here
\`\`\`

RULES:
- The code MUST be valid JavaScript (Node.js compatible).
- Include a brief comment explaining what the code does.
- You MAY include a short teaching explanation BEFORE the code block.
- Do NOT attempt to run the code — the learner will run it themselves.
- Do NOT emit Python, HTML, or any other language.
=== END ACTIVE PLUGIN ===
`.trim(),

  "assessment.quiz": `
=== ACTIVE PLUGIN: assessment.quiz (DO NOT mention this name to the learner) ===
The learner requested a quiz. You MUST produce a quiz spec.

Emit the spec inside a \`\`\`quiz block with this EXACT shape:
\`\`\`quiz
{
  "title": "<short title>",
  "questions": [
    {
      "question": "<question text>",
      "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "correctIndex": 0,
      "explanation": "<why this is correct>"
    }
  ]
}
\`\`\`

RULES:
- Include 3-5 questions.
- Each question MUST have 2-4 options.
- correctIndex is the 0-based index of the correct answer.
- explanation is REQUIRED for each question.
- You MAY include a short teaching intro BEFORE the quiz block.
- Do NOT emit graph, flowchart, or any other artifact type.
=== END ACTIVE PLUGIN ===
`.trim(),
};

// ============================================================
// Main entry point — pre-AI plugin resolution
// ============================================================

/**
 * Run pre-AI plugin resolution.
 *
 * Called by /api/tutor/chat + /api/tutor/chat/stream AFTER detectIntents
 * but BEFORE buildTutorSystemPrompt + callAI.
 *
 * When the flag is on + a plugin is selected:
 *   - Returns a boundedPromptBlock to inject into the system prompt
 *   - The AI is constrained to emit only that plugin's artifact format
 *
 * When the flag is on + clarification is required:
 *   - Returns a clarificationQuestion
 *   - The route should short-circuit + return the question (no AI call)
 *
 * When the flag is off or no plugin is selected:
 *   - Returns activated=false, empty boundedPromptBlock, null clarification
 *   - The route proceeds with the existing (unconstrained) AI call
 */
export async function resolvePluginBeforeAI(opts: {
  userMessage: string;
  intents: TutorIntents;
  workspaceContext: WorkspaceContext | null;
  userId: string;
  conversationId: string | null;
}): Promise<PluginOrchestrationResult> {
  const { userMessage, intents, workspaceContext, userId, conversationId } = opts;

  // Default result — flag off or no plugin selected
  const inactive: PluginOrchestrationResult = {
    activated: false,
    decision: null,
    envelope: null,
    boundedPromptBlock: "",
    clarificationQuestion: null,
  };

  // Check feature flag
  if (!isPluginFirstOrchestrationEnabled()) {
    return inactive;
  }

  try {
    // Step 1: build constraint envelope
    const envelope = buildConstraintEnvelope({
      userMessage,
      intents,
      workspaceContext,
    });

    // Step 2: route to a plugin (or clarification)
    const decision = await route({
      userMessage,
      intents,
      workspaceContext,
      classifier: null, // no AI classifier in Phase 3 — deterministic + workspace only
    });

    // Step 3: handle clarification — short-circuit with a question ONLY when
    // there are real candidates (ambiguous request between plugins).
    // When candidatesConsidered is empty, it's a general question with no
    // plugin needed — return inactive (AI replies freely).
    if (decision.matchedStep === "clarification" && !decision.pluginId) {
      // No candidates = general question (e.g. "Hello", "Explain photosynthesis")
      // → return inactive, let the AI reply freely
      if (decision.candidatesConsidered.length === 0) {
        return inactive;
      }
      // Candidates exist = ambiguous between plugins (e.g. "Write code" → Python vs JS)
      // → ask for clarification
      const question = buildClarificationQuestion(envelope, decision.candidatesConsidered);
      logger.info("plugin-first: clarification required", {
        userId,
        conversationId,
        candidates: decision.candidatesConsidered,
      });
      return {
        activated: true,
        decision,
        envelope,
        boundedPromptBlock: "",
        clarificationQuestion: question,
      };
    }

    // Step 4: if a plugin was selected, inject its bounded schema
    if (decision.pluginId) {
      const manifest = getManifest(decision.pluginId);
      const boundedSchema = manifest ? PLUGIN_BOUNDED_SCHEMAS[decision.pluginId] : null;

      if (boundedSchema) {
        logger.info("plugin-first: plugin selected, injecting bounded schema", {
          userId,
          conversationId,
          pluginId: decision.pluginId,
          matchedStep: decision.matchedStep,
          confidence: decision.confidence,
        });
        return {
          activated: true,
          decision,
          envelope,
          boundedPromptBlock: boundedSchema,
          clarificationQuestion: null,
        };
      }

      // Plugin selected but no bounded schema defined — log + fall through to inactive
      logger.warn("plugin-first: plugin selected but no bounded schema defined", {
        userId,
        pluginId: decision.pluginId,
      });
    }

    // No plugin selected — AI replies freely (same as flag off)
    return inactive;
  } catch (err: any) {
    // Orchestrator must never break the chat flow
    logger.warn("plugin-first: orchestrator threw, falling back to unconstrained AI", {
      userId,
      error: err?.message ?? String(err),
    });
    return inactive;
  }
}

// ============================================================
// Helper — inject bounded prompt into system content
// ============================================================

/**
 * Inject the bounded prompt block into the system content.
 *
 * Appends the bounded schema AFTER the existing system prompt (so the
 * teaching rules + context still apply, but the AI is additionally
 * constrained to emit only the selected plugin's artifact format).
 *
 * When boundedPromptBlock is empty, this is a no-op.
 */
export function injectBoundedPrompt(systemContent: string, boundedPromptBlock: string): string {
  if (!boundedPromptBlock) return systemContent;
  return `${systemContent}\n\n${boundedPromptBlock}`;
}

// ============================================================
// Helper — should skip post-validation for pre-selected plugin?
// ============================================================

/**
 * When a plugin was pre-selected (Phase 3), the AI was constrained upfront.
 * The existing parseGraphAttachments still runs (for backward compat), but
 * the adapter (runPluginPipelineForReply) is the authoritative validator.
 *
 * This function tells the caller whether to skip the legacy post-validation
 * path. Currently returns false (keep both paths) for safety — the legacy
 * path catches any specs the AI emits even when constrained. A future phase
 * can return true to fully skip legacy validation when a plugin was selected.
 */
export function shouldSkipLegacyPostValidation(decision: RoutingDecision | null): boolean {
  // Phase 3: keep both paths for safety. The bounded schema constrains the AI,
  // but if it still emits an off-type spec, the legacy AC1 whitelist catches it.
  // Phase 4+ can return true when confidence is high enough.
  return false;
}
