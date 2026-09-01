/**
 * PLC Ladder Logic Simulator — Phase 59 (TVETBuddy)
 *
 * Electrical/mechatronics trade: simulate a rung-based ladder program
 * the way a PLC scan cycle does:
 *
 *   1. read inputs
 *   2. evaluate rungs top-to-bottom (coils update as the scan proceeds)
 *   3. outputs hold until the next scan
 *
 * Contacts: NO ("xic" — examine if closed, true when the referenced
 * bit is on), NC ("xio" — true when the bit is OFF). Coils are outputs
 * ("ote"); their state can be referenced by contacts in later rungs —
 * which is exactly how the classic start/stop seal-in (latch) circuit
 * works. Branches within a rung are OR'd; contacts inside a branch are
 * AND'd.
 */

export type LadderContact = {
  kind: "no" | "nc";
  /** referenced bit: an input (e.g. "start") or an output coil (e.g. "motor") */
  ref: string;
};

export type LadderBranch = LadderContact[];

export type LadderRung = {
  id: string;
  /** parallel branches — OR of branch results; each branch is a series AND */
  branches: LadderBranch[];
  /** output coil driven by this rung */
  coil: string;
};

export type LadderProgram = {
  rungs: LadderRung[];
};

export type LadderState = {
  inputs: Record<string, boolean>;
  outputs: Record<string, boolean>;
};

export type ScanTrace = {
  rungId: string;
  coil: string;
  branchResults: boolean[];
  coilOn: boolean;
}[];

export function createLadderState(inputs: string[], outputs: string[]): LadderState {
  return {
    inputs: Object.fromEntries(inputs.map((i) => [i, false])),
    outputs: Object.fromEntries(outputs.map((o) => [o, false])),
  };
}

/** Evaluate one branch (series contacts = AND). */
function evalBranch(branch: LadderBranch, state: LadderState): boolean {
  return branch.every((c) => {
    const bit =
      state.inputs[c.ref] ?? state.outputs[c.ref] ?? false;
    return c.kind === "no" ? bit : !bit;
  });
}

/**
 * One full scan: evaluates every rung in order. Coils update during the
 * scan, so a seal-in contact in a later rung sees the coil's NEW state —
 * the same semantics as a real PLC scan.
 */
export function scan(program: LadderProgram, state: LadderState): { state: LadderState; trace: ScanTrace } {
  const s: LadderState = {
    inputs: { ...state.inputs },
    outputs: { ...state.outputs },
  };
  const trace: ScanTrace = [];

  for (const rung of program.rungs) {
    const branchResults = rung.branches.map((b) => evalBranch(b, s));
    const coilOn = branchResults.some(Boolean);
    s.outputs[rung.coil] = coilOn;
    trace.push({ rungId: rung.id, coil: rung.coil, branchResults, coilOn });
  }

  return { state: s, trace };
}

/**
 * Run N scans, returning the state after each (inputs stay as set by
 * the learner between scans). Useful for showing that a latch holds
 * after the start button is released.
 */
export function runScans(program: LadderProgram, state: LadderState, count: number): LadderState[] {
  const states: LadderState[] = [];
  let current = state;
  for (let i = 0; i < Math.max(1, count); i++) {
    current = scan(program, current).state;
    states.push(current);
  }
  return states;
}

// ---------------------------------------------------------------------
// Preset programs from the syllabus
// ---------------------------------------------------------------------

/** Classic start/stop seal-in: momentary start button latches the motor on. */
export const START_STOP_LATCH: LadderProgram = {
  rungs: [
    {
      id: "r1",
      branches: [
        // OR: (stop NC AND start NO) OR (stop NC AND motor seal-in NO)
        [
          { kind: "nc", ref: "stop" },
          { kind: "no", ref: "start" },
        ],
        [
          { kind: "nc", ref: "stop" },
          { kind: "no", ref: "motor" },
        ],
      ],
      coil: "motor",
    },
  ],
};

/** AND interlock: guard closed AND selector in auto → run the conveyor. */
export const GUARD_INTERLOCK: LadderProgram = {
  rungs: [
    {
      id: "r1",
      branches: [[
        { kind: "no", ref: "guard_closed" },
        { kind: "no", ref: "auto_mode" },
      ]],
      coil: "conveyor",
    },
  ],
};
