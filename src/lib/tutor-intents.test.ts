/**
 * tutor-chat-engine tests — Phase 53 (test wave 1)
 *
 * Covers the PURE parts of the shared chat engine:
 *   - detectIntents   — the regex surface that routes every message to the
 *                       right attachment pipeline (graphs, video, search…)
 *   - splitThinking   — <thinking> block stripping (streams + classic route)
 *   - parseExamGen    — ```examgen fenced spec extraction
 *
 * The DB/AI-touching functions (runWebSearch, buildTutorSystemPrompt,
 * postProcessReply) are integration territory — not covered here.
 *
 * Run: npx vitest run src/lib/tutor-intents.test.ts
 */
import { describe, it, expect } from "vitest";
import { detectIntents, splitThinking, parseExamGen } from "./tutor-chat-engine";

describe("detectIntents — media routing", () => {
  it("detects video requests (YouTube routing)", () => {
    const i = detectIntents("send me a video about photosynthesis");
    expect(i.wantsVideo).toBe(true);
  });

  it("detects image requests", () => {
    const i = detectIntents("show me a picture of a mitochondrion");
    expect(i.wantsImage).toBe(true);
  });

  it("image-vs-graph disambiguation: drawing a chart is NOT an image request", () => {
    const i = detectIntents("draw a graph of y = 2x + 1");
    expect(i.wantsImage).toBe(false);
    expect(i.wantsFunctionPlot).toBe(true);
  });

  it("detects web search phrasing", () => {
    const i = detectIntents("what is the capital of Burkina Faso?");
    expect(i.wantsSearch).toBe(true);
  });

  it("video beats search (priority: video > search)", () => {
    const i = detectIntents("find and watch a video on the water cycle");
    expect(i.wantsVideo).toBe(true);
    expect(i.wantsSearch).toBe(false);
  });
});

describe("detectIntents — graph types", () => {
  it("bar chart", () => {
    expect(detectIntents("make a bar chart of rainfall by month").wantsBar).toBe(true);
  });

  it("histogram", () => {
    expect(detectIntents("plot a histogram of the class scores").wantsHistogram).toBe(true);
  });

  it("pie chart", () => {
    expect(detectIntents("show a pie chart of the budget").wantsPie).toBe(true);
  });

  it("concept map / mind map", () => {
    expect(detectIntents("create a concept map of the circulatory system").wantsConceptMap).toBe(true);
    expect(detectIntents("make a mind map for photosynthesis").wantsConceptMap).toBe(true);
  });

  it("scatter is not a function plot", () => {
    const i = detectIntents("plot the data points from my experiment as a scatter");
    expect(i.wantsScatter).toBe(true);
    expect(i.wantsFunctionPlot).toBe(false);
  });

  it("step-by-step solver phrasing", () => {
    expect(detectIntents("solve 2x + 3 = 11 and show your work").wantsSteps).toBe(true);
  });

  it("plain text has no graph intent", () => {
    const i = detectIntents("hello, how do I stay motivated to study?");
    expect(i.wantsGraph).toBe(false);
    expect(i.wantsBar).toBe(false);
    expect(i.wantsConceptMap).toBe(false);
  });
});

describe("splitThinking — <thinking> block handling", () => {
  it("returns the reply untouched when there is no thinking block", () => {
    const r = splitThinking("Just the answer, no thoughts.");
    expect(r.clean).toBe("Just the answer, no thoughts.");
    expect(r.steps).toEqual([]);
  });

  it("strips the thinking block and extracts steps", () => {
    const reply = "<thinking>\nFirst recall the formula.\nThen substitute the values.\n</thinking>The area is 42 cm².";
    const r = splitThinking(reply);
    expect(r.clean).toBe("The area is 42 cm².");
    expect(r.steps.length).toBe(2);
    expect(r.steps[0]).toContain("recall the formula");
  });

  it("drops tiny thinking fragments (< 5 chars) as noise", () => {
    const reply = "<thinking>\nhi\nok\nThen substitute the values.\n</thinking>Answer.";
    const r = splitThinking(reply);
    expect(r.steps.length).toBe(1);
  });

  it("caps extracted steps at 10", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Step number ${i + 1} of the plan`).join("\n");
    const r = splitThinking(`<thinking>\n${lines}\n</thinking>Done.`);
    expect(r.steps.length).toBe(10);
  });
});

describe("parseExamGen — ```examgen extraction", () => {
  it("returns null when no examgen block is present", () => {
    expect(parseExamGen("Here is a plain reply with ```mathgraph {}``` only.")).toBeNull();
  });

  it("parses a valid examgen block", () => {
    const reply = `Here's your exam:\n\n\`\`\`examgen\n{"title":"Fractions Quiz","questions":[{"q":"1/2 + 1/2 = ?","answer":"1"}]}\n\`\`\`\n\nGood luck!`;
    const spec = parseExamGen(reply);
    expect(spec).not.toBeNull();
    expect(spec.title).toBe("Fractions Quiz");
    expect(spec.questions.length).toBe(1);
  });

  it("tolerates prose around the block and inner json fencing", () => {
    const reply = 'Intro\n```examgen\n```json\n{"title":"T","questions":[]}\n```\n```\nOutro';
    const spec = parseExamGen(reply);
    expect(spec).not.toBeNull();
    expect(spec.title).toBe("T");
  });

  it("returns null on malformed JSON inside the block", () => {
    const reply = "```examgen\n{not valid json}\n```";
    expect(parseExamGen(reply)).toBeNull();
  });
});
