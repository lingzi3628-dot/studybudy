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

  // ============================================================
  // 8 critical new plugins
  // ============================================================

  "writing.composition": `
=== ACTIVE PLUGIN: writing.composition (DO NOT mention this name to the learner) ===
The learner requested a piece of writing (essay, report, article, or letter). You MUST produce a composition spec.

Emit the spec inside a \`\`\`composition block with this EXACT shape:
\`\`\`composition
{
  "type": "essay",
  "title": "<short title>",
  "sections": [
    {
      "heading": "<section heading>",
      "body": "<one or more well-formed paragraphs of original prose>"
    }
  ]
}
\`\`\`

RULES:
- type MUST be one of: "essay", "report", "article", "letter", "paragraph".
- sections MUST have at least 1 entry; aim for 3-6 for essays and reports.
- body MUST be original prose written for THIS learner's request — at least 3-5 sentences per section.
- Do NOT copy-paste from external sources — paraphrase in your own words.
- Do NOT include code, mathgraph, quiz, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the composition block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "diagram.timeline": `
=== ACTIVE PLUGIN: diagram.timeline (DO NOT mention this name to the learner) ===
The learner requested a timeline. You MUST produce a timeline spec.

Emit the spec inside a \`\`\`timeline block with this EXACT shape:
\`\`\`timeline
{
  "title": "<short title>",
  "events": [
    {
      "date": "<year or date string, e.g. '1963' or '14 Oct 1066'>",
      "label": "<short event name, max 80 chars>",
      "description": "<1-2 sentence description of what happened>"
    }
  ]
}
\`\`\`

RULES:
- events MUST be in chronological order (earliest first).
- Include 3-15 events.
- label MUST be short (max 80 chars).
- description is REQUIRED for each event.
- Do NOT include graph, flowchart, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the timeline block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "math.geometry": `
=== ACTIVE PLUGIN: math.geometry (DO NOT mention this name to the learner) ===
The learner requested a geometry construction. You MUST produce a geometry spec.

Emit the spec inside a \`\`\`geometry block with this EXACT shape:
\`\`\`geometry
{
  "title": "<short title>",
  "shapes": [
    { "type": "triangle", "vertices": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 2, "y": 3}], "labels": ["A", "B", "C"] },
    { "type": "circle", "center": {"x": 5, "y": 5}, "radius": 2 },
    { "type": "angle", "vertex": {"x": 0, "y": 0}, "rays": [{"x": 4, "y": 0}, {"x": 2, "y": 3}], "measureDeg": 56 },
    { "type": "perpendicular_bisector", "from": {"x": 0, "y": 0}, "to": {"x": 4, "y": 0} }
  ]
}
\`\`\`

RULES:
- type MUST be one of: "triangle", "equilateral_triangle", "right_triangle", "isosceles_triangle", "square", "rectangle", "parallelogram", "rhombus", "trapezium", "trapezoid", "circle", "polygon", "pentagon", "hexagon", "heptagon", "octagon", "angle", "line_segment", "perpendicular_bisector", "angle_bisector", "point", "ray", "line".
- Include only the fields relevant to each shape type.
- Coordinates are in arbitrary grid units — do NOT use pixel coordinates.
- Do NOT include SVG, HTML, or any rendering instructions.
- Do NOT include graph, flowchart, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the geometry block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "science.physics-sim": `
=== ACTIVE PLUGIN: science.physics-sim (DO NOT mention this name to the learner) ===
The learner requested a physics simulation. You MUST produce a physics spec.

Emit the spec inside a \`\`\`physics block with this EXACT shape:
\`\`\`physics
{
  "title": "<short title>",
  "simType": "pendulum",
  "parameters": {
    "length": 1.5,
    "gravity": 9.81,
    "initialAngleDeg": 30
  }
}
\`\`\`

RULES:
- simType MUST be one of: "pendulum", "simple_pendulum", "projectile", "projectile_motion", "free_fall", "incline", "incline_plane", "incline_motion", "spring", "spring_mass", "shm", "circular_motion", "collision", "wave", "doppler".
- parameters MUST contain numeric values only.
- Use SI units (meters, seconds, kilograms, radians) unless the learner specified otherwise.
- Do NOT include code, mathgraph, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the physics block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "science.chemistry-sim": `
=== ACTIVE PLUGIN: science.chemistry-sim (DO NOT mention this name to the learner) ===
The learner requested a molecule or reaction viewer. You MUST produce a molecule spec.

