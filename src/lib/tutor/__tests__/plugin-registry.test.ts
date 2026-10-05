/**
 * plugin-registry tests — Phase AC2
 *
 * Covers manifest lookups, category filtering, action support checks, and
 * the candidate filter used by the AI shortlist step.
 */
import { describe, it, expect } from "vitest";
import {
  getManifest,
  listEnabledManifests,
  listManifestsByCategory,
  isPluginAvailable,
  pluginSupportsAction,
  filterCandidates,
  listAllPluginIds,
  listEnabledCategories,
  GRAPH_BAR_MANIFEST,
  DIAGRAM_FLOWCHART_MANIFEST,
  CODE_PYTHON_MANIFEST,
  CODE_JAVASCRIPT_MANIFEST,
  ASSESSMENT_QUIZ_MANIFEST,
} from "../plugin-registry";

describe("plugin-registry — initial manifest set", () => {
  it("registers 33 plugins (5 original + 23 + 5 quick wins)", () => {
    const ids = listAllPluginIds();
    expect(ids.length).toBe(33);
    // Original 5
    expect(ids).toContain("graph.bar");
    expect(ids).toContain("diagram.flowchart");
    expect(ids).toContain("code.python");
    expect(ids).toContain("code.javascript");
    expect(ids).toContain("assessment.quiz");
    // New 23
    expect(ids).toContain("code.html");
    expect(ids).toContain("code.sql");
    expect(ids).toContain("code.c");
    expect(ids).toContain("diagram.circuit");
    expect(ids).toContain("drawing.freehand");
    expect(ids).toContain("assessment.flashcards");
    expect(ids).toContain("server.shell");
    expect(ids).toContain("writing.notebook");
  });

  it("all 33 manifests are enabled", () => {
    const manifests = listEnabledManifests();
    expect(manifests).toHaveLength(33);
    for (const m of manifests) {
      expect(m.availability.enabled).toBe(true);
    }
  });

  it("all manifests have stable version 1", () => {
    for (const m of listEnabledManifests()) {
      expect(m.version).toBe(1);
    }
  });
});

describe("plugin-registry — getManifest", () => {
  it("returns the manifest for known plugin IDs", () => {
    expect(getManifest("graph.bar")?.id).toBe("graph.bar");
    expect(getManifest("diagram.flowchart")?.id).toBe("diagram.flowchart");
    expect(getManifest("code.python")?.id).toBe("code.python");
    expect(getManifest("code.javascript")?.id).toBe("code.javascript");
    expect(getManifest("assessment.quiz")?.id).toBe("assessment.quiz");
  });

  it("returns null for truly unknown plugin IDs", () => {
    expect(getManifest("nonexistent.plugin")).toBeNull();
    expect(getManifest("")).toBeNull();
    expect(getManifest("graph.unknown")).toBeNull();
  });
});

describe("plugin-registry — isPluginAvailable + pluginSupportsAction", () => {
  it("isPluginAvailable returns true for all 5 registered plugins", () => {
    expect(isPluginAvailable("graph.bar")).toBe(true);
    expect(isPluginAvailable("diagram.flowchart")).toBe(true);
    expect(isPluginAvailable("code.python")).toBe(true);
    expect(isPluginAvailable("code.javascript")).toBe(true);
    expect(isPluginAvailable("assessment.quiz")).toBe(true);
  });

  it("isPluginAvailable returns false for unregistered IDs", () => {
    expect(isPluginAvailable("graph.line")).toBe(false);
    expect(isPluginAvailable("nonexistent")).toBe(false);
  });

  it("pluginSupportsAction respects the supportedActions list", () => {
    // graph.bar supports create, modify, inspect — NOT run
    expect(pluginSupportsAction("graph.bar", "create")).toBe(true);
    expect(pluginSupportsAction("graph.bar", "modify")).toBe(true);
    expect(pluginSupportsAction("graph.bar", "inspect")).toBe(true);
    expect(pluginSupportsAction("graph.bar", "run")).toBe(false);
    expect(pluginSupportsAction("graph.bar", "review")).toBe(false);

    // code.python supports run
    expect(pluginSupportsAction("code.python", "run")).toBe(true);
    expect(pluginSupportsAction("code.python", "create")).toBe(true);

    // assessment.quiz supports review
    expect(pluginSupportsAction("assessment.quiz", "review")).toBe(true);
    expect(pluginSupportsAction("assessment.quiz", "run")).toBe(true);

    // Unknown plugin ID → false for any action
    expect(pluginSupportsAction("nonexistent", "create")).toBe(false);
  });
});

