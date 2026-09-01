import { describe, it, expect } from "vitest";
import {
  solveGearTrain, addIdlerToPair, solveBeltDrive, chainSpeed,
} from "./gear-train";

describe("solveGearTrain", () => {
  it("computes a simple 2:1 reduction", () => {
    const r = solveGearTrain(
      [{ id: "m1", driverTeeth: 12, drivenTeeth: 24 }],
      1200,
      2
    );
    expect(r.ok).toBe(true);
    expect(r.overallRatio).toBeCloseTo(2);
    expect(r.rpmOut).toBeCloseTo(600);
    expect(r.torqueMultiplier).toBeCloseTo(2);
    expect(r.direction).toBe("reversed"); // one mesh reverses
  });

  it("a speed increase raises rpm and drops torque", () => {
    const r = solveGearTrain(
      [{ id: "m1", driverTeeth: 30, drivenTeeth: 10 }],
      600,
      6
    );
    expect(r.overallRatio).toBeCloseTo(1 / 3);
    expect(r.rpmOut).toBeCloseTo(1800);
    expect(r.torqueMultiplier).toBeCloseTo(1 / 3);
  });

  it("an idler adds a mesh (direction flips back) but preserves the ratio", () => {
    const direct = solveGearTrain([{ id: "m1", driverTeeth: 12, drivenTeeth: 24 }], 1000, 1);
    const withIdler = solveGearTrain(addIdlerToPair(12, 24, 18), 1000, 1);
    expect(withIdler.overallRatio).toBeCloseTo(direct.overallRatio);
    expect(withIdler.rpmOut).toBeCloseTo(direct.rpmOut);
    expect(direct.direction).toBe("reversed");
    expect(withIdler.direction).toBe("same"); // two meshes: driver direction
  });

  it("multi-stage compound trains multiply ratios", () => {
    const r = solveGearTrain(
      [
        { id: "m1", driverTeeth: 10, drivenTeeth: 40 },
        { id: "m2", driverTeeth: 10, drivenTeeth: 50 },
      ],
      2000,
      1
    );
    expect(r.overallRatio).toBeCloseTo(4 * 5);
    expect(r.rpmOut).toBeCloseTo(2000 / 20);
    expect(r.stages[0].rpmOut).toBeCloseTo(500); // 2000 rpm reduced by 40/10
    expect(r.torqueMultiplier).toBeCloseTo(20);
  });

  it("rejects empty trains and invalid teeth counts", () => {
    expect(solveGearTrain([], 100, 1).ok).toBe(false);
    expect(solveGearTrain([{ id: "m", driverTeeth: 0, drivenTeeth: 10 }], 100, 1).ok).toBe(false);
    expect(solveGearTrain([{ id: "m", driverTeeth: 10, drivenTeeth: -2 }], 100, 1).ok).toBe(false);
  });
});

describe("belt drive + chain", () => {
  it("belt drive scales rpm by diameter ratio, same direction", () => {
    const r = solveBeltDrive({ driverDiameter: 10, drivenDiameter: 20 }, 1200);
    expect(r.rpmOut).toBeCloseTo(600);
    expect(r.direction).toBe("same");
  });

  it("chain speed uses v = πDN/60", () => {
    // D = 0.1 m, N = 60 rpm → v = π * 0.1 * 1 = 0.314 m/s
    expect(chainSpeed(0.1, 60)).toBeCloseTo(Math.PI * 0.1);
  });

  it("rejects invalid geometry", () => {
    expect(() => solveBeltDrive({ driverDiameter: 0, drivenDiameter: 10 }, 100)).toThrow();
    expect(() => chainSpeed(-1, 100)).toThrow();
  });
});