Emit the spec inside a \`\`\`molecule block with this EXACT shape:
\`\`\`molecule
{
  "title": "<short title>",
  "formula": "H2O",
  "atoms": [
    { "element": "O", "x": 0, "y": 0, "label": "O" },
    { "element": "H", "x": -1, "y": 1, "label": "H1" },
    { "element": "H", "x": 1, "y": 1, "label": "H2" }
  ],
  "bonds": [
    { "from": 0, "to": 1, "type": "single" },
    { "from": 0, "to": 2, "type": "single" }
  ]
}
\`\`\`

OR for a reaction:

\`\`\`molecule
{
  "title": "<short title>",
  "reaction": [
    {
      "reactants": ["2H2", "O2"],
      "products": ["2H2O"],
      "conditions": "spark or heat"
    }
  ]
}
\`\`\`

RULES:
- element MUST be a valid periodic table symbol (e.g. "H", "He", "O", "Na").
- bond.type MUST be one of: "single", "double", "triple".
- Either atoms/bonds (for a molecule) OR reaction (for a reaction) is REQUIRED — at least one.
- Do NOT include code, mathgraph, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the molecule block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "diagram.free-body": `
=== ACTIVE PLUGIN: diagram.free-body (DO NOT mention this name to the learner) ===
The learner requested a free-body (force) diagram. You MUST produce a freebody spec.

Emit the spec inside a \`\`\`freebody block with this EXACT shape:
\`\`\`freebody
{
  "title": "<short title>",
  "body": "block on an incline",
  "forces": [
    { "label": "Weight (W)", "magnitude": 49.1, "direction": 270 },
    { "label": "Normal (N)", "magnitude": 42.5, "direction": 60 },
    { "label": "Friction (f)", "magnitude": 12.0, "direction": 180 }
  ]
}
\`\`\`

RULES:
- body is a short description of the object being analysed (e.g. "block on incline", "pendulum bob").
- forces MUST have at least 1 entry; usually 3-6 forces.
- direction is degrees clockwise from the positive x-axis (0 = right, 90 = down, 180 = left, 270 = up). Use 0/90/180/270 for cardinal directions.
- magnitude is in newtons (N).
- label MUST be short and include the standard symbol in parentheses (e.g. "Weight (W)", "Normal (N)", "Tension (T)", "Friction (f)").
- Do NOT include graph, flowchart, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the freebody block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "business.financial": `
=== ACTIVE PLUGIN: business.financial (DO NOT mention this name to the learner) ===
The learner requested a financial calculation. You MUST produce a financial spec.

