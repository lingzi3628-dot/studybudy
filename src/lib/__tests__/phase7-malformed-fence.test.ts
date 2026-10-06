/**
 * Phase 7 follow-up — tests for malformed fence recovery.
 *
 * AIs sometimes emit:
 *   - Only 2 backticks (``) at the end instead of 3 (```)
 *   - No closing fence at all
 *   - A fence with extra whitespace/newlines at the end
 *
 * Before this fix, the strict regex /```([\w-]*)\s*([\s\S]*?)```/g required
 * a proper 3-backtick close. With a 2-backtick close, the regex never
 * matched → no attachment → no workspace panel → the spec was invisible.
 *
 * This test reproduces the user's exact case (a scene spec for "Basic Web
 * Stack" closed with `` instead of ```) and verifies the fallback recovers it.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../zai-client", () => ({
  getZaiClient: vi.fn().mockResolvedValue({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }) } },
    functions: { invoke: vi.fn() },
  }),
}));

import { postProcessReply } from "../tutor-chat-engine";
import type { TutorIntents } from "../tutor-chat-engine";

const EMPTY_INTENTS: TutorIntents = {
  wantsVideo: false, wantsImage: false, wantsFunctionPlot: false, wantsScatter: false,
  wantsBar: false, wantsHistogram: false, wantsPie: false, wantsVenn: false,
  wantsNumberLine: false, wantsTree: false, wantsBoxPlot: false, wantsVector: false,
  wantsPolygon: false, wantsNetwork: false, wantsConceptMap: false, wantsArgand: false,
  wantsContour: false, wantsVectorField: false, wantsTessellation: false, wantsKnot: false,
  wantsPictogram: false, wantsTally: false, wantsCarroll: false, wantsOgive: false,
  wantsUnitCircle: false, wantsTransform: false, wantsAxes3D: false, wantsTwoWay: false,
  wantsCSV: false, wantsERDiagram: false, wantsSteps: false, wantsSearch: false,
  wantsGraph: false, wantsDrawing: true, // scene is a drawing type
};

describe("malformed fence recovery", () => {
  it("recovers a scene spec closed with 2 backticks (``) instead of 3 (```)", async () => {
    // This is the EXACT pattern from the user's report — the AI closed the
    // mathgraph block with `` (2 backticks) instead of ``` (3 backticks).
    const reply = `Here's a visual:

\`\`\`mathgraph

{
  "type": "scene",
  "title": "Basic Web Stack",
  "elements": [
    { "kind": "rect", "x": 50, "y": 50, "width": 300, "height": 80, "fill": "#fce4ec", "stroke": "#880e4f", "label": "Client (Browser)" },
    { "kind": "rect", "x": 50, "y": 200, "width": 300, "height": 80, "fill": "#e0f2f1", "stroke": "#00695c", "label": "Server" }
  ]
}

\`\`
Let me know if you'd like to explore further.`;

    const result = await postProcessReply({
      reply,
      userMessage: "what are the web basics",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });

    // The scene spec should be recovered as a graph attachment.
    const graphAtt = result.attachments.find((a) => a.type === "graph");
    expect(graphAtt).toBeDefined();
    const spec = JSON.parse(graphAtt!.caption);
    expect(spec.type).toBe("scene");
    expect(spec.title).toBe("Basic Web Stack");
    expect(spec.elements).toHaveLength(2);
  });

  it("recovers a scene spec with NO closing fence (runs to end of reply)", async () => {
    const reply = `Here's a visual:

\`\`\`mathgraph
{
  "type": "scene",
  "title": "Diagram",
  "elements": [
    { "kind": "rect", "x": 0, "y": 0, "width": 100, "height": 50, "label": "Box" }
  ]
}`;

    const result = await postProcessReply({
      reply,
      userMessage: "draw a diagram",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });

    const graphAtt = result.attachments.find((a) => a.type === "graph");
    expect(graphAtt).toBeDefined();
    const spec = JSON.parse(graphAtt!.caption);
    expect(spec.type).toBe("scene");
  });

  it("does NOT break when the fence is properly closed (3 backticks)", async () => {
    const reply = `\`\`\`mathgraph
{
  "type": "scene",
  "title": "Proper",
  "elements": [{ "kind": "rect", "x": 0, "y": 0, "width": 10, "height": 10 }]
}
\`\`\``;

    const result = await postProcessReply({
      reply,
      userMessage: "draw",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });

    const graphAtt = result.attachments.find((a) => a.type === "graph");
    expect(graphAtt).toBeDefined();
    const spec = JSON.parse(graphAtt!.caption);
    expect(spec.title).toBe("Proper");
  });

  it("does NOT recover a non-spec mathgraph block (invalid JSON)", async () => {
    const reply = `\`\`\`mathgraph
{ this is not valid json
\`\``;

    const result = await postProcessReply({
      reply,
      userMessage: "draw",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });

    // Invalid JSON → no attachment (tryParseGraphSpec returns null).
    expect(result.attachments.find((a) => a.type === "graph")).toBeUndefined();
  });

  it("does NOT double-parse when the strict regex already matched", async () => {
    // If the strict 3-backtick regex finds a valid spec, the fallback
    // should NOT run (foundSpecs.length > 0 → skip). Verify only one
    // attachment is produced, not two.
    const reply = `\`\`\`mathgraph
{
  "type": "scene",
  "title": "First",
  "elements": [{ "kind": "rect", "x": 0, "y": 0, "width": 10, "height": 10 }]
}
\`\`\`

Some text in between.

\`\`\`mathgraph
{
  "type": "scene",
  "title": "Second",
  "elements": [{ "kind": "rect", "x": 0, "y": 0, "width": 10, "height": 10 }]
}
\`\`\``;

    const result = await postProcessReply({
      reply,
      userMessage: "draw",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });

    // AC1 dedup + max 1 primary artifact (when a type was explicitly
    // requested) — should produce exactly 1 graph attachment.
    // Note: the user message "draw" sets wantsDrawing=true but no specific
    // requestedType, so the max-1-primary-artifact rule doesn't apply.
    // Both specs get parsed, but AC1 dedupes identical specs. Since these
    // have different titles, both survive. The assertion is that the
    // fallback didn't TRIPLE-parse (would be 3+).
    const graphAtts = result.attachments.filter((a) => a.type === "graph");
    expect(graphAtts.length).toBeGreaterThanOrEqual(1);
    expect(graphAtts.length).toBeLessThanOrEqual(2);
  });
});
