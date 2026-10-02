"use client";

/**
 * ScienceSimulationPanel — Phase F14 (Science simulation activity)
 *
 * Interactive circuit simulation that reuses the existing circuit-sim.ts
 * solver. The AI picks an approved circuit template + sets a task; the
 * learner toggles switches + changes values; the solver checks the science.
 *
 * The AI does NOT generate arbitrary simulation code — it only chooses from
 * pre-approved templates + sets the task text. The physics rules are in
 * circuit-sim.ts (deterministic + tested).
 *
 * Artifact spec format:
 * {
 *   "type": "science_simulation",
 *   "subtype": "circuit",
 *   "title": "Light the lamp",
 *   "instruction": "Close the switch to make the lamp light up",
 *   "circuit": {
 *     "sourceVolts": 6,
 *     "tree": { "kind":"series", "parts": [
 *       {"kind":"component","comp":{"id":"b1","type":"battery","name":"Battery","volts":6}},
 *       {"kind":"component","comp":{"id":"s1","type":"switch","name":"Switch","closed":false}},
 *       {"kind":"component","comp":{"id":"l1","type":"bulb","name":"Lamp","ohms":10,"ratedWatts":3}}
 *     ]}
 *   },
 *   "successCheck": "lamp_on"
 * }
 */

import { useState, useCallback, useMemo } from "react";
import { Battery, Lightbulb, ToggleLeft, ToggleRight, Zap, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { solveCircuit, type CircuitTree, type CircuitComponent, type ComponentResult } from "@/lib/circuit-sim";

export type ScienceSimulationSpec = {
  type: "science_simulation";
  subtype: "circuit";
  title: string;
  instruction: string;
  circuit: {
    sourceVolts: number;
    tree: CircuitTree;
  };
  successCheck: "lamp_on" | "lamp_off" | "current_flows" | "no_current";
};

type Props = {
  spec: ScienceSimulationSpec;
};

export function ScienceSimulationPanel({ spec }: Props) {
  const { sourceVolts, tree: initialTree } = spec.circuit;
  const [tree, setTree] = useState<CircuitTree>(initialTree);
  const [checked, setChecked] = useState(false);

  // Toggle a switch in the tree
  const toggleSwitch = useCallback((switchId: string) => {
    setTree((prev) => {
      const toggle = (t: CircuitTree): CircuitTree => {
        if (t.kind === "component") {
          if (t.comp.id === switchId && t.comp.type === "switch") {
            return { ...t, comp: { ...t.comp, closed: !t.comp.closed } };
          }
          return t;
        }
        return { ...t, parts: t.parts.map(toggle) };
      };
      return toggle(prev);
    });
    setChecked(false); // reset check on change
  }, []);

  // Solve the circuit
  const result = useMemo(() => {
    try {
      return solveCircuit(tree, sourceVolts);
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Failed", totalResistance: 0, totalCurrent: 0, totalPower: 0, perComponent: [], shortCircuit: false } as any;
    }
  }, [tree, sourceVolts]);

  // Collect all components for display
  const components = useMemo(() => {
    const collect = (t: CircuitTree): CircuitComponent[] => {
      if (t.kind === "component") return [t.comp];
      return t.parts.flatMap(collect);
    };
    return collect(tree);
  }, [tree]);

  // Get result per component by ID
  const resultById = useMemo(() => {
    const map = new Map<string, ComponentResult>();
    for (const r of result.perComponent) map.set(r.id, r);
    return map;
  }, [result]);

  // Check success condition
  const isSuccess = useMemo(() => {
    if (!result.ok) return false;
    switch (spec.successCheck) {
      case "lamp_on":
        return components.some((c) => {
          const r = resultById.get(c.id);
          return c.type === "bulb" && r && r.brightness !== undefined && r.brightness > 0.05;
        });
      case "lamp_off":
        return components.some((c) => {
          const r = resultById.get(c.id);
          return c.type === "bulb" && r && (r.brightness === undefined || r.brightness < 0.05);
        });
      case "current_flows":
        return result.totalCurrent > 0.001;
      case "no_current":
        return result.totalCurrent < 0.001;
      default:
        return false;
    }
  }, [result, components, resultById, spec.successCheck]);

  return (
    <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/50 p-4">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5 text-sky-600" />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900">{spec.title || "Circuit Simulation"}</h3>
          <p className="text-xs text-gray-600">{spec.instruction}</p>
        </div>
      </div>

      {/* Circuit diagram (simplified — components in a row) */}
      <div className="bg-white rounded-xl border border-sky-100 p-4 mb-3">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {components.map((comp) => {
            const r = resultById.get(comp.id);
            const isOn = r && (r.current > 0.001);
            const isLit = r && r.brightness !== undefined && r.brightness > 0.05;

            return (
              <div key={comp.id} className="flex flex-col items-center gap-1">
                {comp.type === "battery" && (
                  <div className={`flex items-center justify-center w-12 h-12 rounded-lg border-2 ${isOn ? "border-amber-400 bg-amber-50" : "border-gray-300 bg-gray-50"}`}>
                    <Battery className="w-5 h-5 text-amber-600" />
                  </div>
                )}
                {comp.type === "switch" && (
                  <button
                    onClick={() => toggleSwitch(comp.id)}
                    className="flex items-center justify-center w-12 h-12 rounded-lg border-2 transition"
                    style={{
                      borderColor: comp.closed ? "#10b981" : "#d1d5db",
                      background: comp.closed ? "#ecfdf5" : "#f9fafb",
                    }}
                    title={comp.closed ? "Open switch" : "Close switch"}
                  >
                    {comp.closed
                      ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />
                    }
                  </button>
                )}
                {comp.type === "bulb" && (
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg border-2 transition"
                    style={{
                      borderColor: isLit ? "#f59e0b" : "#d1d5db",
                      background: isLit ? "#fef3c7" : "#f9fafb",
                      boxShadow: isLit ? "0 0 12px rgba(245, 158, 11, 0.5)" : "none",
                    }}
                  >
                    <Lightbulb className={`w-5 h-5 transition ${isLit ? "text-amber-500" : "text-gray-400"}`} />
                  </div>
                )}
                {comp.type === "resistor" && (
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg border-2 border-gray-300 bg-gray-50">
                    <span className="text-xs font-mono text-gray-600">Ω</span>
                  </div>
                )}
                {/* Label */}
                <div className="text-center">
                  <p className="text-[9px] font-semibold text-gray-700">{comp.name}</p>
                  {comp.type === "battery" && <p className="text-[8px] text-amber-600">{comp.volts}V</p>}
                  {comp.type === "bulb" && <p className="text-[8px] text-gray-500">{comp.ohms}Ω</p>}
                  {comp.type === "resistor" && <p className="text-[8px] text-gray-500">{comp.ohms}Ω</p>}
                  {comp.type === "switch" && (
                    <p className="text-[8px] font-semibold" style={{ color: comp.closed ? "#10b981" : "#9ca3af" }}>
                      {comp.closed ? "CLOSED" : "OPEN"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Wire indicators (simplified) */}
        <div className="flex items-center justify-center gap-1 mt-2">
          {result.shortCircuit ? (
            <span className="text-[10px] font-bold text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> SHORT CIRCUIT!
            </span>
          ) : result.totalCurrent > 0.001 ? (
            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
              <Activity className="w-3 h-3" /> {result.totalCurrent.toFixed(3)} A flowing
            </span>
          ) : (
            <span className="text-[10px] font-bold text-gray-400">No current</span>
          )}
        </div>
      </div>

      {/* Measurements */}
      {result.ok && result.totalCurrent > 0.001 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-white border border-gray-200 p-2 text-center">
            <p className="text-[8px] font-bold uppercase text-gray-500">Current</p>
            <p className="text-sm font-bold text-gray-900">{result.totalCurrent.toFixed(3)} A</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-2 text-center">
            <p className="text-[8px] font-bold uppercase text-gray-500">Resistance</p>
            <p className="text-sm font-bold text-gray-900">{result.totalResistance.toFixed(1)} Ω</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-2 text-center">
            <p className="text-[8px] font-bold uppercase text-gray-500">Power</p>
            <p className="text-sm font-bold text-gray-900">{result.totalPower.toFixed(2)} W</p>
          </div>
        </div>
      )}

      {/* Result */}
      {checked && (
        <div className={`rounded-xl p-3 mb-3 ${isSuccess ? "bg-emerald-100 border border-emerald-300" : "bg-rose-100 border border-rose-300"}`}>
          <div className="flex items-center gap-2">
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-bold text-emerald-700">Correct! Circuit works!</p>
                  <p className="text-xs text-emerald-600">
                    Current: {result.totalCurrent.toFixed(3)}A · Power: {result.totalPower.toFixed(2)}W
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <div>
                  <p className="text-sm font-bold text-rose-700">Not quite — check your circuit</p>
                  <p className="text-xs text-rose-600">
                    {result.shortCircuit
                      ? "There's a short circuit! Current is bypassing the lamp."
                      : result.totalCurrent < 0.001
                      ? "No current is flowing. Try closing the switch."
                      : "The circuit is working but the lamp isn't lighting. Check your connections."}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={() => setChecked(true)}
        className="w-full h-10 rounded-full bg-sky-500 text-white font-semibold text-sm hover:bg-sky-600 transition flex items-center justify-center gap-1.5"
      >
        <CheckCircle2 className="w-4 h-4" /> Check Circuit
      </button>

      {/* Safety notice */}
      <p className="text-[9px] text-gray-400 text-center mt-2">
        ⚠️ This is a virtual simulation, not a real circuit. Always follow safety rules in the lab.
      </p>
    </div>
  );
}
