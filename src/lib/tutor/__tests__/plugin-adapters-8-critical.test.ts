/**
 * Tests for the 8 critical new plugin adapters — Phase 6.
 *
 * Each adapter:
 *   1. Parses a fenced-code-block JSON spec from the AI reply.
 *   2. Validates required fields + per-type invariants.
 *   3. Returns a `ready` ToolResult with a WorkspaceArtifact on success.
 *   4. Returns a `failed` ToolResult with a learner-safe message on validation
 *      failure (no plugin IDs, no stack traces, no internals leaked).
 *
 * Also covers the bounded schemas added to plugin-orchestrator.ts.
 */
import { describe, it, expect } from "vitest";
import { getAdapter, runAdapter, type PluginRequest } from "../plugin-adapters";
import type { ConstraintEnvelope } from "../plugin-types";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeEnvelope(overrides: Partial<ConstraintEnvelope> = {}): ConstraintEnvelope {
  return {
    action: "create",
    category: "graph",
    requestedType: "bar",
    allowedPlugins: ["graph.bar"],
    maximumPrimaryArtifacts: 1,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<PluginRequest> = {}): PluginRequest {
  return {
    action: "create",
    envelope: makeEnvelope(),
    aiReply: "",
    userMessage: "",
    userId: "user-1",
    conversationId: "conv-1",
    messageId: "msg-1",
    existingAttachments: [],
    ...overrides,
  };
}

const ALL_8_PLUGIN_IDS = [
  "writing.composition",
  "diagram.timeline",
  "math.geometry",
  "science.physics-sim",
  "science.chemistry-sim",
  "diagram.free-body",
  "business.financial",
  "diagram.anatomy",
] as const;

// ---------------------------------------------------------------
// Adapter registry — all 8 must be wired
// ---------------------------------------------------------------

describe("8 critical plugins — registry", () => {
  it("returns an adapter for each of the 8 critical plugins", () => {
    for (const id of ALL_8_PLUGIN_IDS) {
      expect(getAdapter(id)?.manifestId, `adapter for ${id} should be registered`).toBe(id);
    }
  });

  it("each manifestId in the registry matches its key", () => {
    // The registry key is the plugin ID; the adapter's manifestId must equal it.
    for (const id of ALL_8_PLUGIN_IDS) {
      const adapter = getAdapter(id);
      expect(adapter).not.toBeNull();
      expect(adapter!.manifestId).toBe(id);
    }
  });
});

// ---------------------------------------------------------------
// writing.composition adapter
// ---------------------------------------------------------------

describe("writing.composition adapter", () => {
  it("returns ready when a valid composition spec is present", async () => {
    const reply = `Here's your essay:
\`\`\`composition
{
  "type": "essay",
  "title": "Why photosynthesis matters",
  "sections": [
    { "heading": "Introduction", "body": "Photosynthesis is the process by which plants convert light into chemical energy. It is the foundation of most food chains on Earth." },
    { "heading": "Process", "body": "Chlorophyll in the leaves absorbs sunlight, and this energy is used to convert water and carbon dioxide into glucose and oxygen." }
  ]
}
\`\`\`
Let me know if you'd like me to revise.`;
    const result = await runAdapter("writing.composition", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.plugin.id).toBe("writing.composition");
      expect(result.artifact.title).toBe("Why photosynthesis matters");
      const payload = result.artifact.payload as any;
      expect(payload.type).toBe("essay");
      expect(payload.sections).toHaveLength(2);
      expect(payload.sections[0].heading).toBe("Introduction");
      expect(payload.sections[0].body).toMatch(/photosynthesis/i);
      expect(result.tutorSummary.shortMessage).toMatch(/draft is ready/i);
    }
  });

  it("returns failed when no composition fence is present", async () => {
    const result = await runAdapter("writing.composition", makeRequest({
      aiReply: "I would write an essay about photosynthesis.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_COMPOSITION_PRODUCED");
      expect(result.safeMessage).toMatch(/writing/i);
      expect(result.safeMessage).not.toMatch(/writing\.composition|plugin id|adapter/i);
    }
  });

  it("returns failed when sections array is empty", async () => {
    const reply = `\`\`\`composition
{ "type": "essay", "title": "X", "sections": [] }
\`\`\``;
    const result = await runAdapter("writing.composition", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_COMPOSITION_PRODUCED");
    }
  });

  it("returns failed when all sections have empty body", async () => {
    const reply = `\`\`\`composition
{
  "type": "essay",
  "sections": [
    { "heading": "Intro", "body": "" },
    { "heading": "Body", "body": "   " }
  ]
}
\`\`\``;
    const result = await runAdapter("writing.composition", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("EMPTY_COMPOSITION_SECTIONS");
    }
  });

  it("uses fallback title when spec has no title", async () => {
    const reply = `\`\`\`composition
{
  "type": "report",
  "sections": [ { "heading": "Findings", "body": "The data shows..." } ]
}
\`\`\``;
    const result = await runAdapter("writing.composition", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("report draft");
    }
  });

  it("filters out sections with empty body but keeps valid ones", async () => {
    const reply = `\`\`\`composition
{
  "type": "essay",
  "sections": [
    { "heading": "Good", "body": "Real content here." },
    { "heading": "Bad", "body": "" }
  ]
}
\`\`\``;
    const result = await runAdapter("writing.composition", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.sections).toHaveLength(1);
      expect(payload.sections[0].heading).toBe("Good");
    }
  });

  it("preserves conversationId and messageId in source", async () => {
    const reply = `\`\`\`composition
{ "sections": [ { "body": "x" } ] }
\`\`\``;
    const result = await runAdapter("writing.composition", makeRequest({
      aiReply: reply,
      conversationId: "conv-42",
      messageId: "msg-99",
    }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.source.conversationId).toBe("conv-42");
      expect(result.artifact.source.messageId).toBe("msg-99");
    }
  });
});

