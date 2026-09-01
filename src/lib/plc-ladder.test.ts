import { describe, it, expect } from "vitest";
import {
  scan, runScans, createLadderState, START_STOP_LATCH, GUARD_INTERLOCK,
} from "./plc-ladder";

/** Set an input on the LATEST state (each scan returns a fresh copy). */
function press(st: ReturnType<typeof createLadderState>, key: string, value: boolean) {
  return { ...st, inputs: { ...st.inputs, [key]: value } };
}

describe("scan semantics", () => {
  it("AND rung requires every contact true", () => {
    let st = createLadderState(["guard_closed", "auto_mode"], ["conveyor"]);
    st = press(st, "guard_closed", true);
    let r = scan(GUARD_INTERLOCK, st);
    expect(r.state.outputs.conveyor).toBe(false); // auto_mode still off
    r = scan(GUARD_INTERLOCK, press(r.state, "auto_mode", true));
    expect(r.state.outputs.conveyor).toBe(true);
  });

  it("NC contact passes when the bit is OFF (stop button)", () => {
    const st = createLadderState(["stop", "start"], ["motor"]);
    st.inputs.start = true; // stop released (false) → NC passes
    const r = scan(START_STOP_LATCH, st);
    expect(r.state.outputs.motor).toBe(true);
  });

  it("pressing stop drops the seal-in and the motor", () => {
    let st = createLadderState(["stop", "start"], ["motor"]);
    st = press(st, "start", true);
    let r = scan(START_STOP_LATCH, st);
    expect(r.state.outputs.motor).toBe(true);

    // Release start (motor must HOLD via seal-in contact)
    r = scan(START_STOP_LATCH, press(r.state, "start", false));
    expect(r.state.outputs.motor).toBe(true); // latched!

    // Press stop → NC opens → coil drops
    r = scan(START_STOP_LATCH, press(r.state, "stop", true));
    expect(r.state.outputs.motor).toBe(false);

    // Release stop → motor stays off (start is released)
    r = scan(START_STOP_LATCH, press(r.state, "stop", false));
    expect(r.state.outputs.motor).toBe(false);
  });

  it("the seal-in survives a scan without the start button", () => {
    let st = createLadderState(["stop", "start"], ["motor"]);
    st = press(st, "start", true);
    const latched = scan(START_STOP_LATCH, st).state;
    const released = press(latched, "start", false);
    const states = runScans(START_STOP_LATCH, released, 5);
    expect(states.every((s) => s.outputs.motor)).toBe(true);
  });

  it("produces a trace with per-branch results", () => {
    const st = press(createLadderState(["stop", "start"], ["motor"]), "start", true);
    const r = scan(START_STOP_LATCH, st);
    expect(r.trace).toHaveLength(1);
    expect(r.trace[0].branchResults).toHaveLength(2);
    expect(r.trace[0].coilOn).toBe(true); // start pressed, stop released
  });

  it("a coil updated this scan is visible to later rungs (scan order)", () => {
    const program = {
      rungs: [
        { id: "r1", branches: [[{ kind: "no" as const, ref: "input1" }]], coil: "aux" },
        { id: "r2", branches: [[{ kind: "no" as const, ref: "aux" }]], coil: "lamp" },
      ],
    };
    let st = createLadderState(["input1"], ["aux", "lamp"]);
    const r = scan(program, st);
    expect(r.state.outputs.aux).toBe(false);
    expect(r.state.outputs.lamp).toBe(false);
    st = press(st, "input1", true);
    const r2 = scan(program, st);
    expect(r2.state.outputs.aux).toBe(true);
    expect(r2.state.outputs.lamp).toBe(true); // aux updated in the SAME scan
  });

  it("unknown references behave as open contacts", () => {
    const program = { rungs: [{ id: "r1", branches: [[{ kind: "no", ref: "ghost" }]], coil: "out" }] };
    const st = createLadderState([], ["out"]);
    const r = scan(program, st);
    expect(r.state.outputs.out).toBe(false);
  });
});
