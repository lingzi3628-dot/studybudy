/**
 * Phase 7 — Parser tests for the 8 critical new plugin fences.
 *
 * Each parser:
 *   1. Returns null when the fence is missing or malformed.
 *   2. Returns the parsed spec when the fence is present and valid.
 *   3. Validates required fields + per-type invariants (returns null on
 *      missing required fields, empty arrays, unrecognized enum values,
 *      invalid periodic-table symbols, etc.).
 *   4. Handles nested ```json fences inside the plugin fence (some models
 *      wrap the spec this way).
 *
 * Also covers integration with postProcessReply — when a reply contains
 * one of the new fences, the attachment is pushed with the right `type`
 * field AND the fence is stripped from the visible reply.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock callAI so postProcessReply doesn't actually call the LLM.
vi.mock("../zai-client", () => ({
  getZaiClient: vi.fn().mockResolvedValue({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }) } },
    functions: { invoke: vi.fn() },
  }),
}));

import {
  parseComposition,
  parseTimeline,
  parseGeometry,
  parsePhysicsSim,
  parseMolecule,
  parseFreeBody,
  parseFinancial,
  parseAnatomy,
} from "../tutor-chat-engine";

// ---------------------------------------------------------------
// parseComposition
// ---------------------------------------------------------------

describe("parseComposition", () => {
  it("parses a valid composition spec", () => {
    const reply = "Here:\n```composition\n{\"type\":\"essay\",\"title\":\"Why X matters\",\"sections\":[{\"heading\":\"Intro\",\"body\":\"Some text.\"}]}\n```";
    const spec = parseComposition(reply);
    expect(spec).not.toBeNull();
    expect(spec.title).toBe("Why X matters");
    expect(spec.sections).toHaveLength(1);
    expect(spec.sections[0].heading).toBe("Intro");
  });

  it("returns null when no composition fence is present", () => {
    expect(parseComposition("Just text")).toBeNull();
  });

  it("returns null when sections array is empty", () => {
    const reply = "```composition\n{\"type\":\"essay\",\"sections\":[]}\n```";
    expect(parseComposition(reply)).toBeNull();
  });

  it("returns null when sections field is missing", () => {
    const reply = "```composition\n{\"type\":\"essay\"}\n```";
    expect(parseComposition(reply)).toBeNull();
  });

  it("filters out sections with empty body", () => {
    const reply = "```composition\n{\"sections\":[{\"heading\":\"A\",\"body\":\"\"},{\"heading\":\"B\",\"body\":\"Real content.\"}]}\n```";
    const spec = parseComposition(reply);
    expect(spec).not.toBeNull();
    expect(spec.sections).toHaveLength(1);
    expect(spec.sections[0].heading).toBe("B");
  });

  it("handles nested ```json fence inside composition fence", () => {
    const reply = "```composition\n```json\n{\"sections\":[{\"body\":\"x\"}]}\n```\n```";
    const spec = parseComposition(reply);
    expect(spec).not.toBeNull();
    expect(spec.sections).toHaveLength(1);
  });
});

// ---------------------------------------------------------------
// parseTimeline
// ---------------------------------------------------------------

describe("parseTimeline", () => {
  it("parses a valid timeline spec", () => {
    const reply = "```timeline\n{\"title\":\"Indep\",\"events\":[{\"date\":\"1963\",\"label\":\"Indep\"}]}\n```";
    const spec = parseTimeline(reply);
    expect(spec).not.toBeNull();
    expect(spec.title).toBe("Indep");
    expect(spec.events).toHaveLength(1);
  });

  it("returns null when events is empty", () => {
    const reply = "```timeline\n{\"events\":[]}\n```";
    expect(parseTimeline(reply)).toBeNull();
  });

  it("returns null when events field is missing", () => {
    const reply = "```timeline\n{\"title\":\"X\"}\n```";
    expect(parseTimeline(reply)).toBeNull();
  });

  it("returns null when no timeline fence is present", () => {
    expect(parseTimeline("no fence")).toBeNull();
  });
});

// ---------------------------------------------------------------
// parseGeometry
// ---------------------------------------------------------------

describe("parseGeometry", () => {
  it("parses a valid geometry spec with triangle", () => {
    const reply = "```geometry\n{\"shapes\":[{\"type\":\"triangle\",\"vertices\":[{\"x\":0,\"y\":0}]}]}\n```";
    const spec = parseGeometry(reply);
    expect(spec).not.toBeNull();
    expect(spec.shapes).toHaveLength(1);
    expect(spec.shapes[0].type).toBe("triangle");
  });

  it("accepts perpendicular_bisector and angle_bisector types", () => {
    const reply = "```geometry\n{\"shapes\":[{\"type\":\"perpendicular_bisector\"},{\"type\":\"angle_bisector\"}]}\n```";
    const spec = parseGeometry(reply);
    expect(spec).not.toBeNull();
    expect(spec.shapes).toHaveLength(2);
  });

  it("returns null when shapes is empty", () => {
    const reply = "```geometry\n{\"shapes\":[]}\n```";
    expect(parseGeometry(reply)).toBeNull();
  });

  it("returns null when all shape types are unrecognized", () => {
    const reply = "```geometry\n{\"shapes\":[{\"type\":\"tetrahedron\"}]}\n```";
    expect(parseGeometry(reply)).toBeNull();
  });
});

// ---------------------------------------------------------------
// parsePhysicsSim
// ---------------------------------------------------------------

describe("parsePhysicsSim", () => {
  it("parses a valid pendulum spec", () => {
    const reply = "```physics\n{\"simType\":\"pendulum\",\"parameters\":{\"length\":1.5}}\n```";
    const spec = parsePhysicsSim(reply);
    expect(spec).not.toBeNull();
    expect(spec.simType).toBe("pendulum");
    expect(spec.parameters.length).toBe(1.5);
  });

  it("defaults parameters to empty object when missing", () => {
    const reply = "```physics\n{\"simType\":\"projectile_motion\"}\n```";
    const spec = parsePhysicsSim(reply);
    expect(spec).not.toBeNull();
    expect(spec.parameters).toEqual({});
  });

  it("returns null when simType is unrecognized", () => {
    const reply = "```physics\n{\"simType\":\"warp_drive\"}\n```";
    expect(parsePhysicsSim(reply)).toBeNull();
  });

  it("returns null when simType is missing", () => {
    const reply = "```physics\n{\"parameters\":{}}\n```";
    expect(parsePhysicsSim(reply)).toBeNull();
  });
});

// ---------------------------------------------------------------
// parseMolecule
// ---------------------------------------------------------------

describe("parseMolecule", () => {
  it("parses a valid H2O molecule", () => {
    const reply = "```molecule\n{\"formula\":\"H2O\",\"atoms\":[{\"element\":\"O\"},{\"element\":\"H\"},{\"element\":\"H\"}]}\n```";
    const spec = parseMolecule(reply);
    expect(spec).not.toBeNull();
    expect(spec.formula).toBe("H2O");
    expect(spec.atoms).toHaveLength(3);
  });

  it("parses a reaction spec (no atoms)", () => {
    const reply = "```molecule\n{\"reaction\":[{\"reactants\":[\"2H2\",\"O2\"],\"products\":[\"2H2O\"]}]}\n```";
    const spec = parseMolecule(reply);
    expect(spec).not.toBeNull();
    expect(spec.reaction).toHaveLength(1);
  });

  it("returns null when neither atoms nor reaction are present", () => {
    const reply = "```molecule\n{\"formula\":\"X\"}\n```";
    expect(parseMolecule(reply)).toBeNull();
  });

  it("returns null when an atom has an unrecognized element symbol", () => {
    const reply = "```molecule\n{\"atoms\":[{\"element\":\"O\"},{\"element\":\"Xx\"}]}\n```";
    expect(parseMolecule(reply)).toBeNull();
  });

  it("accepts multi-letter element symbols like Na and Cl", () => {
    const reply = "```molecule\n{\"atoms\":[{\"element\":\"Na\"},{\"element\":\"Cl\"}]}\n```";
    const spec = parseMolecule(reply);
    expect(spec).not.toBeNull();
  });
});

// ---------------------------------------------------------------
// parseFreeBody
// ---------------------------------------------------------------

describe("parseFreeBody", () => {
  it("parses a valid freebody spec", () => {
    const reply = "```freebody\n{\"body\":\"block\",\"forces\":[{\"label\":\"W\",\"magnitude\":49,\"direction\":270}]}\n```";
    const spec = parseFreeBody(reply);
    expect(spec).not.toBeNull();
    expect(spec.body).toBe("block");
    expect(spec.forces).toHaveLength(1);
  });

  it("returns null when forces is empty", () => {
    const reply = "```freebody\n{\"forces\":[]}\n```";
    expect(parseFreeBody(reply)).toBeNull();
  });

  it("returns null when forces field is missing", () => {
    const reply = "```freebody\n{\"body\":\"x\"}\n```";
    expect(parseFreeBody(reply)).toBeNull();
  });
});

// ---------------------------------------------------------------
// parseFinancial
// ---------------------------------------------------------------

describe("parseFinancial", () => {
  it("parses a valid NPV spec", () => {
    const reply = "```financial\n{\"calcType\":\"npv\",\"parameters\":{\"discountRate\":0.1}}\n```";
    const spec = parseFinancial(reply);
    expect(spec).not.toBeNull();
    expect(spec.calcType).toBe("npv");
    expect(spec.parameters.discountRate).toBe(0.1);
  });

  it("defaults parameters and result to empty objects when missing", () => {
    const reply = "```financial\n{\"calcType\":\"irr\"}\n```";
    const spec = parseFinancial(reply);
    expect(spec).not.toBeNull();
    expect(spec.parameters).toEqual({});
    expect(spec.result).toEqual({});
  });

  it("accepts breakeven as an alias for break_even", () => {
    const reply = "```financial\n{\"calcType\":\"breakeven\"}\n```";
    expect(parseFinancial(reply)).not.toBeNull();
  });

  it("returns null when calcType is unrecognized", () => {
    const reply = "```financial\n{\"calcType\":\"black_scholes\"}\n```";
    expect(parseFinancial(reply)).toBeNull();
  });
});

// ---------------------------------------------------------------
// parseAnatomy
// ---------------------------------------------------------------

describe("parseAnatomy", () => {
  it("parses a valid anatomy spec", () => {
    const reply = "```anatomy\n{\"system\":\"skeletal\",\"labels\":[{\"part\":\"Skull\"},{\"part\":\"Femur\"}]}\n```";
    const spec = parseAnatomy(reply);
    expect(spec).not.toBeNull();
    expect(spec.system).toBe("skeletal");
    expect(spec.labels).toHaveLength(2);
  });

  it("returns null when labels is empty", () => {
    const reply = "```anatomy\n{\"system\":\"skeletal\",\"labels\":[]}\n```";
    expect(parseAnatomy(reply)).toBeNull();
  });

  it("returns null when labels field is missing", () => {
    const reply = "```anatomy\n{\"system\":\"skeletal\"}\n```";
    expect(parseAnatomy(reply)).toBeNull();
  });
});

// ---------------------------------------------------------------
// Integration: postProcessReply wires the 8 new fences → attachments
// ---------------------------------------------------------------

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
  wantsGraph: false, wantsDrawing: false,
};

describe("postProcessReply — Phase 7 fence → attachment wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses ```composition into a composition attachment + strips from reply", async () => {
    const reply = "Here's your essay.\n```composition\n{\"sections\":[{\"heading\":\"Intro\",\"body\":\"Text.\"}]}\n```\nDone.";
    const result = await postProcessReply({
      reply,
      userMessage: "Write me an essay",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "composition")).toBe(true);
    expect(result.reply).not.toMatch(/```composition/);
    expect(result.reply).toMatch(/Done\./);
  });

  it("parses ```timeline into a timeline attachment + strips from reply", async () => {
    const reply = "```timeline\n{\"events\":[{\"date\":\"1963\",\"label\":\"Indep\"}]}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Draw a timeline",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "timeline")).toBe(true);
    expect(result.reply).not.toMatch(/```timeline/);
  });

  it("parses ```geometry into a geometry attachment + strips from reply", async () => {
    const reply = "```geometry\n{\"shapes\":[{\"type\":\"circle\"}]}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Construct a circle",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "geometry")).toBe(true);
    expect(result.reply).not.toMatch(/```geometry/);
  });

  it("parses ```physics into a physics_sim attachment + strips from reply", async () => {
    const reply = "```physics\n{\"simType\":\"pendulum\"}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Simulate a pendulum",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "physics_sim")).toBe(true);
    expect(result.reply).not.toMatch(/```physics/);
  });

  it("parses ```molecule into a molecule attachment + strips from reply", async () => {
    const reply = "```molecule\n{\"atoms\":[{\"element\":\"H\"}]}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Show me the H2O molecule",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "molecule")).toBe(true);
    expect(result.reply).not.toMatch(/```molecule/);
  });

  it("parses ```freebody into a free_body attachment + strips from reply", async () => {
    const reply = "```freebody\n{\"forces\":[{\"label\":\"W\"}]}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Draw a free-body diagram",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "free_body")).toBe(true);
    expect(result.reply).not.toMatch(/```freebody/);
  });

  it("parses ```financial into a financial attachment + strips from reply", async () => {
    const reply = "```financial\n{\"calcType\":\"npv\"}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Calculate NPV",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "financial")).toBe(true);
    expect(result.reply).not.toMatch(/```financial/);
  });

  it("parses ```anatomy into an anatomy attachment + strips from reply", async () => {
    const reply = "```anatomy\n{\"system\":\"skeletal\",\"labels\":[{\"part\":\"Skull\"}]}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Label the skeletal system",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "anatomy")).toBe(true);
    expect(result.reply).not.toMatch(/```anatomy/);
  });

  it("does NOT push any of the 8 new attachments when no fence is present", async () => {
    const reply = "I would write an essay about photosynthesis.";
    const result = await postProcessReply({
      reply,
      userMessage: "Write me an essay",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    const NEW_TYPES = ["composition", "timeline", "geometry", "physics_sim", "molecule", "free_body", "financial", "anatomy"];
    for (const t of NEW_TYPES) {
      expect(result.attachments.find((a) => a.type === t)).toBeUndefined();
    }
  });

  it("handles all 8 fences in a single reply (each becomes its own attachment)", async () => {
    const reply = [
      "```composition\n{\"sections\":[{\"body\":\"x\"}]}\n```",
      "```timeline\n{\"events\":[{\"label\":\"E\",\"date\":\"2000\"}]}\n```",
      "```geometry\n{\"shapes\":[{\"type\":\"circle\"}]}\n```",
      "```physics\n{\"simType\":\"pendulum\"}\n```",
      "```molecule\n{\"atoms\":[{\"element\":\"H\"}]}\n```",
      "```freebody\n{\"forces\":[{\"label\":\"W\"}]}\n```",
      "```financial\n{\"calcType\":\"npv\"}\n```",
      "```anatomy\n{\"labels\":[{\"part\":\"Skull\"}]}\n```",
    ].join("\n\n");
    const result = await postProcessReply({
      reply,
      userMessage: "All the things",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    const types = result.attachments.map((a) => a.type);
    expect(types).toContain("composition");
    expect(types).toContain("timeline");
    expect(types).toContain("geometry");
    expect(types).toContain("physics_sim");
    expect(types).toContain("molecule");
    expect(types).toContain("free_body");
    expect(types).toContain("financial");
    expect(types).toContain("anatomy");
    // Reply should have all 8 fences stripped
    expect(result.reply).not.toMatch(/```(?:composition|timeline|geometry|physics|molecule|freebody|financial|anatomy)/);
  });

  it("does NOT interpret the new fence names as graph specs (no 'graph' attachment)", async () => {
    // The new fences are in CODE_LANGS_TO_SKIP so tryParseGraphSpec ignores them.
    // Confirm no 'graph' attachment is created when only a composition fence is present.
    const reply = "```composition\n{\"sections\":[{\"body\":\"x\"}]}\n```";
    const result = await postProcessReply({
      reply,
      userMessage: "Write me an essay",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.find((a) => a.type === "graph")).toBeUndefined();
  });
});
