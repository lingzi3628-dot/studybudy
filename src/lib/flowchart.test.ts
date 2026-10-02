/**
 * Flowchart validator + compiler tests — Phase FC
 *
 * Tests the pure functions: validateFlowchartPlan, hasCycle, computeLayers, compileFlowchartLayout
 *
 * Run: npx vitest run src/lib/flowchart.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  validateFlowchartPlan,
  hasCycle,
  computeLayers,
  type FlowchartPlan,
} from "./flowchart-validator";
import { compileFlowchartLayout } from "./flowchart-compiler";

const VALID_PLAN: FlowchartPlan = {
  type: "flowchart_v1",
  schemaVersion: 1,
  title: "How Rain Forms",
  direction: "top_to_bottom",
  nodes: [
    { id: "water", label: "Water is heated", shape: "rounded_rectangle" },
    { id: "vapour", label: "Water vapour rises", shape: "rectangle" },
    { id: "clouds", label: "Clouds form", shape: "rectangle" },
    { id: "rain", label: "Rain falls", shape: "rounded_rectangle" },
  ],
  edges: [
    { id: "e1", from: "water", to: "vapour" },
    { id: "e2", from: "vapour", to: "clouds" },
    { id: "e3", from: "clouds", to: "rain" },
  ],
};

// ============================================================
// Validation tests
// ============================================================

describe("validateFlowchartPlan", () => {
  it("accepts a valid plan", () => {
    const result = validateFlowchartPlan(VALID_PLAN);
    expect(result.valid).toBe(true);
    expect(result.plan).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-object input", () => {
    const result = validateFlowchartPlan("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects wrong type", () => {
    const result = validateFlowchartPlan({ ...VALID_PLAN, type: "scene" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("flowchart_v1");
  });

  it("rejects coordinates from AI (x field)", () => {
    const result = validateFlowchartPlan({ ...VALID_PLAN, x: 100 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("forbidden"))).toBe(true);
  });

  it("rejects coordinates from AI (svg field)", () => {
    const result = validateFlowchartPlan({ ...VALID_PLAN, svg: "<circle/>" });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("svg"))).toBe(true);
  });

  it("rejects empty nodes array", () => {
    const result = validateFlowchartPlan({ ...VALID_PLAN, nodes: [] });
    expect(result.valid).toBe(false);
  });

  it("rejects duplicate node IDs", () => {
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      nodes: [
        { id: "a", label: "A", shape: "rectangle" },
        { id: "a", label: "B", shape: "rectangle" },
      ],
      edges: [],
    });
    // Should keep first, skip duplicate
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes("duplicate"))).toBe(true);
    expect(result.plan?.nodes).toHaveLength(1);
  });

  it("rejects invalid edge endpoints", () => {
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      edges: [{ id: "e1", from: "nonexistent", to: "water" }],
    });
    expect(result.valid).toBe(true); // still valid, edge just skipped
    expect(result.warnings.some(w => w.includes("invalid"))).toBe(true);
    expect(result.plan?.edges).toHaveLength(0);
  });

  it("normalizes shape aliases (rect → rectangle)", () => {
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      nodes: [{ id: "n1", label: "Test", shape: "rect" }],
      edges: [],
    });
    expect(result.valid).toBe(true);
    expect(result.plan?.nodes[0].shape).toBe("rectangle");
  });

  it("normalizes direction aliases (tb → top_to_bottom)", () => {
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      direction: "tb",
    });
    expect(result.valid).toBe(true);
    expect(result.plan?.direction).toBe("top_to_bottom");
  });

  it("bounds title length", () => {
    const longTitle = "A".repeat(200);
    const result = validateFlowchartPlan({ ...VALID_PLAN, title: longTitle });
    expect(result.valid).toBe(true);
    expect(result.plan?.title.length).toBeLessThanOrEqual(120);
  });

  it("bounds label length", () => {
    const longLabel = "A".repeat(200);
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      nodes: [{ id: "n1", label: longLabel, shape: "rectangle" }],
      edges: [],
    });
    expect(result.valid).toBe(true);
    expect(result.plan?.nodes[0].label.length).toBeLessThanOrEqual(80);
  });

  it("deduplicates edges (same from + to)", () => {
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      edges: [
        { id: "e1", from: "water", to: "vapour" },
        { id: "e2", from: "water", to: "vapour" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.plan?.edges).toHaveLength(1);
  });

  it("generates IDs for nodes without ids", () => {
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      nodes: [{ label: "Test", shape: "rectangle" } as any],
      edges: [],
    });
    expect(result.valid).toBe(true);
    expect(result.plan?.nodes[0].id).toBeDefined();
  });

  it("truncates to MAX_NODES", () => {
    const manyNodes = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`, label: `Node ${i}`, shape: "rectangle" as const,
    }));
    const result = validateFlowchartPlan({
      ...VALID_PLAN,
      nodes: manyNodes,
      edges: [],
    });
    expect(result.valid).toBe(true);
    expect(result.plan?.nodes.length).toBeLessThanOrEqual(30);
    expect(result.warnings.some(w => w.includes("truncated"))).toBe(true);
  });
});

// ============================================================
// Cycle detection
// ============================================================

describe("hasCycle", () => {
  it("returns false for acyclic plan", () => {
    expect(hasCycle(VALID_PLAN)).toBe(false);
  });

  it("returns true for cyclic plan", () => {
    const cyclic: FlowchartPlan = {
      ...VALID_PLAN,
      edges: [
        { id: "e1", from: "water", to: "vapour" },
        { id: "e2", from: "vapour", to: "clouds" },
        { id: "e3", from: "clouds", to: "water" }, // cycle!
      ],
    };
    expect(hasCycle(cyclic)).toBe(true);
  });
});

// ============================================================
// Layer computation
// ============================================================

describe("computeLayers", () => {
  it("assigns layers in topological order", () => {
    const layers = computeLayers(VALID_PLAN);
    expect(layers).toHaveLength(4); // 4 nodes in a chain → 4 layers
    expect(layers[0]).toContain("water");
    expect(layers[1]).toContain("vapour");
    expect(layers[2]).toContain("clouds");
    expect(layers[3]).toContain("rain");
  });

  it("handles branches (multiple nodes per layer)", () => {
    const branched: FlowchartPlan = {
      ...VALID_PLAN,
      nodes: [
        { id: "start", label: "Start", shape: "terminator" },
        { id: "a", label: "Branch A", shape: "rectangle" },
        { id: "b", label: "Branch B", shape: "rectangle" },
        { id: "end", label: "End", shape: "terminator" },
      ],
      edges: [
        { id: "e1", from: "start", to: "a" },
        { id: "e2", from: "start", to: "b" },
        { id: "e3", from: "a", to: "end" },
        { id: "e4", from: "b", to: "end" },
      ],
    };
    const layers = computeLayers(branched);
    expect(layers[0]).toContain("start");
    expect(layers[1]).toContain("a");
    expect(layers[1]).toContain("b");
    expect(layers[2]).toContain("end");
  });

  it("handles disconnected nodes", () => {
    const withDisconnected: FlowchartPlan = {
      ...VALID_PLAN,
      nodes: [
        ...VALID_PLAN.nodes,
        { id: "orphan", label: "Disconnected", shape: "rectangle" },
      ],
    };
    const layers = computeLayers(withDisconnected);
    // Orphan should be in the first layer (no in-edges)
    expect(layers[0]).toContain("orphan");
  });
});

// ============================================================
// Layout compiler
// ============================================================

describe("compileFlowchartLayout", () => {
  it("produces geometry with positions for all nodes", () => {
    const compiled = compileFlowchartLayout(VALID_PLAN);
    expect(compiled.nodes).toHaveLength(4);
    expect(compiled.nodes[0].x).toBeDefined();
    expect(compiled.nodes[0].y).toBeDefined();
    expect(compiled.nodes[0].width).toBeGreaterThan(0);
    expect(compiled.nodes[0].height).toBeGreaterThan(0);
  });

  it("produces edges with paths", () => {
    const compiled = compileFlowchartLayout(VALID_PLAN);
    expect(compiled.edges).toHaveLength(3);
    expect(compiled.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });

  it("produces a viewport", () => {
    const compiled = compileFlowchartLayout(VALID_PLAN);
    expect(compiled.viewport.width).toBeGreaterThan(0);
    expect(compiled.viewport.height).toBeGreaterThan(0);
  });

  it("is deterministic (same input → same output)", () => {
    const a = compileFlowchartLayout(VALID_PLAN);
    const b = compileFlowchartLayout(VALID_PLAN);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("top_to_bottom orders nodes vertically", () => {
    const compiled = compileFlowchartLayout(VALID_PLAN);
    // water (layer 0) should be above vapour (layer 1)
    const water = compiled.nodes.find(n => n.id === "water")!;
    const vapour = compiled.nodes.find(n => n.id === "vapour")!;
    expect(water.y).toBeLessThan(vapour.y);
  });

  it("left_to_right orders nodes horizontally", () => {
    const horizontal: FlowchartPlan = { ...VALID_PLAN, direction: "left_to_right" };
    const compiled = compileFlowchartLayout(horizontal);
    const water = compiled.nodes.find(n => n.id === "water")!;
    const vapour = compiled.nodes.find(n => n.id === "vapour")!;
    expect(water.x).toBeLessThan(vapour.x);
  });

  it("nodes do not overlap in simple chain", () => {
    const compiled = compileFlowchartLayout(VALID_PLAN);
    for (let i = 0; i < compiled.nodes.length - 1; i++) {
      const a = compiled.nodes[i];
      const b = compiled.nodes[i + 1];
      // In vertical layout, b should be below a (no overlap)
      expect(a.y + a.height).toBeLessThanOrEqual(b.y + 5); // small tolerance
    }
  });

  it("handles cycle without crashing (fallback layout)", () => {
    const cyclic: FlowchartPlan = {
      ...VALID_PLAN,
      edges: [
        { id: "e1", from: "water", to: "vapour" },
        { id: "e2", from: "vapour", to: "clouds" },
        { id: "e3", from: "clouds", to: "water" },
      ],
    };
    const compiled = compileFlowchartLayout(cyclic);
    expect(compiled.nodes.length).toBeGreaterThan(0);
  });
});