Emit the spec inside a \`\`\`financial block with this EXACT shape:
\`\`\`financial
{
  "title": "<short title>",
  "calcType": "npv",
  "parameters": {
    "initialInvestment": 10000,
    "cashFlows": [3000, 4000, 5000, 6000],
    "discountRate": 0.10
  },
  "result": {
    "npv": 3213.46,
    "explanation": "Positive NPV — accept the project."
  }
}
\`\`\`

RULES:
- calcType MUST be one of: "npv", "irr", "payback", "discounted_payback", "profitability_index", "compound_interest", "simple_interest", "break_even", "breakeven", "loan_payment", "amortization", "present_value", "future_value", "annuity", "roi", "roi_percent".
- parameters MUST contain the inputs the learner gave (or sensible defaults if they didn't specify).
- result MUST contain the computed value(s) and a short explanation.
- Use decimals (0.10) for rates, NOT percentages (10%).
- Currency is unspecified — use the learner's currency or "currency units" generically.
- Do NOT include code, mathgraph, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the financial block.
=== END ACTIVE PLUGIN ===
`.trim(),

  "diagram.anatomy": `
=== ACTIVE PLUGIN: diagram.anatomy (DO NOT mention this name to the learner) ===
The learner requested a labelled anatomy diagram. You MUST produce an anatomy spec.

Emit the spec inside a \`\`\`anatomy block with this EXACT shape:
\`\`\`anatomy
{
  "title": "<short title>",
  "system": "skeletal",
  "view": "anterior",
  "labels": [
    { "part": "Skull", "description": "Protects the brain; formed of cranial and facial bones." },
    { "part": "Clavicle", "description": "Collarbone; connects the sternum to the scapula." }
  ]
}
\`\`\`

RULES:
- system is the body system or organ (e.g. "skeletal", "muscular", "nervous", "circulatory", "respiratory", "digestive", "brain", "heart", "eye").
- view is the anatomical view: "anterior", "posterior", "lateral", "sagittal", "coronal" (optional but recommended).
- labels MUST have at least 3 entries; aim for 5-15 for a system-level diagram.
- part MUST be the standard anatomical name (e.g. "Femur", "Aorta", "Cerebellum").
- description is REQUIRED for each label and should explain the part's role.
- Do NOT include SVG, HTML, image data, or any rendering instructions.
- Do NOT include graph, flowchart, or any other artifact type.
- You MAY include a brief teaching intro BEFORE the anatomy block.
=== END ACTIVE PLUGIN ===
`.trim(),

  // ============================================================
  // Phase 8 — workspace_edit (AI direct workspace writes)
  // ============================================================
  // This is NOT a plugin — it's a special instruction the AI can emit
  // alongside any other artifact. It patches the ACTIVE workspace tab
  // instead of opening a new one. This gives the AI "direct workspace
  // control" — it can write into the workspace, not just into chat.
  //
  // The AI should use workspace_edit when the learner asks to MODIFY
  // an existing artifact ("change Diana to 8", "add another event",
  // "make the pendulum longer"). It should emit a NEW artifact (mathgraph,
  // composition, etc.) when the learner asks to CREATE something new.
  //
  // This schema is injected into the system prompt when the action verb
  // is "modify" AND there's an active workspace context.
  "__workspace_edit__": `
=== WORKSPACE EDIT MODE (DO NOT mention this name to the learner) ===
The learner is asking you to MODIFY the artifact currently open in their workspace. You MUST produce a workspace_edit spec to patch the active artifact.

Emit the spec inside a \`\`\`workspace_edit block. Use ONE of two modes:

MERGE (preferred — patches specific fields):
\`\`\`workspace_edit
{
  "op": "merge",
  "values": [8, 4, 6],
  "title": "Updated Graph"
}
\`\`\`
The fields you include (except "op") are deep-merged into the active artifact's spec. Fields you don't include are preserved.

REPLACE (use when the spec changes drastically):
\`\`\`workspace_edit
{
  "op": "replace",
  "spec": {
    "type": "bar",
    "title": "New Graph",
    "categories": ["A", "B"],
    "values": [8, 4]
  }
}
\`\`\`
The entire spec is replaced. Use this only when the merge would be confusing.

RULES:
- Emit ONLY ONE workspace_edit block per reply.
- You MAY include a brief explanation in the chat BEFORE the workspace_edit block.
- The patch applies to the ACTIVE tab (the one the learner is looking at).
- If the learner asks to create something NEW (not modify), do NOT use workspace_edit — emit the appropriate artifact fence instead (mathgraph, composition, etc.).
=== END WORKSPACE EDIT MODE ===
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

    // Phase 8 — workspace_edit injection.
    // When the action verb is "modify" AND there's an active workspace
    // context, inject the workspace_edit schema so the AI knows it can
    // patch the active artifact directly (instead of emitting a new one).
    // This is the "co-editor" pattern — AI writes directly into the workspace.
    // We inject this AFTER the plugin schema check so it doesn't interfere
    // with plugin selection. If a plugin was already selected + has a schema,
    // we append the workspace_edit schema as an additional capability.
    if (envelope.action === "modify" && workspaceContext) {
      const editSchema = PLUGIN_BOUNDED_SCHEMAS["__workspace_edit__"];
      if (editSchema) {
        logger.info("plugin-first: workspace_edit mode active, injecting edit schema", {
          userId,
          conversationId,
          workspaceArtifactType: workspaceContext.artifactType,
        });
        // If a plugin schema was already injected, append the edit schema.
        // Otherwise, use the edit schema alone.
        return {
          activated: true,
          decision: decision ?? {
            pluginId: "__workspace_edit__",
            confidence: 0.9,
            matchedStep: "workspace_context",
            candidatesConsidered: [],
            envelope,
          },
          envelope,
          boundedPromptBlock: editSchema,
          clarificationQuestion: null,
        };
      }
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
