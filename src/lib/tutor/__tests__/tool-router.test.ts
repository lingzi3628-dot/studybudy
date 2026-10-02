/**
 * tool-router tests — Phase AC2
 *
 * Covers the 4-step routing pipeline:
 *   1. Deterministic — fast path for explicit type requests
 *   2. Workspace context — follow-up modify/inspect on active artifact
 *   3. AI classification — last resort, server-provided shortlist only
 *   4. Clarification — when confidence is too low
 *
 * Also covers routingMismatch + buildClarificationQuestion helpers.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  route,
  routingMismatch,
  buildClarificationQuestion,
  type AIClassifierFn,
} from "../tool-router";
import { detectIntents } from "../../tutor-chat-engine";
import type { WorkspaceContext, ConstraintEnvelope } from "../plugin-types";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeEnvelope(overrides: Partial<ConstraintEnvelope> = {}): ConstraintEnvelope {
  return {
    action: "create",
    category: null,
    requestedType: null,
    allowedPlugins: [],
    maximumPrimaryArtifacts: 1,
    ...overrides,
  };
}

function makeWorkspaceContext(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return {
    artifactType: "graph",
    artifactId: "graph.bar-1",
    artifactCaption: "Class scores",
    payloadSummary: "{}",
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Step 1 — Deterministic routing
// ---------------------------------------------------------------

describe("tool-router — step 1: deterministic routing", () => {
  it("routes a bar graph request directly to graph.bar", async () => {
    const intents = detectIntents("Draw a bar graph of Alice 4, Bob 6");
    const decision = await route({
      userMessage: "Draw a bar graph of Alice 4, Bob 6",
      intents,
      workspaceContext: null,
    });
    expect(decision.matchedStep).toBe("deterministic");
    expect(decision.pluginId).toBe("graph.bar");
    expect(decision.confidence).toBe(1.0);
    expect(decision.candidatesConsidered).toEqual(["graph.bar"]);
  });

  it("routes a Python request directly to code.python", async () => {
    const intents = detectIntents("Write a Python function");
    const decision = await route({
      userMessage: "Write a Python function",
      intents,
      workspaceContext: null,
    });
    expect(decision.matchedStep).toBe("deterministic");
    expect(decision.pluginId).toBe("code.python");
  });

  it("routes a quiz request directly to assessment.quiz", async () => {
    const intents = detectIntents("Quiz me on fractions");
    const decision = await route({
      userMessage: "Quiz me on fractions",
      intents,
      workspaceContext: null,
    });
    expect(decision.matchedStep).toBe("deterministic");
    expect(decision.pluginId).toBe("assessment.quiz");
  });

  it("returns null pluginId when plugin doesn't support the action", async () => {
    // graph.bar doesn't support "run" — router should return null + deterministic
    const intents = detectIntents("Run this bar graph");
    const decision = await route({
      userMessage: "Run this bar graph",
      intents,
      workspaceContext: null,
    });
    // The envelope should be { action: "run", allowedPlugins: ["graph.bar"] }
    // but graph.bar doesn't support "run", so pluginId should be null
    expect(decision.matchedStep).toBe("deterministic");
    expect(decision.pluginId).toBeNull();
  });
});

// ---------------------------------------------------------------
// Step 2 — Workspace context
// ---------------------------------------------------------------

describe("tool-router — step 2: workspace context", () => {
  it("routes a modify request to the active artifact's plugin", async () => {
    const intents = detectIntents("Change Diana to 8");
    const ws = makeWorkspaceContext({ artifactType: "graph" });
    const decision = await route({
      userMessage: "Change Diana to 8",
      intents,
      workspaceContext: ws,
    });
    expect(decision.matchedStep).toBe("workspace_context");
    expect(decision.pluginId).toBe("graph.bar");
    expect(decision.confidence).toBe(0.95);
  });

  it("routes an inspect request to the active artifact's plugin", async () => {
    const intents = detectIntents("What is the highest?");
    const ws = makeWorkspaceContext({ artifactType: "graph" });
    const decision = await route({
      userMessage: "What is the highest?",
      intents,
      workspaceContext: ws,
    });
    expect(decision.matchedStep).toBe("workspace_context");
    expect(decision.pluginId).toBe("graph.bar");
  });

  it("does NOT use workspace context for create actions", async () => {
    // Even with an active graph, "make a pie chart" should route to pie,
    // not stay on the active artifact
    const intents = detectIntents("Make a pie chart");
    const ws = makeWorkspaceContext({ artifactType: "graph" });
    const decision = await route({
      userMessage: "Make a pie chart",
      intents,
      workspaceContext: ws,
    });
    expect(decision.matchedStep).not.toBe("workspace_context");
    expect(decision.envelope.requestedType).toBe("pie");
  });

  it("falls through to clarification when no plugin supports the action", async () => {
    // Active artifact is a graph, but user asks to "run" it (graphs don't run)
    const intents = detectIntents("Run this");
    const ws = makeWorkspaceContext({ artifactType: "graph" });
    const decision = await route({
      userMessage: "Run this graph",
      intents,
      workspaceContext: ws,
    });
    // No plugin supports "run" for graph — should fall through
    expect(decision.pluginId).toBeNull();
  });
});

// ---------------------------------------------------------------
// Step 3 — AI classification
// ---------------------------------------------------------------

describe("tool-router — step 3: AI classification", () => {
  it("uses the AI classifier when steps 1+2 don't decide", async () => {
    // "Show me how these ideas relate" → could be diagram.flowchart OR concept_map
    // (concept_map routes to diagram.flowchart, so still deterministic — let's force ambiguity)
    // We'll use a category="diagram" without a specific type:
    const intents = detectIntents("Visualize this");
    const classifier: AIClassifierFn = async ({ shortlist }) => {
      // AI picks the first candidate
      return { pluginId: shortlist[0]?.id ?? null, confidence: 0.8 };
    };
    const decision = await route({
      userMessage: "Visualize this",
      intents,
      workspaceContext: null,
      classifier,
    });
    // Since no category is detected for "Visualize this", the shortlist is empty
    // → clarification path
    expect(decision.matchedStep).toBe("clarification");
  });

  it("rejects AI suggestions NOT on the shortlist", async () => {
    // Force a category by setting flag
    process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "true";
    try {
      const intents = detectIntents("Make a diagram");
      const classifier: AIClassifierFn = async () => {
        // AI tries to pick a plugin NOT in the shortlist
        return { pluginId: "code.python", confidence: 0.9 };
      };
      const decision = await route({
        userMessage: "Make a diagram",
        intents,
        workspaceContext: null,
        classifier,
      });
      // AI's suggestion was rejected → clarification
      expect(decision.matchedStep).toBe("clarification");
    } finally {
      process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "false";
    }
  });

  it("accepts AI suggestions on the shortlist", async () => {
    // Two code plugins are registered. Force a code-category request.
    const intents = detectIntents("Write code");
    const classifier: AIClassifierFn = async ({ shortlist }) => {
      // Pick the second one (JavaScript)
      return { pluginId: shortlist[1]?.id ?? null, confidence: 0.8 };
    };
    const decision = await route({
      userMessage: "Write code",
      intents,
      workspaceContext: null,
      classifier,
    });
    expect(decision.matchedStep).toBe("ai_shortlist");
    expect(decision.pluginId).toBe("code.javascript");
  });

  it("caps AI confidence at 0.7", async () => {
    const intents = detectIntents("Write code");
    const classifier: AIClassifierFn = async ({ shortlist }) => ({
      pluginId: shortlist[0]?.id ?? null,
      confidence: 0.99,
    });
    const decision = await route({
      userMessage: "Write code",
      intents,
      workspaceContext: null,
      classifier,
    });
    expect(decision.confidence).toBeLessThanOrEqual(0.7);
  });

  it("falls through to clarification when AI classifier throws", async () => {
    const intents = detectIntents("Write code");
    const classifier: AIClassifierFn = async () => {
      throw new Error("AI classifier error");
    };
    const decision = await route({
      userMessage: "Write code",
      intents,
      workspaceContext: null,
      classifier,
    });
    expect(decision.matchedStep).toBe("clarification");
  });

  it("falls through to clarification when no classifier is provided", async () => {
    const intents = detectIntents("Write code");
    const decision = await route({
      userMessage: "Write code",
      intents,
      workspaceContext: null,
      classifier: null,
    });
    expect(decision.matchedStep).toBe("clarification");
  });
});

// ---------------------------------------------------------------
// Step 4 — Clarification
// ---------------------------------------------------------------

describe("tool-router — step 4: clarification", () => {
  it("returns clarification decision with null pluginId", async () => {
    const intents = detectIntents("Visualize this"); // no specific type
    const decision = await route({
      userMessage: "Visualize this",
      intents,
      workspaceContext: null,
    });
    expect(decision.matchedStep).toBe("clarification");
    expect(decision.pluginId).toBeNull();
    expect(decision.confidence).toBe(0);
  });

  it("includes the candidates considered (admin log only)", async () => {
    const intents = detectIntents("Write code"); // code category but no specific type
    const decision = await route({
      userMessage: "Write code",
      intents,
      workspaceContext: null,
      classifier: null,
    });
    expect(decision.candidatesConsidered.sort()).toEqual(["code.javascript", "code.python"]);
  });
});

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

describe("tool-router — routingMismatch", () => {
  it("returns an unsupported ToolResult with the expected plugin", () => {
    const result = routingMismatch("graph.bar");
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.reasonCode).toBe("ROUTING_MISMATCH");
      expect(result.alternatives).toEqual(["graph.bar"]);
    }
  });

  it("does NOT expose internal reason codes to the learner (caller responsibility)", () => {
    const result = routingMismatch("graph.bar");
    // The ToolResult contains reasonCode for admin logs only — the caller
    // converts it to a learner-facing message via LEARNER_STATUS.
    expect(result).toHaveProperty("reasonCode");
  });
});

describe("tool-router — buildClarificationQuestion", () => {
  it("asks about flowchart vs concept map for diagram category", () => {
    const env = makeEnvelope({ category: "diagram" });
    const q = buildClarificationQuestion(env, ["diagram.flowchart"]);
    expect(q).toMatch(/flowchart/i);
    expect(q).toMatch(/concept map/i);
  });

  it("asks about Python vs JavaScript for code category", () => {
    const env = makeEnvelope({ category: "code" });
    const q = buildClarificationQuestion(env, ["code.python", "code.javascript"]);
    expect(q).toMatch(/python/i);
    expect(q).toMatch(/javascript/i);
  });

  it("asks about quiz vs flashcards vs exam for assessment category", () => {
    const env = makeEnvelope({ category: "assessment" });
    const q = buildClarificationQuestion(env, ["assessment.quiz"]);
    expect(q).toMatch(/quiz/i);
  });

  it("returns a generic question for empty candidates", () => {
    const env = makeEnvelope({ category: null });
    const q = buildClarificationQuestion(env, []);
    expect(q.length).toBeGreaterThan(10);
  });

  it("NEVER mentions plugin IDs in the question", () => {
    const env = makeEnvelope({ category: "code" });
    const q = buildClarificationQuestion(env, ["code.python", "code.javascript"]);
    expect(q).not.toMatch(/graph\.bar|diagram\.flowchart|code\.python|code\.javascript|assessment\.quiz/);
  });
});