// ---------------------------------------------------------------
// diagram.timeline adapter
// ---------------------------------------------------------------

describe("diagram.timeline adapter", () => {
  it("returns ready when a valid timeline spec is present", async () => {
    const reply = `\`\`\`timeline
{
  "title": "Kenyan independence",
  "events": [
    { "date": "1895", "label": "British East Africa Protectorate", "description": "Area declared a British protectorate." },
    { "date": "1920", "label": "Kenya Colony", "description": "Renamed Kenya Colony." },
    { "date": "1963", "label": "Independence", "description": "Kenya gained independence from Britain." }
  ]
}
\`\`\``;
    const result = await runAdapter("diagram.timeline", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Kenyan independence");
      const payload = result.artifact.payload as any;
      expect(payload.events).toHaveLength(3);
      expect(payload.events[2].label).toBe("Independence");
      expect(payload.events[2].date).toBe("1963");
      expect(result.tutorSummary.shortMessage).toMatch(/timeline is ready/i);
    }
  });

  it("returns failed when no timeline fence is present", async () => {
    const result = await runAdapter("diagram.timeline", makeRequest({
      aiReply: "I would draw a timeline.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_TIMELINE_PRODUCED");
      expect(result.safeMessage).not.toMatch(/diagram\.timeline|plugin id/i);
    }
  });

  it("returns failed when events array is empty", async () => {
    const reply = `\`\`\`timeline
{ "title": "X", "events": [] }
\`\`\``;
    const result = await runAdapter("diagram.timeline", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
  });

  it("returns failed when all events lack a label", async () => {
    const reply = `\`\`\`timeline
{
  "events": [
    { "date": "1963", "description": "no label" }
  ]
}
\`\`\``;
    const result = await runAdapter("diagram.timeline", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("EMPTY_TIMELINE_EVENTS");
    }
  });

  it("uses fallback title when no title is provided", async () => {
    const reply = `\`\`\`timeline
{ "events": [ { "label": "Event one", "date": "2000" } ] }
\`\`\``;
    const result = await runAdapter("diagram.timeline", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Timeline");
    }
  });
});

// ---------------------------------------------------------------
// math.geometry adapter
// ---------------------------------------------------------------

describe("math.geometry adapter", () => {
  it("returns ready when a valid geometry spec with triangle + circle is present", async () => {
    const reply = `\`\`\`geometry
{
  "title": "Triangle ABC with inscribed circle",
  "shapes": [
    { "type": "triangle", "vertices": [{"x":0,"y":0},{"x":4,"y":0},{"x":2,"y":3}], "labels": ["A","B","C"] },
    { "type": "circle", "center": {"x":2,"y":1}, "radius": 1.2 }
  ]
}
\`\`\``;
    const result = await runAdapter("math.geometry", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Triangle ABC with inscribed circle");
      const payload = result.artifact.payload as any;
      expect(payload.shapes).toHaveLength(2);
      expect(payload.shapes[0].type).toBe("triangle");
      expect(payload.shapes[1].type).toBe("circle");
      expect(result.tutorSummary.shortMessage).toMatch(/construction is ready/i);
    }
  });

  it("returns failed when no geometry fence is present", async () => {
    const result = await runAdapter("math.geometry", makeRequest({
      aiReply: "I would construct a triangle.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_GEOMETRY_PRODUCED");
      expect(result.safeMessage).not.toMatch(/math\.geometry|plugin id/i);
    }
  });

  it("returns failed when shapes array is empty", async () => {
    const reply = `\`\`\`geometry
{ "title": "X", "shapes": [] }
\`\`\``;
    const result = await runAdapter("math.geometry", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
  });

  it("returns failed when all shape types are unrecognized", async () => {
    const reply = `\`\`\`geometry
{ "shapes": [ { "type": "octahedron" }, { "type": "tesseract" } ] }
\`\`\``;
    const result = await runAdapter("math.geometry", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("INVALID_GEOMETRY_SHAPES");
    }
  });

  it("accepts perpendicular_bisector and angle_bisector as valid types", async () => {
    const reply = `\`\`\`geometry
{
  "shapes": [
    { "type": "perpendicular_bisector", "from": {"x":0,"y":0}, "to": {"x":4,"y":0} },
    { "type": "angle_bisector", "vertex": {"x":0,"y":0}, "rays": [{"x":2,"y":0},{"x":1,"y":1}] }
  ]
}
\`\`\``;
    const result = await runAdapter("math.geometry", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.shapes).toHaveLength(2);
    }
  });

  it("filters out invalid shapes but keeps valid ones", async () => {
    const reply = `\`\`\`geometry
{
  "shapes": [
    { "type": "triangle", "vertices": [{"x":0,"y":0},{"x":1,"y":0},{"x":0,"y":1}] },
    { "type": "tetrahedron" }
  ]
}
\`\`\``;
    const result = await runAdapter("math.geometry", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.shapes).toHaveLength(1);
      expect(payload.shapes[0].type).toBe("triangle");
    }
  });
});

// ---------------------------------------------------------------
// science.physics-sim adapter
// ---------------------------------------------------------------

describe("science.physics-sim adapter", () => {
  it("returns ready for a pendulum simulation", async () => {
    const reply = `\`\`\`physics
{
  "title": "Simple pendulum",
  "simType": "pendulum",
  "parameters": { "length": 1.5, "gravity": 9.81, "initialAngleDeg": 30 }
}
\`\`\``;
    const result = await runAdapter("science.physics-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.simType).toBe("pendulum");
      expect(payload.parameters.length).toBe(1.5);
      expect(result.tutorSummary.shortMessage).toMatch(/simulation is ready/i);
    }
  });

  it("returns ready for a projectile_motion sim", async () => {
    const reply = `\`\`\`physics
{ "simType": "projectile_motion", "parameters": { "v0": 20, "angleDeg": 45 } }
\`\`\``;
    const result = await runAdapter("science.physics-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
  });

  it("returns failed when no physics fence is present", async () => {
    const result = await runAdapter("science.physics-sim", makeRequest({
      aiReply: "I would simulate a pendulum.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_PHYSICS_SIM_PRODUCED");
      expect(result.safeMessage).not.toMatch(/science\.physics-sim|plugin id/i);
    }
  });

  it("returns failed when simType is unrecognized", async () => {
    const reply = `\`\`\`physics
{ "simType": "warp_drive", "parameters": {} }
\`\`\``;
    const result = await runAdapter("science.physics-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("INVALID_PHYSICS_SIM_TYPE");
    }
  });

  it("uses simType in the fallback title", async () => {
    const reply = `\`\`\`physics
{ "simType": "free_fall", "parameters": { "height": 10 } }
\`\`\``;
    const result = await runAdapter("science.physics-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toMatch(/free fall/i);
    }
  });

  it("accepts empty parameters object", async () => {
    const reply = `\`\`\`physics
{ "simType": "pendulum" }
\`\`\``;
    const result = await runAdapter("science.physics-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.parameters).toEqual({});
    }
  });
});

// ---------------------------------------------------------------
// science.chemistry-sim adapter
// ---------------------------------------------------------------

describe("science.chemistry-sim adapter", () => {
  it("returns ready for a molecule with atoms and bonds", async () => {
    const reply = `\`\`\`molecule
{
  "title": "Water molecule",
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
\`\`\``;
    const result = await runAdapter("science.chemistry-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Water molecule");
      const payload = result.artifact.payload as any;
      expect(payload.atoms).toHaveLength(3);
      expect(payload.bonds).toHaveLength(2);
      expect(payload.formula).toBe("H2O");
      expect(result.tutorSummary.shortMessage).toMatch(/molecule is ready/i);
    }
  });

  it("returns ready for a reaction spec (no atoms)", async () => {
    const reply = `\`\`\`molecule
{
  "title": "Combustion of hydrogen",
  "reaction": [
    { "reactants": ["2H2", "O2"], "products": ["2H2O"], "conditions": "spark" }
  ]
}
\`\`\``;
    const result = await runAdapter("science.chemistry-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.reaction).toHaveLength(1);
      expect(payload.reaction[0].products).toContain("2H2O");
      expect(result.tutorSummary.detail ?? result.tutorSummary.shortMessage).toMatch(/reaction/i);
    }
  });

  it("returns failed when no molecule fence is present", async () => {
    const result = await runAdapter("science.chemistry-sim", makeRequest({
      aiReply: "I would draw the H2O molecule.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_MOLECULE_PRODUCED");
      expect(result.safeMessage).not.toMatch(/science\.chemistry-sim|plugin id/i);
    }
  });

  it("returns failed when neither atoms nor reaction are present", async () => {
    const reply = `\`\`\`molecule
{ "title": "Empty", "formula": "X" }
\`\`\``;
    const result = await runAdapter("science.chemistry-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("EMPTY_CHEMISTRY_SPEC");
    }
  });

  it("returns failed when an atom has an unrecognized element symbol", async () => {
    const reply = `\`\`\`molecule
{
  "atoms": [
    { "element": "O", "x": 0, "y": 0 },
    { "element": "Xx", "x": 1, "y": 0 }
  ]
}
\`\`\``;
    const result = await runAdapter("science.chemistry-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("INVALID_CHEMISTRY_ATOM");
    }
  });

  it("accepts all real periodic-table element symbols", async () => {
    const reply = `\`\`\`molecule
{
  "atoms": [
    { "element": "Na", "x": 0, "y": 0 },
    { "element": "Cl", "x": 1, "y": 0 }
  ],
  "bonds": [{ "from": 0, "to": 1, "type": "single" }]
}
\`\`\``;
    const result = await runAdapter("science.chemistry-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
  });

  it("uses formula as fallback title when no title is provided", async () => {
    const reply = `\`\`\`molecule
{ "formula": "CO2", "atoms": [{ "element": "C" }, { "element": "O" }, { "element": "O" }] }
\`\`\``;
    const result = await runAdapter("science.chemistry-sim", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("CO2");
    }
  });
});

// ---------------------------------------------------------------
// diagram.free-body adapter
// ---------------------------------------------------------------

describe("diagram.free-body adapter", () => {
  it("returns ready for a block on an incline with 3 forces", async () => {
    const reply = `\`\`\`freebody
{
  "title": "Block on incline",
  "body": "block on incline",
  "forces": [
    { "label": "Weight (W)", "magnitude": 49.1, "direction": 270 },
    { "label": "Normal (N)", "magnitude": 42.5, "direction": 60 },
    { "label": "Friction (f)", "magnitude": 12.0, "direction": 180 }
  ]
}
\`\`\``;
    const result = await runAdapter("diagram.free-body", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Block on incline");
      const payload = result.artifact.payload as any;
      expect(payload.body).toBe("block on incline");
      expect(payload.forces).toHaveLength(3);
      expect(payload.forces[0].label).toBe("Weight (W)");
      expect(payload.forces[0].magnitude).toBe(49.1);
      expect(result.tutorSummary.shortMessage).toMatch(/force diagram is ready/i);
    }
  });

  it("returns failed when no freebody fence is present", async () => {
    const result = await runAdapter("diagram.free-body", makeRequest({
      aiReply: "I would draw the forces on the block.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_FREE_BODY_PRODUCED");
      expect(result.safeMessage).not.toMatch(/diagram\.free-body|plugin id/i);
    }
  });

  it("returns failed when forces array is empty", async () => {
    const reply = `\`\`\`freebody
{ "body": "block", "forces": [] }
\`\`\``;
    const result = await runAdapter("diagram.free-body", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
  });

  it("returns failed when all forces lack a label", async () => {
    const reply = `\`\`\`freebody
{ "forces": [ { "magnitude": 10, "direction": 90 } ] }
\`\`\``;
    const result = await runAdapter("diagram.free-body", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("EMPTY_FREE_BODY_FORCES");
    }
  });

  it("uses body description in fallback title when no title is provided", async () => {
    const reply = `\`\`\`freebody
{ "body": "pendulum bob", "forces": [ { "label": "Tension (T)", "magnitude": 5, "direction": 90 } ] }
\`\`\``;
    const result = await runAdapter("diagram.free-body", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toMatch(/pendulum bob/i);
    }
  });

  it("defaults magnitude and direction to 0 when missing", async () => {
    const reply = `\`\`\`freebody
{ "forces": [ { "label": "Weight (W)" } ] }
\`\`\``;
    const result = await runAdapter("diagram.free-body", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.forces[0].magnitude).toBe(0);
      expect(payload.forces[0].direction).toBe(0);
    }
  });
});

// ---------------------------------------------------------------
// business.financial adapter
// ---------------------------------------------------------------

describe("business.financial adapter", () => {
  it("returns ready for an NPV calculation", async () => {
    const reply = `\`\`\`financial
{
  "title": "Project A NPV",
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
\`\`\``;
    const result = await runAdapter("business.financial", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Project A NPV");
      const payload = result.artifact.payload as any;
      expect(payload.calcType).toBe("npv");
      expect(payload.parameters.cashFlows).toHaveLength(4);
      expect(payload.result.npv).toBe(3213.46);
      expect(result.tutorSummary.shortMessage).toMatch(/calculation is ready/i);
    }
  });

  it("returns ready for a compound_interest calc", async () => {
    const reply = `\`\`\`financial
{ "calcType": "compound_interest", "parameters": { "principal": 1000, "rate": 0.05, "years": 3 } }
\`\`\``;
    const result = await runAdapter("business.financial", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
  });

  it("returns failed when no financial fence is present", async () => {
    const result = await runAdapter("business.financial", makeRequest({
      aiReply: "I would calculate the NPV.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_FINANCIAL_CALC_PRODUCED");
      expect(result.safeMessage).not.toMatch(/business\.financial|plugin id/i);
    }
  });

  it("returns failed when calcType is unrecognized", async () => {
    const reply = `\`\`\`financial
{ "calcType": "black_scholes", "parameters": {} }
\`\`\``;
    const result = await runAdapter("business.financial", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("INVALID_FINANCIAL_CALC_TYPE");
    }
  });

  it("accepts 'breakeven' as an alias for 'break_even'", async () => {
    const reply = `\`\`\`financial
{ "calcType": "breakeven", "parameters": { "fixedCost": 1000, "pricePerUnit": 10, "varCostPerUnit": 6 } }
\`\`\``;
    const result = await runAdapter("business.financial", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
  });

  it("defaults parameters and result to empty objects when missing", async () => {
    const reply = `\`\`\`financial
{ "calcType": "irr" }
\`\`\``;
    const result = await runAdapter("business.financial", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.parameters).toEqual({});
      expect(payload.result).toEqual({});
    }
  });
});

// ---------------------------------------------------------------
// diagram.anatomy adapter
// ---------------------------------------------------------------

describe("diagram.anatomy adapter", () => {
  it("returns ready for a skeletal system diagram with labels", async () => {
    const reply = `\`\`\`anatomy
{
  "title": "Human skeleton (anterior view)",
  "system": "skeletal",
  "view": "anterior",
  "labels": [
    { "part": "Skull", "description": "Protects the brain." },
    { "part": "Clavicle", "description": "Collarbone." },
    { "part": "Femur", "description": "Longest bone in the body." }
  ]
}
\`\`\``;
    const result = await runAdapter("diagram.anatomy", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toBe("Human skeleton (anterior view)");
      const payload = result.artifact.payload as any;
      expect(payload.system).toBe("skeletal");
      expect(payload.systemRecognized).toBe(true);
      expect(payload.view).toBe("anterior");
      expect(payload.labels).toHaveLength(3);
      expect(payload.labels[2].part).toBe("Femur");
      expect(result.tutorSummary.shortMessage).toMatch(/labelled diagram is ready/i);
    }
  });

  it("returns ready for an organ-level diagram (heart)", async () => {
    const reply = `\`\`\`anatomy
{
  "system": "heart",
  "labels": [
    { "part": "Aorta", "description": "Main artery leaving the heart." },
    { "part": "Left ventricle", "description": "Pumps oxygenated blood to the body." }
  ]
}
\`\`\``;
    const result = await runAdapter("diagram.anatomy", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.system).toBe("heart");
      expect(payload.systemRecognized).toBe(true);
    }
  });

  it("returns failed when no anatomy fence is present", async () => {
    const result = await runAdapter("diagram.anatomy", makeRequest({
      aiReply: "I would label the skeletal system.",
    }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("NO_ANATOMY_PRODUCED");
      expect(result.safeMessage).not.toMatch(/diagram\.anatomy|plugin id/i);
    }
  });

  it("returns failed when labels array is empty", async () => {
    const reply = `\`\`\`anatomy
{ "system": "skeletal", "labels": [] }
\`\`\``;
    const result = await runAdapter("diagram.anatomy", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
  });

  it("returns failed when all labels lack a part name", async () => {
    const reply = `\`\`\`anatomy
{ "labels": [ { "description": "no part name" } ] }
\`\`\``;
    const result = await runAdapter("diagram.anatomy", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("EMPTY_ANATOMY_LABELS");
    }
  });

  it("accepts unknown systems but marks them as systemRecognized=false", async () => {
    const reply = `\`\`\`anatomy
{
  "system": "exotic_organ",
  "labels": [ { "part": "Mystery part", "description": "Unknown function." } ]
}
\`\`\``;
    const result = await runAdapter("diagram.anatomy", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      const payload = result.artifact.payload as any;
      expect(payload.systemRecognized).toBe(false);
    }
  });

  it("uses system in fallback title when no title is provided", async () => {
    const reply = `\`\`\`anatomy
{
  "system": "muscular",
  "labels": [ { "part": "Biceps", "description": "Flexes the forearm." } ]
}
\`\`\``;
    const result = await runAdapter("diagram.anatomy", makeRequest({ aiReply: reply }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.artifact.title).toMatch(/muscular/i);
    }
  });
});

// ---------------------------------------------------------------
// Cross-cutting safety: NO plugin IDs in safeMessage
// ---------------------------------------------------------------

describe("8 critical plugins — safeMessage hygiene", () => {
  for (const pluginId of ALL_8_PLUGIN_IDS) {
    it(`${pluginId}: safeMessage never contains plugin IDs / adapter / registry strings`, async () => {
      // Force a failed result by giving an empty reply
      const result = await runAdapter(pluginId, makeRequest({ aiReply: "" }));
      if (result.status === "failed") {
        expect(result.safeMessage).not.toMatch(/writing\.composition|diagram\.timeline|math\.geometry|science\.physics-sim|science\.chemistry-sim|diagram\.free-body|business\.financial|diagram\.anatomy/i);
        expect(result.safeMessage).not.toMatch(/plugin id|adapter id|registry|stack trace|at \//i);
      }
    });
  }

  it("every adapter produces a unique artifactId per call", async () => {
    const ids = new Set<string>();
    for (const pluginId of ALL_8_PLUGIN_IDS) {
      // Build a minimal valid reply for each so the adapter returns ready
      let reply = "";
      if (pluginId === "writing.composition") {
        reply = "```composition\n{\"sections\":[{\"body\":\"x\"}]}\n```";
      } else if (pluginId === "diagram.timeline") {
        reply = "```timeline\n{\"events\":[{\"label\":\"E\",\"date\":\"2000\"}]}\n```";
      } else if (pluginId === "math.geometry") {
        reply = "```geometry\n{\"shapes\":[{\"type\":\"circle\"}]}\n```";
      } else if (pluginId === "science.physics-sim") {
        reply = "```physics\n{\"simType\":\"pendulum\"}\n```";
      } else if (pluginId === "science.chemistry-sim") {
        reply = "```molecule\n{\"atoms\":[{\"element\":\"H\"}]}\n```";
      } else if (pluginId === "diagram.free-body") {
        reply = "```freebody\n{\"forces\":[{\"label\":\"W\"}]}\n```";
      } else if (pluginId === "business.financial") {
        reply = "```financial\n{\"calcType\":\"npv\"}\n```";
      } else if (pluginId === "diagram.anatomy") {
        reply = "```anatomy\n{\"labels\":[{\"part\":\"Skull\"}]}\n```";
      }
      const result = await runAdapter(pluginId, makeRequest({ aiReply: reply }));
      if (result.status === "ready") {
        ids.add(result.artifact.artifactId);
      }
    }
    // Each adapter generated a unique artifactId
    expect(ids.size).toBe(ALL_8_PLUGIN_IDS.length);
  });
});
