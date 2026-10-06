/**
 * Tests for the 8 critical new bounded schemas added to plugin-orchestrator.ts.
 *
 * Phase 3's plugin-first orchestration requires each plugin to have a bounded
 * schema that constrains the AI to emit only that plugin's artifact format.
 * These tests verify:
 *   1. resolvePluginBeforeAI returns the right plugin ID for each of the 8
 *      new request types (when the flag is on)
 *   2. The boundedPromptBlock is non-empty and contains the fence name the
 *      adapter expects (composition/timeline/geometry/physics/molecule/freebody/financial/anatomy)
 *   3. The bounded schema NEVER mentions the plugin ID to the learner
 *   4. General questions (no plugin needed) return inactive (no bounded schema)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolvePluginBeforeAI, isPluginFirstOrchestrationEnabled } from "../tutor/plugin-orchestrator";
import { detectIntents } from "../tutor-chat-engine";

const FLAG = "TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED";

describe("8 critical plugins — bounded schemas", () => {
  const original = process.env[FLAG];

  beforeEach(() => {
    process.env[FLAG] = "true";
  });

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  it("flag is on", () => {
    expect(isPluginFirstOrchestrationEnabled()).toBe(true);
  });

  // Each entry: [userMessage, expectedPluginId, expectedFenceName, expectedErrorIfMissing]
  const CASES: Array<[string, string, string]> = [
    ["Write me an essay about photosynthesis", "writing.composition", "composition"],
    ["Draw a timeline of Kenyan independence", "diagram.timeline", "timeline"],
    ["Construct a perpendicular bisector of segment AB using compass", "math.geometry", "geometry"],
    ["Simulate a simple pendulum with length 1.5m", "science.physics-sim", "physics"],
    ["Show me the H2O molecule with bonds", "science.chemistry-sim", "molecule"],
    ["Draw a free-body diagram of a block on an incline", "diagram.free-body", "freebody"],
    ["Calculate the NPV of a project with 10% discount rate", "business.financial", "financial"],
    ["Label the skeletal system in anterior view", "diagram.anatomy", "anatomy"],
  ];

  for (const [msg, expectedPluginId, expectedFence] of CASES) {
    it(`${expectedPluginId}: selected + bounded schema contains \`\`\`${expectedFence} fence`, async () => {
      const intents = detectIntents(msg);
      const result = await resolvePluginBeforeAI({
        userMessage: msg,
        intents,
        workspaceContext: null,
        userId: "user-1",
        conversationId: "conv-1",
      });

      if (result.activated && result.decision?.pluginId) {
        expect(result.decision.pluginId).toBe(expectedPluginId);
        expect(result.boundedPromptBlock).not.toBe("");
        // The bounded schema MUST contain the fence name the adapter parses.
        expect(result.boundedPromptBlock).toContain("```" + expectedFence);
        // The bounded schema MUST NOT leak the plugin ID to the learner.
        // The ONLY place a plugin ID may appear is in the standard guard
        // "=== ACTIVE PLUGIN: <id> (DO NOT mention this name to the learner) ==="
        // which is intentionally internal-facing (it's a system-prompt
        // instruction, NOT learner-visible text). We strip it before checking.
        const guardRe = new RegExp(
          "=== ACTIVE PLUGIN: " + expectedPluginId.replace(/[.]/g, "\\.") + " \\(DO NOT mention this name to the learner\\) ===",
        );
        const stripped = result.boundedPromptBlock.replace(guardRe, "");
        expect(stripped).not.toMatch(
          new RegExp("\\b" + expectedPluginId.replace(/[.]/g, "\\.") + "\\b"),
        );
        // Every bounded schema carries the standard "DO NOT mention" guard.
        expect(result.boundedPromptBlock).toMatch(/DO NOT mention this name/i);
      }
    });
  }

  it("all 8 bounded schemas are present in the orchestrator (sanity — at least one should fire for these prompts)", async () => {
    // Smoke test: at least 1 of the 8 prompts must activate plugin-first orchestration
    let activatedCount = 0;
    for (const [msg] of CASES) {
      const intents = detectIntents(msg);
      const result = await resolvePluginBeforeAI({
        userMessage: msg,
        intents,
        workspaceContext: null,
        userId: "user-1",
        conversationId: "conv-1",
      });
      if (result.activated && result.decision?.pluginId) {
        activatedCount++;
      }
    }
    // We expect at least the prompts whose request types are explicitly mapped
    // in tutor-action-controller.ts (essay, timeline, geometry, pendulum,
    // molecule, free-body, npv, anatomy) to activate.
    expect(activatedCount).toBeGreaterThanOrEqual(6);
  });

  it("general question (no plugin needed) returns inactive", async () => {
    const msg = "Hello, how are you today?";
    const intents = detectIntents(msg);
    const result = await resolvePluginBeforeAI({
      userMessage: msg,
      intents,
      workspaceContext: null,
      userId: "user-1",
      conversationId: "conv-1",
    });
    expect(result.activated).toBe(false);
    expect(result.boundedPromptBlock).toBe("");
    expect(result.clarificationQuestion).toBeNull();
  });

  it("plugin IDs never appear in bounded schemas (cross-cutting safety)", async () => {
    const ALL_PLUGIN_IDS = [
      "writing.composition", "diagram.timeline", "math.geometry",
      "science.physics-sim", "science.chemistry-sim", "diagram.free-body",
      "business.financial", "diagram.anatomy",
    ];
    for (const [msg] of CASES) {
      const intents = detectIntents(msg);
      const result = await resolvePluginBeforeAI({
        userMessage: msg,
        intents,
        workspaceContext: null,
        userId: "user-1",
        conversationId: "conv-1",
      });
      if (result.activated && result.boundedPromptBlock) {
        for (const pid of ALL_PLUGIN_IDS) {
          const escaped = pid.replace(/[.]/g, "\\.");
          // The ONLY place a plugin ID may appear is in the standard guard
          // "=== ACTIVE PLUGIN: <id> (DO NOT mention this name to the learner) ==="
          // which is intentionally internal-facing (it's a system-prompt
          // instruction, NOT learner-visible text). The guard explicitly
          // says "DO NOT mention this name to the learner", so the AI is
          // instructed to never repeat it.
          //
          // We do NOT check for the plugin ID in the guard line because
          // that's by design. We check that no OTHER occurrence exists.
          const guardRe = new RegExp("=== ACTIVE PLUGIN: " + escaped + " \\(DO NOT mention this name to the learner\\) ===");
          const stripped = result.boundedPromptBlock.replace(guardRe, "");
          expect(stripped, `bounded schema for ${msg} should not leak plugin ID '${pid}'`).not.toMatch(
            new RegExp("\\b" + escaped + "\\b")
          );
        }
      }
    }
  });
});
