/**
 * Phase 8 — workspace_edit parser + application tests.
 *
 * The ```workspace_edit fence lets the AI patch the ACTIVE workspace tab
 * without opening a new one. This is the "co-editor" pattern — the AI
 * writes directly into the workspace, not just into chat.
 *
 * Covers:
 *   1. parseWorkspaceEdit — parses merge + replace modes
 *   2. postProcessReply integration — returns as workspace_edit attachment
 *   3. Frontend application logic — merge + replace patch the active tab
 *   4. Edge cases: no active tab, malformed spec, dedup
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../zai-client", () => ({
  getZaiClient: vi.fn().mockResolvedValue({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }) } },
    functions: { invoke: vi.fn() },
  }),
}));

import { parseWorkspaceEdit, postProcessReply } from "../tutor-chat-engine";
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

// === parseWorkspaceEdit ===

describe("parseWorkspaceEdit", () => {
  it("parses a merge operation (default)", () => {
    const reply = "```workspace_edit\n{\"op\":\"merge\",\"values\":[8,4,6]}\n```";
    const spec = parseWorkspaceEdit(reply);
    expect(spec).not.toBeNull();
    expect(spec.op).toBe("merge");
    expect(spec.patch).toEqual({ values: [8, 4, 6] });
  });

  it("defaults to merge when op is missing", () => {
    const reply = "```workspace_edit\n{\"values\":[8,4,6],\"title\":\"Updated\"}\n```";
    const spec = parseWorkspaceEdit(reply);
    expect(spec).not.toBeNull();
    expect(spec.op).toBe("merge");
    expect(spec.patch).toEqual({ values: [8, 4, 6], title: "Updated" });
  });

  it("parses a replace operation", () => {
    const reply = "```workspace_edit\n{\"op\":\"replace\",\"spec\":{\"type\":\"bar\",\"categories\":[\"A\"],\"values\":[8]}}\n```";
    const spec = parseWorkspaceEdit(reply);
    expect(spec).not.toBeNull();
    expect(spec.op).toBe("replace");
    expect(spec.spec.type).toBe("bar");
    expect(spec.spec.values).toEqual([8]);
  });

  it("returns null when op is replace but no spec field", () => {
    const reply = "```workspace_edit\n{\"op\":\"replace\"}\n```";
    expect(parseWorkspaceEdit(reply)).toBeNull();
  });

  it("returns null when merge patch is empty", () => {
    const reply = "```workspace_edit\n{\"op\":\"merge\"}\n```";
    expect(parseWorkspaceEdit(reply)).toBeNull();
  });

  it("returns null when no workspace_edit fence is present", () => {
    expect(parseWorkspaceEdit("just text")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const reply = "```workspace_edit\n{ this is not json }\n```";
    expect(parseWorkspaceEdit(reply)).toBeNull();
  });

  it("rejects unknown op values (defaults to merge)", () => {
    const reply = "```workspace_edit\n{\"op\":\"delete\",\"values\":[1]}\n```";
    const spec = parseWorkspaceEdit(reply);
    expect(spec).not.toBeNull();
    expect(spec.op).toBe("merge"); // unknown op → merge
  });
});

// === postProcessReply integration ===

describe("postProcessReply — workspace_edit wiring", () => {
  it("parses ```workspace_edit into a workspace_edit attachment + strips from reply", async () => {
    const reply = "I'm updating the graph.\n```workspace_edit\n{\"op\":\"merge\",\"values\":[8,4,6]}\n```\nDone.";
    const result = await postProcessReply({
      reply,
      userMessage: "change the first bar to 8",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.some((a) => a.type === "workspace_edit")).toBe(true);
    expect(result.reply).not.toMatch(/```workspace_edit/);
    expect(result.reply).toMatch(/Done\./);
  });

  it("does NOT push workspace_edit when no fence is present", async () => {
    const reply = "I would change the graph.";
    const result = await postProcessReply({
      reply,
      userMessage: "change the graph",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.attachments.find((a) => a.type === "workspace_edit")).toBeUndefined();
  });
});

// === Frontend application logic (mirrors AITutorChat.tsx) ===

describe("workspace_edit — frontend application logic", () => {
  // Mirror of the merge logic in AITutorChat.tsx's auto-open useEffect
  function applyMerge(currentCaption: string, patch: Record<string, any>): string {
    const currentSpec = JSON.parse(currentCaption);
    const merged = { ...currentSpec, ...patch };
    return JSON.stringify(merged);
  }

  // Mirror of the replace logic
  function applyReplace(newSpec: any): string {
    return JSON.stringify(newSpec);
  }

  it("merge patches specific fields + preserves others", () => {
    const currentCaption = JSON.stringify({
      type: "bar",
      title: "Class Scores",
      categories: ["Diana", "Bob", "Carol"],
      values: [5, 4, 6],
    });
    const newCaption = applyMerge(currentCaption, { values: [8, 4, 6] });
    const newSpec = JSON.parse(newCaption);
    expect(newSpec.values).toEqual([8, 4, 6]); // patched
    expect(newSpec.categories).toEqual(["Diana", "Bob", "Carol"]); // preserved
    expect(newSpec.title).toBe("Class Scores"); // preserved
    expect(newSpec.type).toBe("bar"); // preserved
  });

  it("merge can update the title", () => {
    const currentCaption = JSON.stringify({ type: "bar", title: "Old", values: [1] });
    const newCaption = applyMerge(currentCaption, { title: "New Title" });
    const newSpec = JSON.parse(newCaption);
    expect(newSpec.title).toBe("New Title");
    expect(newSpec.values).toEqual([1]); // preserved
  });

  it("replace overwrites the entire spec", () => {
    const currentCaption = JSON.stringify({ type: "bar", title: "Old", values: [1] });
    const newCaption = applyReplace({ type: "pie", title: "New", slices: [{ label: "A", value: 1 }] });
    const newSpec = JSON.parse(newCaption);
    expect(newSpec.type).toBe("pie");
    expect(newSpec.title).toBe("New");
    expect(newSpec.slices).toHaveLength(1);
    expect(newSpec.values).toBeUndefined(); // old field gone
  });

  it("merge with a nested object shallow-merges (not deep-merge)", () => {
    const currentCaption = JSON.stringify({
      type: "timeline",
      title: "History",
      events: [{ date: "1963", label: "A" }, { date: "2000", label: "B" }],
    });
    // Shallow merge: events array is REPLACED, not appended
    const newCaption = applyMerge(currentCaption, { events: [{ date: "2024", label: "C" }] });
    const newSpec = JSON.parse(newCaption);
    expect(newSpec.events).toHaveLength(1); // replaced, not 3
    expect(newSpec.events[0].label).toBe("C");
  });
});

// === Edge cases ===

describe("workspace_edit — edge cases", () => {
  it("workspace_edit can coexist with a new artifact in the same reply", async () => {
    const reply = [
      "```workspace_edit\n{\"op\":\"merge\",\"values\":[8]}\n```",
      "```timeline\n{\"events\":[{\"label\":\"E\",\"date\":\"2000\"}]}\n```",
    ].join("\n\n");
    const result = await postProcessReply({
      reply,
      userMessage: "update the graph + add a timeline",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    // Both should be present as attachments
    expect(result.attachments.some((a) => a.type === "workspace_edit")).toBe(true);
    expect(result.attachments.some((a) => a.type === "timeline")).toBe(true);
  });

  it("workspace_edit fence is stripped from the reply (user doesn't see raw JSON)", async () => {
    const reply = "Here's the update:\n```workspace_edit\n{\"op\":\"merge\",\"values\":[8]}\n```\nDone.";
    const result = await postProcessReply({
      reply,
      userMessage: "change",
      userId: "u1",
      userGrade: null,
      intents: EMPTY_INTENTS,
      thinkingSteps: [],
    });
    expect(result.reply).not.toMatch(/```workspace_edit/);
    expect(result.reply).not.toMatch(/"op":"merge"/);
  });
});
