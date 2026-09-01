/**
 * Gear Train Simulator — Phase 59 (TVETBuddy)
 *
 * Mechanical engineering trade: simple and compound gear trains.
 * A train is a list of stages; each stage is either a simple mesh
 * (driver gear → driven gear on a different shaft) or a compound stage
 * where the driven gear shares a shaft with the next stage's driver
 * (same RPM). Computes ratios, direction, RPM and torque at each shaft
 * assuming 100% meshing efficiency (friction losses are a discussion
 * point, not a hidden number).
 */

export type GearStage = {
  id: string;
  /** teeth on the input gear of this mesh */
  driverTeeth: number;
  /** teeth on the output gear of this mesh */
  drivenTeeth: number;
  label?: string;
};

export type GearTrainResult = {
  ok: boolean;
  error?: string;
  /** overall ratio = product of driven/driver (>1 = speed reduction) */
  overallRatio: number;
  /** overall speed change as a signed multiplier (odd meshes reverse) */
  speedMultiplier: number;
  /** number of direction reversals (equal to number of meshes) */
  reversals: number;
  /** "reversed" | "same" direction between input and output */
  direction: "reversed" | "same";
  stages: {
    id: string;
    ratio: number;          // driven/driver for this mesh
    rpmOut: number;         // rpm of the driven gear
    torqueMultiplier: number; // ideal torque gain for this mesh
  }[];
  rpmOut: number;
  torqueMultiplier: number;
};

/**
 * Simulate a gear train.
 *
 * @param stages the meshes in order
 * @param inputRpm speed of the first driver gear (rpm)
 * @param inputTorque torque at the first driver shaft (Nm)
 */
export function solveGearTrain(
  stages: GearStage[],
  inputRpm: number,
  inputTorque: number
): GearTrainResult {
  if (stages.length === 0) {
    return {
      ok: false,
      error: "Add at least one meshed gear pair.",
      overallRatio: 1,
      speedMultiplier: 1,
      reversals: 0,
      direction: "same",
      stages: [],
      rpmOut: inputRpm,
      torqueMultiplier: 1,
    };
  }
  for (const s of stages) {
    if (!Number.isFinite(s.driverTeeth) || s.driverTeeth <= 0 || !Number.isFinite(s.drivenTeeth) || s.drivenTeeth <= 0) {
      return {
        ok: false,
        error: "Gear teeth counts must be positive numbers.",
        overallRatio: 1,
        speedMultiplier: 1,
        reversals: 0,
        direction: "same",
        stages: [],
        rpmOut: inputRpm,
        torqueMultiplier: 1,
      };
    }
  }

  let rpm = inputRpm;
  let torque = inputTorque;
  let ratioProduct = 1;
  const outStages: GearTrainResult["stages"] = [];

  for (const s of stages) {
    const ratio = s.drivenTeeth / s.driverTeeth; // >1 = speed reduction, torque gain
    rpm = rpm / ratio;   // more teeth on the driven gear → it turns SLOWER
    torque = torque * ratio; // ideal (100% efficiency)
    ratioProduct *= ratio;
    outStages.push({
      id: s.id,
      ratio,
      rpmOut: rpm,
      torqueMultiplier: torque / inputTorque,
    });
  }

  const meshes = stages.length;
  const reversed = meshes % 2 === 1;

  return {
    ok: true,
    overallRatio: ratioProduct,
    speedMultiplier: 1 / ratioProduct,
    reversals: meshes,
    direction: reversed ? "reversed" : "same",
    stages: outStages,
    rpmOut: rpm,
    torqueMultiplier: torque / inputTorque,
  };
}

/**
 * Insert an idler gear between a driver and a driven gear. The idler
 * reverses direction TWICE (one extra mesh) so the output direction
 * matches the driver, and the overall ratio is unchanged:
 * (idler/driver) × (driven/idler) = driven/driver. Textbook invariant.
 */
export function addIdlerToPair(driverTeeth: number, drivenTeeth: number, idlerTeeth: number): GearStage[] {
  return [
    { id: "idler-mesh-1", driverTeeth, drivenTeeth: idlerTeeth },
    { id: "idler-mesh-2", driverTeeth: idlerTeeth, drivenTeeth },
  ];
}

// ---------------------------------------------------------------------
// Belt/pulley companion (same syllabus unit, opposite ratio behavior)
// ---------------------------------------------------------------------

export type PulleyPair = {
  driverDiameter: number;
  drivenDiameter: number;
};

/**
 * Belt drive: rpm_out = rpm_in * d_driver / d_driven. Unlike gears,
 * belts turn both pulleys the SAME direction.
 */
export function solveBeltDrive(p: PulleyPair, inputRpm: number): { rpmOut: number; ratio: number; direction: "same" } {
  if (p.driverDiameter <= 0 || p.drivenDiameter <= 0) {
    throw new Error("Pulley diameters must be positive.");
  }
  const ratio = p.driverDiameter / p.drivenDiameter;
  return { rpmOut: inputRpm * ratio, ratio, direction: "same" };
}

/** Chain/sprocket speed in m/s: v = π·D·N / 60 (D in meters, N in rpm). */
export function chainSpeed(pitchDiameterM: number, rpm: number): number {
  if (pitchDiameterM <= 0 || rpm < 0) throw new Error("Invalid chain parameters.");
  return (Math.PI * pitchDiameterM * rpm) / 60;
}