describe("plugin-registry — listManifestsByCategory", () => {
  it("returns graph plugins for graph category", () => {
    const graphPlugins = listManifestsByCategory("graph");
    expect(graphPlugins.map((m) => m.id)).toContain("graph.bar");
    expect(graphPlugins.map((m) => m.id)).toContain("graph.function");
    expect(graphPlugins.map((m) => m.id)).toContain("graph.scatter");
  });

  it("returns diagram plugins for diagram category", () => {
    const diagramPlugins = listManifestsByCategory("diagram");
    expect(diagramPlugins.map((m) => m.id)).toContain("diagram.flowchart");
    expect(diagramPlugins.map((m) => m.id)).toContain("diagram.concept-map");
  });

  it("returns all code plugins for code category", () => {
    const codePlugins = listManifestsByCategory("code");
    const ids = codePlugins.map((m) => m.id);
    expect(ids).toContain("code.python");
    expect(ids).toContain("code.javascript");
    expect(ids).toContain("code.html");
    expect(ids).toContain("code.sql");
  });

  it("returns assessment plugins for assessment category", () => {
    const assessmentPlugins = listManifestsByCategory("assessment");
    const ids = assessmentPlugins.map((m) => m.id);
    expect(ids).toContain("assessment.quiz");
    expect(ids).toContain("assessment.flashcards");
    expect(ids).toContain("assessment.exam");
  });

  it("returns simulation plugins (circuit, gear, nginx, plc)", () => {
    const simPlugins = listManifestsByCategory("simulation");
    const ids = simPlugins.map((m) => m.id);
    expect(ids).toContain("diagram.circuit");
    expect(ids).toContain("diagram.gear");
  });

  it("returns drawing plugins (freehand, scene)", () => {
    const drawPlugins = listManifestsByCategory("drawing");
    const ids = drawPlugins.map((m) => m.id);
    expect(ids).toContain("drawing.freehand");
    expect(ids).toContain("drawing.scene");
  });
});

describe("plugin-registry — listEnabledCategories", () => {
  it("returns all 6 categories (graph, diagram, code, assessment, simulation, drawing)", () => {
    const cats = listEnabledCategories().sort();
    expect(cats).toContain("graph");
    expect(cats).toContain("diagram");
    expect(cats).toContain("code");
    expect(cats).toContain("assessment");
    expect(cats).toContain("simulation");
    expect(cats).toContain("drawing");
  });
});

describe("plugin-registry — filterCandidates", () => {
  it("filters out unknown plugin IDs", () => {
    const candidates = filterCandidates(["graph.bar", "graph.line", "nonexistent"], "create");
    expect(candidates.map((m) => m.id)).toEqual(["graph.bar"]);
  });

  it("filters out plugins that don't support the action", () => {
    // graph.bar doesn't support "run" — should be filtered out
    const candidates = filterCandidates(["graph.bar", "code.python"], "run");
    expect(candidates.map((m) => m.id)).toEqual(["code.python"]);
  });

  it("deduplicates repeated IDs", () => {
    const candidates = filterCandidates(
      ["graph.bar", "graph.bar", "code.python", "code.python"],
      "create",
    );
    expect(candidates.map((m) => m.id)).toEqual(["graph.bar", "code.python"]);
  });

  it("returns empty for an empty input list", () => {
    expect(filterCandidates([], "create")).toEqual([]);
  });

  it("returns empty when no candidates support the action", () => {
    expect(filterCandidates(["graph.bar", "diagram.flowchart"], "run")).toEqual([]);
  });
});

describe("plugin-registry — manifest shape (defensive)", () => {
  it("every manifest has a non-empty searchTerms array", () => {
    for (const m of listEnabledManifests()) {
      expect(m.searchTerms.length).toBeGreaterThan(0);
    }
  });

  it("every manifest has a non-empty inputRequirements array", () => {
    for (const m of listEnabledManifests()) {
      expect(m.inputRequirements.length).toBeGreaterThan(0);
    }
  });

  it("every manifest supports web platform", () => {
    for (const m of listEnabledManifests()) {
      expect(m.availability.supportedPlatforms).toContain("web");
    }
  });

  it("code plugins advertise execute capability", () => {
    expect(CODE_PYTHON_MANIFEST.capabilities.execute).toBe(true);
    expect(CODE_JAVASCRIPT_MANIFEST.capabilities.execute).toBe(true);
  });

  it("graph + diagram + assessment plugins do NOT advertise execute capability", () => {
    expect(GRAPH_BAR_MANIFEST.capabilities.execute).toBe(false);
    expect(DIAGRAM_FLOWCHART_MANIFEST.capabilities.execute).toBe(false);
    expect(ASSESSMENT_QUIZ_MANIFEST.capabilities.execute).toBe(false);
  });

  it("most manifests support create action (except math.calculator which only supports run)", () => {
    for (const m of listEnabledManifests()) {
      if (m.id !== "math.calculator") {
        expect(m.supportedActions).toContain("create");
      }
    }
  });
});
