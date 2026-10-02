/**
 * Phase 3 — Plugin-first orchestration tests
 *
 * Covers:
 *   - resolvePluginBeforeAI: flag off → inactive
 *   - resolvePluginBeforeAI: flag on + bar request → graph.bar selected + bounded schema
 *   - resolvePluginBeforeAI: flag on + flowchart request → diagram.flowchart selected
 *   - resolvePluginBeforeAI: flag on + ambiguous request → clarification question
 *   - resolvePluginBeforeAI: flag on + general question → inactive (no plugin)
 *   - injectBoundedPrompt: appends schema to system content
 *   - injectBoundedPrompt: empty block = no-op
 *   - Bounded schemas: graph.bar, diagram.flowchart, code.python, code.javascript, assessment.quiz
 *   - Bounded schemas: NEVER mention plugin IDs to the learner
 *   - isPluginFirstOrchestrationEnabled: flag reader
 *   - Existing contracts preserved
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolvePluginBeforeAI,
  injectBoundedPrompt,
  isPluginFirstOrchestrationEnabled,
} from "../tutor/plugin-orchestrator";
import { detectIntents } from "../tutor-chat-engine";

// ============================================================
// Feature flag reader
// ============================================================

describe("Phase 3 — Feature flag reader", () => {
  const originalFlag = process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
    else process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = originalFlag;
  });

  it("returns false by default when flag is absent", () => {
    delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
    expect(isPluginFirstOrchestrationEnabled()).toBe(false);
  });

  it("returns false when flag is 'false'", () => {
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "false";
    expect(isPluginFirstOrchestrationEnabled()).toBe(false);
  });

  it("returns true when flag is 'true'", () => {
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "true";
    expect(isPluginFirstOrchestrationEnabled()).toBe(true);
  });

  it("returns true when flag is '1' or 'on'", () => {
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "1";
    expect(isPluginFirstOrchestrationEnabled()).toBe(true);
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "on";
    expect(isPluginFirstOrchestrationEnabled()).toBe(true);
  });
});

// ============================================================
// resolvePluginBeforeAI — flag off (inactive)
// ============================================================

describe("Phase 3 — resolvePluginBeforeAI flag off", () => {
  beforeEach(() => {
    delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
  });

  it("returns inactive when flag is off (bar graph request)", async () => {
    const intents = detectIntents("Draw a bar graph of Alice 4, Bob 6");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a bar graph of Alice 4, Bob 6",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(false);
    expect(result.boundedPromptBlock).toBe("");
    expect(result.clarificationQuestion).toBeNull();
    expect(result.decision).toBeNull();
  });

  it("returns inactive when flag is off (flowchart request)", async () => {
    const intents = detectIntents("Draw a flowchart of the login process");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a flowchart of the login process",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(false);
  });
});

// ============================================================
// resolvePluginBeforeAI — flag on (active)
// ============================================================

describe("Phase 3 — resolvePluginBeforeAI flag on (plugin selected)", () => {
  const originalFlag = process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
  const originalFcFlag = process.env.TUTOR_FLOWCHART_GENERATION_ENABLED;

  beforeEach(() => {
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "true";
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
    else process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = originalFlag;
    if (originalFcFlag === undefined) delete process.env.TUTOR_FLOWCHART_GENERATION_ENABLED;
    else process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = originalFcFlag;
  });

  it("selects graph.bar + injects bounded schema for bar graph request", async () => {
    const intents = detectIntents("Draw a bar graph of Alice 4, Bob 6");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a bar graph of Alice 4, Bob 6",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(true);
    expect(result.decision?.pluginId).toBe("graph.bar");
    expect(result.boundedPromptBlock).toContain("graph.bar");
    expect(result.boundedPromptBlock).toContain("mathgraph");
    expect(result.boundedPromptBlock).toContain('"type": "bar"');
    expect(result.boundedPromptBlock).toContain("categories");
    expect(result.boundedPromptBlock).toContain("values");
    expect(result.clarificationQuestion).toBeNull();
  });

  it("selects diagram.flowchart + injects bounded schema for flowchart request", async () => {
    process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "true";
    const intents = detectIntents("Draw a flowchart of the login process");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a flowchart of the login process",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(true);
    expect(result.decision?.pluginId).toBe("diagram.flowchart");
    expect(result.boundedPromptBlock).toContain("flowchart_v1");
    expect(result.boundedPromptBlock).toContain("nodes");
    expect(result.boundedPromptBlock).toContain("edges");
  });

  it("selects code.python + injects bounded schema for Python request", async () => {
    const intents = detectIntents("Write a Python function to calculate factorial");
    const result = await resolvePluginBeforeAI({
      userMessage: "Write a Python function to calculate factorial",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(true);
    expect(result.decision?.pluginId).toBe("code.python");
    expect(result.boundedPromptBlock).toContain("python");
    expect(result.boundedPromptBlock).toContain("```python");
  });

  it("selects code.javascript + injects bounded schema for JS request", async () => {
    const intents = detectIntents("Write a JavaScript function to reverse a string");
    const result = await resolvePluginBeforeAI({
      userMessage: "Write a JavaScript function to reverse a string",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(true);
    expect(result.decision?.pluginId).toBe("code.javascript");
    expect(result.boundedPromptBlock).toContain("javascript");
    expect(result.boundedPromptBlock).toContain("```javascript");
  });

  it("selects assessment.quiz + injects bounded schema for quiz request", async () => {
    const intents = detectIntents("Quiz me on fractions");
    const result = await resolvePluginBeforeAI({
      userMessage: "Quiz me on fractions",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(true);
    expect(result.decision?.pluginId).toBe("assessment.quiz");
    expect(result.boundedPromptBlock).toContain("quiz");
    expect(result.boundedPromptBlock).toContain("correctIndex");
    expect(result.boundedPromptBlock).toContain("explanation");
  });
});

// ============================================================
// resolvePluginBeforeAI — clarification (ambiguous request)
// ============================================================

describe("Phase 3 — resolvePluginBeforeAI clarification", () => {
  const originalFlag = process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;

  beforeEach(() => {
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "true";
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
    else process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = originalFlag;
  });

  it("returns clarification question for ambiguous 'write code' request (no language specified)", async () => {
    const intents = detectIntents("Write code to sort a list");
    const result = await resolvePluginBeforeAI({
      userMessage: "Write code to sort a list",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    // "Write code" matches the generic code fallback → category=code, requestedType=null
    // The router should pick a plugin OR ask for clarification
    // Since both code.python and code.javascript are candidates, the router
    // falls through to clarification
    expect(result.activated).toBe(true);
    expect(result.clarificationQuestion).toBeTruthy();
    expect(result.clarificationQuestion).toMatch(/python|javascript/i);
    expect(result.boundedPromptBlock).toBe(""); // no bounded schema when clarifying
  });

  it("clarification question NEVER mentions plugin IDs", async () => {
    const intents = detectIntents("Write code");
    const result = await resolvePluginBeforeAI({
      userMessage: "Write code",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    if (result.clarificationQuestion) {
      expect(result.clarificationQuestion).not.toMatch(/graph\.bar|diagram\.flowchart|code\.python|code\.javascript|assessment\.quiz/i);
    }
  });
});

// ============================================================
// resolvePluginBeforeAI — general question (no plugin)
// ============================================================

describe("Phase 3 — resolvePluginBeforeAI general question (no plugin)", () => {
  const originalFlag = process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;

  beforeEach(() => {
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "true";
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
    else process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = originalFlag;
  });

  it("returns inactive for general question (no plugin selected)", async () => {
    const intents = detectIntents("Hello, how are you?");
    const result = await resolvePluginBeforeAI({
      userMessage: "Hello, how are you?",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(false);
    expect(result.boundedPromptBlock).toBe("");
    expect(result.clarificationQuestion).toBeNull();
  });

  it("returns inactive for math explanation question", async () => {
    const intents = detectIntents("Explain how photosynthesis works");
    const result = await resolvePluginBeforeAI({
      userMessage: "Explain how photosynthesis works",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(false);
  });
});

// ============================================================
// injectBoundedPrompt
// ============================================================

describe("Phase 3 — injectBoundedPrompt", () => {
  it("appends bounded schema to system content", () => {
    const systemContent = "You are StudyBuddy. Teach the student.";
    const boundedBlock = "=== ACTIVE PLUGIN: graph.bar ===\nEmit type: bar\n=== END ===";
    const result = injectBoundedPrompt(systemContent, boundedBlock);
    expect(result).toContain("You are StudyBuddy");
    expect(result).toContain("ACTIVE PLUGIN: graph.bar");
    expect(result).toContain("Emit type: bar");
    // Bounded block should be AFTER the base system content
    expect(result.indexOf("You are StudyBuddy")).toBeLessThan(result.indexOf("ACTIVE PLUGIN"));
  });

  it("returns system content unchanged when bounded block is empty", () => {
    const systemContent = "You are StudyBuddy.";
    const result = injectBoundedPrompt(systemContent, "");
    expect(result).toBe(systemContent);
  });

  it("handles empty system content + non-empty bounded block", () => {
    const result = injectBoundedPrompt("", "=== ACTIVE PLUGIN ===");
    expect(result).toContain("ACTIVE PLUGIN");
  });
});

// ============================================================
// Bounded schemas — security invariants
// ============================================================

describe("Phase 3 — Bounded schemas never mention plugin IDs to learner", () => {
  const originalFlag = process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
  const originalFcFlag = process.env.TUTOR_FLOWCHART_GENERATION_ENABLED;

  beforeEach(() => {
    process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = "true";
    process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "true";
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
    else process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED = originalFlag;
    if (originalFcFlag === undefined) delete process.env.TUTOR_FLOWCHART_GENERATION_ENABLED;
    else process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = originalFcFlag;
  });

  it("graph.bar bounded schema tells AI to NOT mention plugin name to learner", async () => {
    const intents = detectIntents("Draw a bar graph");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a bar graph",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.boundedPromptBlock).toContain("DO NOT mention this name to the learner");
  });

  it("diagram.flowchart bounded schema tells AI to NOT mention plugin name", async () => {
    const intents = detectIntents("Draw a flowchart");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a flowchart",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.boundedPromptBlock).toContain("DO NOT mention this name to the learner");
  });

  it("code.python bounded schema tells AI to NOT mention plugin name", async () => {
    const intents = detectIntents("Write Python code");
    const result = await resolvePluginBeforeAI({
      userMessage: "Write Python code",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.boundedPromptBlock).toContain("DO NOT mention this name to the learner");
  });

  it("code.javascript bounded schema tells AI to NOT mention plugin name", async () => {
    const intents = detectIntents("Write JavaScript code");
    const result = await resolvePluginBeforeAI({
      userMessage: "Write JavaScript code",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.boundedPromptBlock).toContain("DO NOT mention this name to the learner");
  });

  it("assessment.quiz bounded schema tells AI to NOT mention plugin name", async () => {
    const intents = detectIntents("Quiz me on fractions");
    const result = await resolvePluginBeforeAI({
      userMessage: "Quiz me on fractions",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.boundedPromptBlock).toContain("DO NOT mention this name to the learner");
  });

  it("bounded schemas constrain AI to ONLY the selected artifact type", async () => {
    const intents = detectIntents("Draw a bar graph");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a bar graph",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    // graph.bar schema must say "type MUST be bar" and "do NOT emit scatter, pie, line"
    expect(result.boundedPromptBlock).toContain("type MUST be");
    expect(result.boundedPromptBlock).toMatch(/do NOT emit scatter|pie|line/i);
  });

  it("flowchart bounded schema forbids coordinates", async () => {
    const intents = detectIntents("Draw a flowchart");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a flowchart",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.boundedPromptBlock).toContain("Do NOT include x, y, width, height");
    expect(result.boundedPromptBlock).toContain("svg, html");
  });
});

// ============================================================
// Existing contracts preserved
// ============================================================

describe("Phase 3 — Existing contracts preserved", () => {
  it("resolvePluginBeforeAI function exists + accepts correct args", () => {
    expect(typeof resolvePluginBeforeAI).toBe("function");
  });

  it("injectBoundedPrompt function exists", () => {
    expect(typeof injectBoundedPrompt).toBe("function");
  });

  it("isPluginFirstOrchestrationEnabled function exists", () => {
    expect(typeof isPluginFirstOrchestrationEnabled).toBe("function");
  });

  it("flag off = zero behavior change (returns inactive)", async () => {
    delete process.env.TUTOR_PLUGIN_FIRST_ORCHESTRATION_ENABLED;
    const intents = detectIntents("Draw a bar graph");
    const result = await resolvePluginBeforeAI({
      userMessage: "Draw a bar graph",
      intents,
      workspaceContext: null,
      userId: "u1",
      conversationId: "conv1",
    });
    expect(result.activated).toBe(false);
    expect(result.boundedPromptBlock).toBe("");
    expect(result.clarificationQuestion).toBeNull();
  });
});
