/**
 * Circuit Simulator — Phase 59 (TVETBuddy)
 *
 * DC series/parallel circuit solver for the electrical installation
 * trade. Learners compose a circuit from a battery, bulbs, resistors,
 * switches, ammeters and voltmeters as a series/parallel structure
 * tree; the solver reduces it and returns per-component voltage drop,
 * current, power and (for bulbs) relative brightness.
 *
 * This is deliberately a series/parallel (reducible) solver — the
 * CDACC Level 4-6 syllabus focuses on series and parallel lighting and
 * power circuits, not general nodal analysis. Voltmeters/ammeters are
 * modeled ideally (voltmeter = open branch that reports drop across
 * its position, ammeter = zero-resistance series element).
 */

export type ComponentType =
  | "battery" | "bulb" | "resistor" | "switch" | "ammeter" | "voltmeter";

export type CircuitComponent = {
  id: string;
  type: ComponentType;
  name: string;
  /** battery EMF in volts */
  volts?: number;
  /** resistance in ohms */
  ohms?: number;
  /** bulbs: rated power in watts at the rated voltage (for brightness) */
  ratedWatts?: number;
  /** switches: closed = conducting */
  closed?: boolean;
};

export type CircuitTree =
  | { kind: "component"; comp: CircuitComponent }
  | { kind: "series"; parts: CircuitTree[] }
  | { kind: "parallel"; parts: CircuitTree[] };

export type ComponentResult = {
  id: string;
  name: string;
  type: ComponentType;
  /** volts across the component */
  voltage: number;
  /** amps through the component */
  current: number;
  /** watts dissipated */
  power: number;
  /** bulbs only: 0-1 relative to rated power */
  brightness?: number;
};

export type SolveResult = {
  ok: boolean;
  error?: string;
  /** total equivalent resistance (ohms) */
  totalResistance: number;
  /** source current (amps) */
  totalCurrent: number;
  /** total power drawn (watts) */
  totalPower: number;
  perComponent: ComponentResult[];
  /** true when a branch has (nearly) zero resistance — a short circuit */
  shortCircuit: boolean;
};

const EPS = 1e-9;

function collectComponents(t: CircuitTree): CircuitComponent[] {
  if (t.kind === "component") return [t.comp];
  return t.parts.flatMap(collectComponents);
}

/** Effective resistance of a subtree (ohms). Infinity for open switches. */
function effectiveResistance(t: CircuitTree): number {
  switch (t.kind) {
    case "component": {
      const c = t.comp;
      switch (c.type) {
        case "battery": return 0; // ideal source
        case "ammeter": return 0;
        case "voltmeter": return Infinity;
        case "switch": return c.closed ? 0 : Infinity;
        default: return Math.max(0, c.ohms ?? 0);
      }
    }
    case "series": {
      let sum = 0;
      for (const p of t.parts) {
        const r = effectiveResistance(p);
        if (!Number.isFinite(r)) return Infinity;
        sum += r;
      }
      return sum;
    }
    case "parallel": {
      let invSum = 0;
      for (const p of t.parts) {
        const r = effectiveResistance(p);
        if (r === 0) return 0; // one shorted branch shorts the group
        if (!Number.isFinite(r)) continue; // open branch carries nothing
        invSum += 1 / r;
      }
      if (invSum === 0) return Infinity; // all branches open
      return 1 / invSum;
    }
  }
}

/**
 * Solve the circuit: assign (voltage, current, power) per component.
 * Returns ok=false for no source, open circuits and dead shorts.
 */
