/**
 * tutor-action-controller tests — Phase AC2
 *
 * Covers action verb detection, category + requestedType detection, and
 * the constraint envelope builder (including workspace-context shortcut).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectActionVerb,
  detectCategoryAndType,
  buildConstraintEnvelope,
  _internalDetectWantsLineGraph,
} from "../tutor-action-controller";
import { detectIntents } from "../../tutor-chat-engine";
import type { WorkspaceContext } from "../plugin-types";

describe("tutor-action-controller — detectActionVerb", () => {
  it("detects 'create' for new artifact requests", () => {
    expect(detectActionVerb("Draw a bar graph of Alice 4, Bob 6")).toBe("create");
    expect(detectActionVerb("Make a flowchart of the login process")).toBe("create");
    expect(detectActionVerb("Build a Python program to calculate factorial")).toBe("create");
    expect(detectActionVerb("Quiz me on fractions")).toBe("create");
  });

  it("detects 'modify' for change requests", () => {
    expect(detectActionVerb("Change Diana's score to 8")).toBe("modify");
    expect(detectActionVerb("Update the title to 'Class Scores'")).toBe("modify");
    expect(detectActionVerb("Make the bars blue")).toBe("modify");
    expect(detectActionVerb("Remove the last node")).toBe("modify");
    expect(detectActionVerb("Replace Python with JavaScript")).toBe("modify");
  });

  it("detects 'inspect' for explanation requests", () => {
    expect(detectActionVerb("Explain this graph")).toBe("inspect");
    expect(detectActionVerb("What is the highest bar?")).toBe("inspect");
    expect(detectActionVerb("Describe the flowchart")).toBe("inspect");
    expect(detectActionVerb("Tell me about this code")).toBe("inspect");
  });

  it("detects 'run' for execution requests", () => {
    expect(detectActionVerb("Run this Python code")).toBe("run");
    expect(detectActionVerb("Execute the script")).toBe("run");
    expect(detectActionVerb("Compile the program")).toBe("run");
  });

  it("detects 'review' for assessment requests", () => {
    expect(detectActionVerb("Check my answer")).toBe("review");
    expect(detectActionVerb("Am I right?")).toBe("review");
    expect(detectActionVerb("Submit my solution")).toBe("review");
    expect(detectActionVerb("Review my quiz")).toBe("review");
  });

  it("prioritizes modify/inspect over create when ambiguity exists", () => {
    // "Change" should be modify, not create — even though "create" might match
    expect(detectActionVerb("Change the graph")).toBe("modify");
    // "Explain" should be inspect
    expect(detectActionVerb("Explain the bar graph you created")).toBe("inspect");
  });

  it("falls back to 'create' for novel requests", () => {
    expect(detectActionVerb("Alice 4, Bob 6, Diana 5")).toBe("create");
  });

  it("detects 'inspect' for short follow-up questions", () => {
    // "why" matches INSPECT_PATTERNS
    expect(detectActionVerb("why")).toBe("inspect");
    expect(detectActionVerb("what is this?")).toBe("inspect");
    expect(detectActionVerb("how does this work?")).toBe("inspect");
  });
});

describe("tutor-action-controller — detectCategoryAndType", () => {
  it("routes bar graph requests to graph.bar", () => {
    const intents = detectIntents("Draw a bar graph of Alice 4, Bob 6");
    const result = detectCategoryAndType({ userMessage: "Draw a bar graph", intents });
    expect(result.category).toBe("graph");
    expect(result.requestedType).toBe("bar");
  });

  it("routes pie chart requests to graph.pie", () => {
    const intents = detectIntents("Make a pie chart of the class");
    const result = detectCategoryAndType({ userMessage: "Make a pie chart", intents });
    expect(result.category).toBe("graph");
    expect(result.requestedType).toBe("pie");
  });

  it("routes scatter plot requests to graph.scatter", () => {
    const intents = detectIntents("Plot these data points as a scatter plot");
    const result = detectCategoryAndType({ userMessage: "scatter plot", intents });
    expect(result.category).toBe("graph");
    expect(result.requestedType).toBe("scatter");
  });

  it("routes Python requests to code.python", () => {
    const intents = detectIntents("Write a Python function");
    const result = detectCategoryAndType({ userMessage: "Python function", intents });
    expect(result.category).toBe("code");
    expect(result.requestedType).toBe("python");
  });

  it("routes JavaScript requests to code.javascript", () => {
    const intents = detectIntents("Write a JS function");
    const result = detectCategoryAndType({ userMessage: "JS function", intents });
    expect(result.category).toBe("code");
    expect(result.requestedType).toBe("javascript");
  });

  it("routes quiz requests to assessment.quiz", () => {
    const intents = detectIntents("Quiz me on fractions");
    const result = detectCategoryAndType({ userMessage: "Quiz me", intents });
    expect(result.category).toBe("assessment");
    expect(result.requestedType).toBe("quiz");
  });

  it("returns null category for non-plugin requests", () => {
    const intents = detectIntents("Hello, how are you?");
    const result = detectCategoryAndType({ userMessage: "Hello", intents });
    expect(result.category).toBeNull();
    expect(result.requestedType).toBeNull();
  });
});

describe("tutor-action-controller — flowchart routing respects feature flag", () => {
  const originalFlag = process.env.TUTOR_FLOWCHART_GENERATION_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_FLOWCHART_GENERATION_ENABLED;
    else process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = originalFlag;
  });

  it("does NOT route flowchart when flag is off", () => {
    process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "false";
    const intents = detectIntents("Draw a flowchart of the login process");
    const result = detectCategoryAndType({ userMessage: "Draw a flowchart", intents });
    expect(result.category).not.toBe("diagram");
  });

  it("routes to diagram.flowchart when flag is on", () => {
    process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "true";
    const intents = detectIntents("Draw a flowchart of the login process");
    const result = detectCategoryAndType({ userMessage: "Draw a flowchart", intents });
    expect(result.category).toBe("diagram");
    expect(result.requestedType).toBe("flowchart");
  });
});

describe("tutor-action-controller — buildConstraintEnvelope", () => {
  it("enforces max 1 primary artifact for explicit type requests", () => {
    const intents = detectIntents("Draw a bar graph of Alice 4, Bob 6");
    const envelope = buildConstraintEnvelope({
      userMessage: "Draw a bar graph of Alice 4, Bob 6",
      intents,
      workspaceContext: null,
    });
    expect(envelope.maximumPrimaryArtifacts).toBe(1);
  });

  it("whitelists graph.bar for bar graph requests", () => {
    const intents = detectIntents("Draw a bar graph");
    const envelope = buildConstraintEnvelope({
      userMessage: "Draw a bar graph",
      intents,
      workspaceContext: null,
    });
    expect(envelope.allowedPlugins).toEqual(["graph.bar"]);
    expect(envelope.action).toBe("create");
    expect(envelope.category).toBe("graph");
    expect(envelope.requestedType).toBe("bar");
  });

  it("whitelists diagram.flowchart for flowchart requests", () => {
    process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "true";
    try {
      const intents = detectIntents("Draw a flowchart");
      const envelope = buildConstraintEnvelope({
        userMessage: "Draw a flowchart",
        intents,
        workspaceContext: null,
      });
      expect(envelope.allowedPlugins).toEqual(["diagram.flowchart"]);
      expect(envelope.category).toBe("diagram");
    } finally {
      process.env.TUTOR_FLOWCHART_GENERATION_ENABLED = "false";
    }
  });

  it("whitelists code.python for Python requests", () => {
    const intents = detectIntents("Write Python code");
    const envelope = buildConstraintEnvelope({
      userMessage: "Write Python code",
      intents,
      workspaceContext: null,
    });
    expect(envelope.allowedPlugins).toEqual(["code.python"]);
    expect(envelope.category).toBe("code");
  });

  it("returns empty allowedPlugins when no category is detected", () => {
    const intents = detectIntents("Hello there");
    const envelope = buildConstraintEnvelope({
      userMessage: "Hello there",
      intents,
      workspaceContext: null,
    });
    expect(envelope.allowedPlugins).toEqual([]);
    expect(envelope.category).toBeNull();
  });

  it("uses workspace context for modify actions on active artifacts", () => {
    const intents = detectIntents("Change Diana to 8");
    const ws: WorkspaceContext = {
      artifactType: "graph",
      artifactId: "graph.bar-1",
      artifactCaption: "Class scores",
      payloadSummary: "{ Alice: 4, Bob: 6 }",
    };
    const envelope = buildConstraintEnvelope({
      userMessage: "Change Diana to 8",
      intents,
      workspaceContext: ws,
    });
    expect(envelope.action).toBe("modify");
    expect(envelope.category).toBe("graph");
    expect(envelope.allowedPlugins).toEqual(["graph.bar"]);
  });

  it("uses workspace context for inspect actions on active artifacts", () => {
    const intents = detectIntents("What is the highest?");
    const ws: WorkspaceContext = {
      artifactType: "graph",
      artifactId: "graph.bar-1",
      artifactCaption: "Class scores",
      payloadSummary: "{ Alice: 4, Bob: 6 }",
    };
    const envelope = buildConstraintEnvelope({
      userMessage: "What is the highest?",
      intents,
      workspaceContext: ws,
    });
    expect(envelope.action).toBe("inspect");
    expect(envelope.allowedPlugins).toEqual(["graph.bar"]);
  });

  it("does NOT use workspace context for create actions (always searches fresh)", () => {
    const intents = detectIntents("Make a pie chart");
    const ws: WorkspaceContext = {
      artifactType: "graph",
      artifactId: "graph.bar-1",
      artifactCaption: "Class scores",
      payloadSummary: "{ Alice: 4, Bob: 6 }",
    };
    const envelope = buildConstraintEnvelope({
      userMessage: "Make a pie chart",
      intents,
      workspaceContext: ws,
    });
    expect(envelope.action).toBe("create");
    expect(envelope.requestedType).toBe("pie"); // not bar from workspace
  });
});

describe("tutor-action-controller — line graph detection", () => {
  it("detects 'line graph' literally", () => {
    expect(_internalDetectWantsLineGraph("Draw a line graph of monthly rainfall")).toBe(true);
  });

  it("detects 'trend' as a line graph signal", () => {
    expect(_internalDetectWantsLineGraph("Show me the trend over time")).toBe(true);
  });

  it("detects 'change over time' as a line graph signal", () => {
    expect(_internalDetectWantsLineGraph("Visualize the change over time")).toBe(true);
  });

  it("does NOT match 'line' as a standalone word", () => {
    expect(_internalDetectWantsLineGraph("Draw a line from A to B")).toBe(false);
  });

  it("does NOT match unrelated text", () => {
    expect(_internalDetectWantsLineGraph("What is the capital of Kenya?")).toBe(false);
  });
});
