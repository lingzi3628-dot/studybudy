import { describe, it, expect } from "vitest";
import {
  solveCircuit, parallelResistance, recommendFuseRating,
  type CircuitComponent, type CircuitTree,
} from "./circuit-sim";

const batt = (volts: number, id = "b"): CircuitComponent => ({ id, type: "battery", name: `${volts}V battery`, volts });
const bulb = (ohms: number, id: string, ratedWatts = 6): CircuitComponent => ({ id, type: "bulb", name: id, ohms, ratedWatts });
const res = (ohms: number, id: string): CircuitComponent => ({ id, type: "resistor", name: id, ohms });
const sw = (closed: boolean, id: string): CircuitComponent => ({ id, type: "switch", name: id, closed });

describe("solveCircuit — series", () => {
  it("sums resistances and shares current, dividing voltage", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(12) },
        { kind: "component", comp: res(4, "r1") },
        { kind: "component", comp: res(8, "r2") },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(true);
    expect(r.totalResistance).toBe(12);
    expect(r.totalCurrent).toBeCloseTo(1);
    const r1 = r.perComponent.find((c) => c.id === "r1")!;
    const r2 = r.perComponent.find((c) => c.id === "r2")!;
    expect(r1.voltage).toBeCloseTo(4);
    expect(r2.voltage).toBeCloseTo(8);
    expect(r1.current).toBeCloseTo(1);
    expect(r.totalPower).toBeCloseTo(12);
  });

  it("models a two-bulb series lighting circuit with brightness below rated", () => {
    // Two 6Ω bulbs in series on 12V: I = 1A, each dissipates 6W of 6W rated?
    // P = I²R = 6W — rated 6W each at operating point → brightness 1.0
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(12) },
        { kind: "component", comp: bulb(6, "b1", 6) },
        { kind: "component", comp: bulb(6, "b2", 6) },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(true);
    const b1 = r.perComponent.find((c) => c.id === "b1")!;
    expect(b1.power).toBeCloseTo(6);
    expect(b1.brightness).toBeCloseTo(1);
  });

  it("an open switch stops all current", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(12) },
        { kind: "component", comp: sw(false, "s1") },
        { kind: "component", comp: bulb(6, "b1", 6) },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/open/i);
    const b1 = r.perComponent.find((c) => c.id === "b1")!;
    expect(b1.current).toBe(0);
  });

  it("a closed switch conducts with zero resistance", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(12) },
        { kind: "component", comp: sw(true, "s1") },
        { kind: "component", comp: bulb(6, "b1", 6) },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(true);
    expect(r.totalResistance).toBeCloseTo(6);
  });

  it("flags a dead short", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(12) },
        { kind: "component", comp: sw(true, "s1") },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(false);
    expect(r.shortCircuit).toBe(true);
    expect(r.error).toMatch(/short/i);
  });

  it("reports missing source and zero volts", () => {
    const tree: CircuitTree = { kind: "component", comp: res(10, "r1") };
    expect(solveCircuit(tree, 0).ok).toBe(false);
    expect(solveCircuit(tree, 0).error).toMatch(/battery|source/i);
    const withBatt: CircuitTree = { kind: "component", comp: batt(0) };
    expect(solveCircuit(withBatt, 0).error).toMatch(/greater than zero/);
  });
});

describe("solveCircuit — parallel", () => {
  it("two identical bulbs in parallel: same voltage, half current each", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(12) },
        {
          kind: "parallel",
          parts: [
            { kind: "component", comp: bulb(6, "b1", 12) },
            { kind: "component", comp: bulb(6, "b2", 12) },
          ],
        },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(true);
    expect(r.totalResistance).toBeCloseTo(3); // 6∥6 = 3
    expect(r.totalCurrent).toBeCloseTo(4);
    const b1 = r.perComponent.find((c) => c.id === "b1")!;
    expect(b1.voltage).toBeCloseTo(12);
    expect(b1.current).toBeCloseTo(2);
    expect(b1.power).toBeCloseTo(24); // each bulb overdriven → brightness capped
    expect(b1.brightness).toBeLessThanOrEqual(1.5);
  });

  it("mixed series-parallel: parallel group behaves as its equivalent", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(24) },
        { kind: "component", comp: res(2, "r0") },
        {
          kind: "parallel",
          parts: [
            { kind: "component", comp: res(6, "r1") },
            { kind: "component", comp: res(12, "r2") },
          ],
        }, // 6∥12 = 4
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.totalResistance).toBeCloseTo(6);
    expect(r.totalCurrent).toBeCloseTo(4);
    // 24V splits: 8V across r0, 16V across the parallel group
    const r0 = r.perComponent.find((c) => c.id === "r0")!;
    expect(r0.voltage).toBeCloseTo(8);
    const r1 = r.perComponent.find((c) => c.id === "r1")!;
    const r2 = r.perComponent.find((c) => c.id === "r2")!;
    expect(r1.voltage).toBeCloseTo(16);
    expect(r2.current).toBeCloseTo(16 / 12);
  });

  it("one open branch does not stop the others", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(12) },
        {
          kind: "parallel",
          parts: [
            { kind: "component", comp: sw(false, "s1") }, // open branch
            { kind: "component", comp: res(12, "r1") },
          ],
        },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(true);
    expect(r.totalResistance).toBeCloseTo(12);
    const s1 = r.perComponent.find((c) => c.id === "s1")!;
    expect(s1.current).toBe(0);
  });

  it("a voltmeter in parallel reads the drop without carrying current", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(9) },
        {
          kind: "parallel",
          parts: [
            { kind: "component", comp: res(9, "r1") },
            { kind: "component", comp: { id: "v1", type: "voltmeter", name: "V1" } },
          ],
        },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(true);
    expect(r.totalResistance).toBeCloseTo(9); // voltmeter branch is ideal (open)
    expect(r.totalCurrent).toBeCloseTo(1);
    const v1 = r.perComponent.find((c) => c.id === "v1")!;
    expect(v1.voltage).toBeCloseTo(9);
    expect(v1.current).toBe(0);
  });

  it("a voltmeter wired in SERIES opens the circuit — the classic mistake", () => {
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: batt(9) },
        { kind: "component", comp: res(9, "r1") },
        { kind: "component", comp: { id: "v1", type: "voltmeter", name: "V1" } },
      ],
    };
    const r = solveCircuit(tree, 0);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/open/i);
  });
});

describe("helpers", () => {
  it("parallelResistance matches the product-over-sum", () => {
    expect(parallelResistance(6, 12)).toBeCloseTo(4);
    expect(parallelResistance(10, 10)).toBeCloseTo(5);
  });

  it("recommends the next standard fuse above 125% of load", () => {
    expect(recommendFuseRating(4)).toBe(5);  // 4 × 1.25 = 5 → smallest standard ≥ 5
    expect(recommendFuseRating(10)).toBe(13); // 12.5 → 13 A (standard plug fuse)
  });
});