export function solveCircuit(tree: CircuitTree, sourceVolts: number): SolveResult {
  const comps = collectComponents(tree);
  const perComponent: ComponentResult[] = [];
  const battery = comps.find((c) => c.type === "battery");
  const emf = battery?.volts ?? sourceVolts;

  if (comps.length === 0) {
    return emptyResult("Add components to build a circuit.");
  }
  if (!battery && emf <= 0) {
    return emptyResult("Add a battery — a circuit needs a source of EMF.");
  }
  if (emf <= 0) {
    return emptyResult("The battery voltage must be greater than zero.");
  }

  const totalResistance = effectiveResistance(tree);

  if (!Number.isFinite(totalResistance)) {
    return {
      ...emptyResult("The circuit is open — current cannot flow. Check for open switches or gaps."),
      totalResistance: Infinity,
      perComponent: comps.map(openResult),
    };
  }
  if (totalResistance <= EPS) {
    return {
      ...emptyResult("Short circuit! The current path has (almost) zero resistance — current would be enormous and wiring would overheat. In real life the fuse or MCB trips. NEVER test this on a live circuit."),
      totalResistance: 0,
      shortCircuit: true,
    };
  }

  const totalCurrent = emf / totalResistance;
  const totalPower = emf * totalCurrent;

  solveSubtree(tree, emf, totalCurrent, perComponent);

  return {
    ok: true,
    totalResistance,
    totalCurrent,
    totalPower,
    perComponent,
    shortCircuit: false,
  };
}

function emptyResult(error: string): SolveResult {
  return {
    ok: false,
    error,
    totalResistance: 0,
    totalCurrent: 0,
    totalPower: 0,
    perComponent: [],
    shortCircuit: false,
  };
}

function openResult(c: CircuitComponent): ComponentResult {
  return { id: c.id, name: c.name, type: c.type, voltage: 0, current: 0, power: 0 };
}

/**
 * Recursive pass: a subtree receiving `voltage` across it and `current`
 * through it records its components and recurses.
 */
function solveSubtree(t: CircuitTree, voltage: number, current: number, out: ComponentResult[]) {
  if (t.kind === "component") {
    const c = t.comp;
    if (c.type === "voltmeter") {
      // Ideal voltmeter: measures the drop across its position, carries no current
      out.push({ id: c.id, name: c.name, type: c.type, voltage, current: 0, power: 0 });
      return;
    }
    const power = voltage * current;
    const res: ComponentResult = {
      id: c.id,
      name: c.name,
      type: c.type,
      voltage,
      current,
      power,
    };
    if (c.type === "bulb" && (c.ratedWatts ?? 0) > 0) {
      res.brightness = Math.min(1.5, power / c.ratedWatts!);
    }
    out.push(res);
    return;
  }

  if (t.kind === "series") {
    // same current through each part; voltage divides by resistance share
    for (const p of t.parts) {
      const r = effectiveResistance(p);
      if (!Number.isFinite(r)) {
        solveSubtree(p, 0, 0, out);
        continue;
      }
      const v = r * current;
      solveSubtree(p, v, current, out);
    }
    return;
  }

  // parallel: same voltage across each branch; current divides inversely
  for (const p of t.parts) {
    const r = effectiveResistance(p);
    if (!Number.isFinite(r)) {
      solveSubtree(p, voltage, 0, out);
      continue;
    }
    if (r === 0) {
      // shorted branch — solver flagged it; avoid Infinity current
      solveSubtree(p, voltage, 0, out);
      continue;
    }
    const branchCurrent = voltage / r;
    solveSubtree(p, voltage, branchCurrent, out);
  }
}

// ---------------------------------------------------------------------
// Helpers used by the UI
// ---------------------------------------------------------------------

/** Equivalent resistance between two bulbs in parallel — textbook check. */
export function parallelResistance(r1: number, r2: number): number {
  if (r1 <= 0 || r2 <= 0) return 0;
  return (r1 * r2) / (r1 + r2);
}

/** Fuse/MCB sizing hint: smallest standard rating above the load current. */
export function recommendFuseRating(current: number): number {
  const standard = [1, 2, 3, 5, 6, 10, 13, 16, 20, 32, 40, 50, 63];
  for (const s of standard) {
    if (s >= current * 1.25) return s;
  }
  return Math.ceil(current * 1.5 / 10) * 10;
}
