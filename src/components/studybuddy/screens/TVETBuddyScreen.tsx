"use client";

/**
 * TVETBuddyScreen — Phase 59
 *
 * The TVET workshop: trade simulators grounded in Kenya's CDACC
 * curriculum (Level 4-6), each backed by a pure, tested engine.
 *
 *   CIRCUIT    — DC series/parallel circuit builder: bulbs, resistors,
 *                switches, voltmeter/ammeter with live per-component
 *                voltage/current/power, brightness, short-circuit and
 *                open-circuit detection, fuse recommendation.
 *   GEARS      — gear train calculator: ratios, direction, rpm and
 *                ideal torque per stage, idler-gear invariant, belt drive.
 *   NETWORK    — small-office LAN planner: devices + links, connectivity
 *                lint (unreachable hosts, missing AP, duplicate IPs),
 *                IPv4 subnet calculator.
 *   PLC        — ladder logic trainer: scan-cycle simulation with the
 *                classic start/stop seal-in circuit; toggle inputs and
 *                watch coils update rung by rung.
 *   CHECKLISTS — CDACC competency skill checklists per trade with a
 *                downloadable practical-assessment sheet.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ChevronLeft, Wrench, Zap, Cog, Network, ListTree, Download,
  CheckSquare, Square, Loader2, Save, AlertTriangle, CheckCircle2,
  Play, RotateCcw, Plus, Trash2, Info,
} from "lucide-react";
import { useApp } from "../store";
import {
  solveCircuit, recommendFuseRating,
  type CircuitComponent, type CircuitTree, type SolveResult,
} from "@/lib/circuit-sim";
import { solveGearTrain, type GearStage } from "@/lib/gear-train";
import {
  validateNetwork, calculateSubnet, type NetworkPlan, type NetDevice, type NetDeviceType,
} from "@/lib/network-topo";
import {
  scan, createLadderState, START_STOP_LATCH, GUARD_INTERLOCK, type LadderProgram, type LadderState,
} from "@/lib/plc-ladder";
import { TRADES, generateAssessmentSheet, type Trade } from "@/lib/cdacc-data";

type Tab = "circuit" | "gears" | "network" | "plc" | "checklists";

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function TVETBuddyScreen() {
  const { setScreen } = useApp() as any;
  const [tab, setTab] = useState<Tab>("circuit");

  return (
    <div className="min-h-screen bg-amber-50/50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => setScreen("projects")}
          aria-label="Back to projects"
          className="text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Wrench className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <h1 className="text-sm font-bold text-gray-900 flex-1">TVET Workshop</h1>
        <span className="hidden sm:inline text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-1">CDACC Level 4-6</span>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-1 overflow-x-auto">
        {([
          ["circuit", "Circuit", <Zap key="c" className="w-3.5 h-3.5" />],
          ["gears", "Gears", <Cog key="g" className="w-3.5 h-3.5" />],
          ["network", "Network", <Network key="n" className="w-3.5 h-3.5" />],
          ["plc", "PLC Ladder", <ListTree key="p" className="w-3.5 h-3.5" />],
          ["checklists", "Checklists", <CheckSquare key="k" className="w-3.5 h-3.5" />],
        ] as [Tab, string, JSX.Element][]).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 h-11 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
              tab === id
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "circuit" && <CircuitPanel />}
      {tab === "gears" && <GearsPanel />}
      {tab === "network" && <NetworkPanel />}
      {tab === "plc" && <PlcPanel />}
      {tab === "checklists" && <ChecklistsPanel />}
    </div>
  );
}

// =====================================================================
// Circuit panel
// =====================================================================

type CircuitItem =
  | { kind: "bulb"; id: string; ohms: number; ratedWatts: number }
  | { kind: "resistor"; id: string; ohms: number }
  | { kind: "switch"; id: string; closed: boolean }
  | { kind: "voltmeter"; id: string }
  | { kind: "ammeter"; id: string };

let cid = 0;
const nextId = (p: string) => `${p}-${++cid}`;

function CircuitPanel() {
  const [volts, setVolts] = useState(12);
  const [items, setItems] = useState<CircuitItem[]>([
    { kind: "switch", id: nextId("sw"), closed: true },
    { kind: "bulb", id: nextId("b"), ohms: 6, ratedWatts: 6 },
  ]);

  const { tree, comps } = useMemo(() => {
    const battery: CircuitComponent = { id: "batt", type: "battery", name: "Battery", volts };
    const cc: CircuitComponent[] = items.map((it) => {
      switch (it.kind) {
        case "bulb": return { id: it.id, type: "bulb", name: "Bulb", ohms: it.ohms, ratedWatts: it.ratedWatts };
        case "resistor": return { id: it.id, type: "resistor", name: "Resistor", ohms: it.ohms };
        case "switch": return { id: it.id, type: "switch", name: "Switch", closed: it.closed };
        case "voltmeter": return { id: it.id, type: "voltmeter", name: "Voltmeter" };
        case "ammeter": return { id: it.id, type: "ammeter", name: "Ammeter" };
      }
    });
    // Build a tree: everything in series after the battery
    const tree: CircuitTree = {
      kind: "series",
      parts: [
        { kind: "component", comp: battery },
        ...cc.map((c) => ({ kind: "component" as const, comp: c })),
      ],
    };
    return { tree, comps: cc };
  }, [items, volts]);

  const result: SolveResult = useMemo(() => solveCircuit(tree, volts), [tree, volts]);

  const addItem = (kind: CircuitItem["kind"]) => {
    if (kind === "bulb") setItems((p) => [...p, { kind, id: nextId("b"), ohms: 6, ratedWatts: 6 }]);
    else if (kind === "resistor") setItems((p) => [...p, { kind, id: nextId("r"), ohms: 10 }]);
    else if (kind === "switch") setItems((p) => [...p, { kind, id: nextId("sw"), closed: true }]);
    else if (kind === "voltmeter") setItems((p) => [...p, { kind, id: nextId("v") }]);
    else setItems((p) => [...p, { kind, id: nextId("a") }]);
  };

  const updateItem = (id: string, patch: Partial<CircuitItem>) => {
    setItems((p) => p.map((it) => (it.id === id ? ({ ...it, ...patch } as CircuitItem) : it)));
  };

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-4 space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-500" /> Series circuit builder
          </h2>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            Battery:
            <input
              type="number"
              value={volts}
              min={1}
              max={240}
              onChange={(e) => setVolts(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-16 text-xs bg-white border border-gray-200 rounded px-1.5 py-1"
            />
            V
          </label>
        </div>

        {/* Items list */}
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={it.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
              <span className="text-[10px] font-bold text-gray-400 w-5">{i + 1}</span>
              <span className="font-semibold text-gray-800 capitalize w-20">{it.kind}</span>
              {it.kind === "bulb" && (
                <select
                  value={it.ohms}
                  onChange={(e) => updateItem(it.id, { ohms: parseFloat(e.target.value) })}
                  className="text-xs bg-white border border-gray-200 rounded px-1.5 py-1"
                >
                  <option value={3}>3 Ω</option>
                  <option value={6}>6 Ω</option>
                  <option value={12}>12 Ω</option>
                  <option value={24}>24 Ω</option>
                </select>
              )}
              {it.kind === "resistor" && (
                <input
                  type="number"
                  value={it.ohms}
                  min={1}
                  onChange={(e) => updateItem(it.id, { ohms: Math.max(1, parseFloat(e.target.value) || 1) })}
                  className="w-16 text-xs bg-white border border-gray-200 rounded px-1.5 py-1"
                />
              )}
              {it.kind === "switch" && (
                <button
                  onClick={() => updateItem(it.id, { closed: !it.closed } as Partial<CircuitItem>)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                    it.closed ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {it.closed ? "CLOSED" : "OPEN"}
                </button>
              )}
              <button
                onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                className="ml-auto text-rose-500 hover:text-rose-700"
                aria-label="Remove component"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Add components below — a switch and a lamp make the classic first circuit.</p>
          )}
        </div>

        {/* Add buttons */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(["bulb", "resistor", "switch", "voltmeter", "ammeter"] as const).map((k) => (
            <button
              key={k}
              onClick={() => addItem(k)}
              className="text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-full px-2.5 py-1 capitalize transition"
            >
              + {k}
            </button>
          ))}
          <button
            onClick={() => setItems([])}
            className="text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-1 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </section>

      {/* Results */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Simulation</h2>
        {!result.ok ? (
          <div className={`rounded-xl p-3 flex gap-2 ${result.shortCircuit ? "bg-rose-50 border border-rose-200" : "bg-amber-50 border border-amber-200"}`}>
            <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${result.shortCircuit ? "text-rose-500" : "text-amber-500"}`} />
            <p className={`text-xs font-medium ${result.shortCircuit ? "text-rose-700" : "text-amber-800"}`}>{result.error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl bg-gray-50 p-2.5 text-center">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Total R</p>
                <p className="text-sm font-bold text-gray-900">{result.totalResistance.toFixed(2)} Ω</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-2.5 text-center">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Current</p>
                <p className="text-sm font-bold text-sky-600">{result.totalCurrent.toFixed(3)} A</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-2.5 text-center">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Power</p>
                <p className="text-sm font-bold text-violet-600">{result.totalPower.toFixed(1)} W</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              Fuse/MCB suggestion: <b>{recommendFuseRating(result.totalCurrent)} A</b> (next standard rating above 125% of load current).
            </p>
            <table className="text-[11px] border-collapse w-full">
              <thead>
                <tr className="text-[9px] uppercase text-gray-400">
                  <th className="text-left py-1 pr-2">Component</th>
                  <th className="text-right py-1 pr-2">V</th>
                  <th className="text-right py-1 pr-2">A</th>
                  <th className="text-right py-1 pr-2">W</th>
                  <th className="text-left py-1">Brightness</th>
                </tr>
              </thead>
              <tbody>
                {result.perComponent.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2 font-semibold text-gray-700 capitalize">{c.name}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-600">{c.voltage.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-600">{c.current.toFixed(3)}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-600">{c.power.toFixed(2)}</td>
                    <td className="py-1.5">
                      {c.brightness !== undefined ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (c.brightness / 1.5) * 100)}%`,
                                background: c.brightness < 0.3 ? "#fbbf24" : c.brightness <= 1.05 ? "#f59e0b" : "#ef4444",
                              }}
                            />
                          </div>
                          <span className="text-[9px] text-gray-400">
                            {c.brightness < 0.3 ? "dim" : c.brightness <= 1.05 ? "rated" : "overdriven!"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 mt-2 flex gap-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              Try: two 6 Ω bulbs in series vs one alone; a voltmeter in series (why does the lamp go out?).
            </p>
          </>
        )}
      </section>
    </div>
  );
}

// =====================================================================
// Gears panel
// =====================================================================

function GearsPanel() {
  const [inputRpm, setInputRpm] = useState(1200);
  const [inputTorque, setInputTorque] = useState(2);
  const [stages, setStages] = useState<GearStage[]>([
    { id: "m1", driverTeeth: 12, drivenTeeth: 24 },
  ]);

  const result = useMemo(() => solveGearTrain(stages, inputRpm, inputTorque), [stages, inputRpm, inputTorque]);

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-4 space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
          <Cog className="w-4 h-4 text-amber-500" /> Gear train
        </h2>
        <div className="flex flex-wrap gap-3 mb-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            Input:
            <input type="number" value={inputRpm} min={0} onChange={(e) => setInputRpm(Math.max(0, parseFloat(e.target.value) || 0))} className="w-20 text-xs bg-white border border-gray-200 rounded px-1.5 py-1" /> rpm
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            Torque:
            <input type="number" value={inputTorque} min={0} step={0.5} onChange={(e) => setInputTorque(Math.max(0, parseFloat(e.target.value) || 0))} className="w-16 text-xs bg-white border border-gray-200 rounded px-1.5 py-1" /> Nm
          </label>
        </div>
        <div className="space-y-1.5">
          {stages.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
              <span className="text-[10px] font-bold text-gray-400 w-8">#{i + 1}</span>
              <label className="text-gray-500">driver:
                <input type="number" value={s.driverTeeth} min={6} onChange={(e) => setStages((p) => p.map((x) => x.id === s.id ? { ...x, driverTeeth: Math.max(6, parseInt(e.target.value) || 6) } : x))} className="w-14 ml-1 text-xs bg-white border border-gray-200 rounded px-1.5 py-1" />
              </label>
              <span className="text-gray-400">→</span>
              <label className="text-gray-500">driven:
                <input type="number" value={s.drivenTeeth} min={6} onChange={(e) => setStages((p) => p.map((x) => x.id === s.id ? { ...x, drivenTeeth: Math.max(6, parseInt(e.target.value) || 6) } : x))} className="w-14 ml-1 text-xs bg-white border border-gray-200 rounded px-1.5 py-1" />
              </label>
              <button onClick={() => setStages((p) => p.filter((x) => x.id !== s.id))} className="ml-auto text-rose-500 hover:text-rose-700" aria-label="Remove mesh">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-3">
          <button
            onClick={() => setStages((p) => [...p, { id: `m${Date.now()}`, driverTeeth: 12, drivenTeeth: 24 }])}
            className="text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-full px-2.5 py-1 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add mesh
          </button>
          <button onClick={() => setStages([])} className="text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-1 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Results</h2>
        {!result.ok ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">{result.error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <Stat label="Ratio" value={`${result.overallRatio.toFixed(2)} : 1`} />
              <Stat label="Output speed" value={`${result.rpmOut.toFixed(0)} rpm`} accent="text-sky-600" />
              <Stat label="Torque gain" value={`${result.torqueMultiplier.toFixed(2)}×`} accent="text-violet-600" />
              <Stat label="Direction" value={result.direction === "reversed" ? "reversed" : "same"} accent={result.direction === "reversed" ? "text-rose-600" : "text-emerald-600"} />
            </div>
            <table className="text-[11px] border-collapse w-full">
              <thead>
                <tr className="text-[9px] uppercase text-gray-400">
                  <th className="text-left py-1 pr-2">Mesh</th>
                  <th className="text-right py-1 pr-2">Ratio</th>
                  <th className="text-right py-1 pr-2">rpm out</th>
                  <th className="text-right py-1">torque</th>
                </tr>
              </thead>
              <tbody>
                {result.stages.map((s, i) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2 font-semibold text-gray-700">#{i + 1}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-600">{s.ratio.toFixed(3)}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-600">{s.rpmOut.toFixed(0)}</td>
                    <td className="py-1.5 text-right text-gray-600">{s.torqueMultiplier.toFixed(2)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 mt-2 flex gap-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              Each mesh reverses rotation. Insert an idler gear (two extra meshes) to keep the output direction while keeping the ratio — verify by making both gears the same size.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent = "text-gray-900" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-2.5 text-center">
      <p className="text-[9px] font-bold text-gray-400 uppercase">{label}</p>
      <p className={`text-sm font-bold ${accent}`}>{value}</p>
    </div>
  );
}

// =====================================================================
// Network panel
// =====================================================================

const EXAMPLE_NETWORK: NetworkPlan = {
  devices: [
    { id: "r1", type: "router", name: "Router", ip: "192.168.1.1" },
    { id: "sw1", type: "switch", name: "Switch" },
    { id: "ap1", type: "access-point", name: "Wi-Fi AP" },
    { id: "pc1", type: "pc", name: "PC 1", ip: "192.168.1.10" },
    { id: "pc2", type: "pc", name: "PC 2", ip: "192.168.1.11" },
    { id: "pr1", type: "printer", name: "Printer", ip: "192.168.1.20" },
  ],
  links: [
    { from: "r1", to: "sw1", kind: "ethernet", speedMbps: 1000 },
    { from: "sw1", to: "ap1", kind: "ethernet", speedMbps: 100 },
    { from: "sw1", to: "pc1", kind: "ethernet", speedMbps: 100 },
    { from: "sw1", to: "pc2", kind: "ethernet", speedMbps: 100 },
    { from: "ap1", to: "pc1", kind: "wifi" },
    { from: "sw1", to: "pr1", kind: "ethernet", speedMbps: 100 },
  ],
};

function NetworkPanel() {
  const [plan, setPlan] = useState<NetworkPlan>(EXAMPLE_NETWORK);
  const [cidr, setCidr] = useState("192.168.1.0/26");
  const verdict = useMemo(() => validateNetwork(plan), [plan]);
  const subnet = useMemo(() => calculateSubnet(cidr), [cidr]);

  const addDevice = () => {
    const id = `d${Date.now()}`;
    setPlan((p) => ({ ...p, devices: [...p.devices, { id, type: "pc", name: `PC ${p.devices.length + 1}` }] }));
  };

  const linkDevice = (id: string) => {
    setPlan((p) => {
      const hub = p.devices.find((d) => d.type === "switch") ?? p.devices.find((d) => d.type === "router") ?? p.devices[0];
      if (!hub || hub.id === id) return p;
      return { ...p, links: [...p.links, { from: hub.id, to: id, kind: "ethernet", speedMbps: 100 }] };
    });
  };

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-4 space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Network className="w-4 h-4 text-amber-500" /> Small office LAN
          </h2>
          <button onClick={() => setPlan(EXAMPLE_NETWORK)} className="text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-1 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Example
          </button>
        </div>
        <div className="space-y-1.5">
          {plan.devices.map((d) => (
            <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.type === "router" ? "bg-rose-500" : d.type === "switch" ? "bg-sky-500" : d.type === "access-point" ? "bg-violet-500" : "bg-emerald-500"}`} />
              <span className="font-semibold text-gray-800 flex-1 truncate">{d.name}</span>
              <span className="text-[10px] text-gray-400 uppercase">{d.type}</span>
              {d.ip && <span className="font-mono text-[10px] text-gray-500">{d.ip}</span>}
              <button onClick={() => linkDevice(d.id)} className="text-[10px] font-bold text-sky-600 hover:text-sky-800" title="Link to switch/router">+ link</button>
              <button
                onClick={() => setPlan((p) => ({ ...p, devices: p.devices.filter((x) => x.id !== d.id), links: p.links.filter((l) => l.from !== d.id && l.to !== d.id) }))}
                className="text-rose-400 hover:text-rose-600"
                aria-label="Remove device"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addDevice} className="mt-3 text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-full px-2.5 py-1 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add device
        </button>

        {/* Validation */}
        <div className="mt-3 space-y-1.5">
          {verdict.issues.length === 0 ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Design checks out — every host reaches the router.
            </p>
          ) : (
            verdict.issues.map((i, k) => (
              <p key={k} className={`text-[11px] rounded-xl p-2.5 border flex gap-1.5 ${i.severity === "error" ? "text-rose-700 bg-rose-50 border-rose-200" : "text-amber-800 bg-amber-50 border-amber-200"}`}>
                <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${i.severity === "error" ? "text-rose-500" : "text-amber-500"}`} />
                {i.message}
              </p>
            ))
          )}
        </div>
      </section>

      {/* Subnet calculator */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-3">IPv4 subnet calculator</h2>
        <label className="flex items-center gap-2 text-xs text-gray-600 mb-3">
          CIDR:
          <input
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            className="font-mono w-40 text-xs bg-white border border-gray-200 rounded px-2 py-1.5"
          />
        </label>
        {subnet ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="Network" value={subnet.networkAddress} />
            <Stat label="Broadcast" value={subnet.broadcastAddress} />
            <Stat label="Usable hosts" value={String(subnet.usableHosts)} accent="text-sky-600" />
            <Stat label="First usable" value={subnet.firstUsable} />
            <Stat label="Last usable" value={subnet.lastUsable} />
            <Stat label="Wildcard" value={subnet.wildcardMask} />
          </div>
        ) : (
          <p className="text-xs text-rose-600">Invalid CIDR — use the form a.b.c.d/prefix (e.g. 192.168.1.0/26).</p>
        )}
      </section>
    </div>
  );
}

// =====================================================================
// PLC panel
// =====================================================================

const PLC_PROGRAMS: { id: string; name: string; program: LadderProgram; inputs: string[]; outputs: string[]; blurb: string }[] = [
  {
    id: "start-stop",
    name: "Start / Stop seal-in (motor latch)",
    program: START_STOP_LATCH,
    inputs: ["stop", "start"],
    outputs: ["motor"],
    blurb: "Press START and release — the motor stays on through its own seal-in contact. STOP (NC) breaks the latch.",
  },
  {
    id: "guard",
    name: "Guard interlock (AND)",
    program: GUARD_INTERLOCK,
    inputs: ["guard_closed", "auto_mode"],
    outputs: ["conveyor"],
    blurb: "The conveyor only runs when the guard is closed AND the selector is in AUTO — a safety AND condition.",
  },
];

function PlcPanel() {
  const [presetId, setPresetId] = useState("start-stop");
  const preset = PLC_PROGRAMS.find((p) => p.id === presetId)!;
  const [inputState, setInputState] = useState<Record<string, boolean>>({ stop: false, start: false });
  const [outputState, setOutputState] = useState<Record<string, boolean>>({});
  const [trace, setTrace] = useState<ReturnType<typeof scan>["trace"] | null>(null);
  const [scanCount, setScanCount] = useState(0);

  const resetPreset = (id: string) => {
    const p = PLC_PROGRAMS.find((x) => x.id === id)!;
    setPresetId(id);
    setInputState(Object.fromEntries(p.inputs.map((i) => [i, false])));
    setOutputState({});
    setTrace(null);
    setScanCount(0);
  };

  useEffect(() => {
    resetPreset("start-stop");
  }, []);

  const doScan = () => {
    const state: LadderState = {
      inputs: Object.fromEntries(preset.inputs.map((i) => [i, inputState[i] ?? false])),
      outputs: { ...outputState },
    };
    const r = scan(preset.program, state);
    setOutputState(r.state.outputs);
    setTrace(r.trace);
    setScanCount((c) => c + 1);
  };

  const toggleInput = (name: string) => {
    setInputState((p) => ({ ...p, [name]: !p[name] }));
  };

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-4 space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
          <ListTree className="w-4 h-4 text-amber-500" /> Ladder program
        </h2>
        <select
          value={presetId}
          onChange={(e) => resetPreset(e.target.value)}
          className="text-xs bg-white border border-gray-200 rounded px-2 py-1.5 mb-2"
        >
          {PLC_PROGRAMS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500">{preset.blurb}</p>

        {/* Rung rendering */}
        <div className="mt-3 space-y-2">
          {preset.program.rungs.map((rung) => (
            <div key={rung.id} className="rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Rung — coil: {rung.coil}</p>
              <div className="flex flex-wrap gap-1.5">
                {rung.branches.map((branch, bi) => (
                  <span key={bi} className="inline-flex items-center gap-1 font-mono text-[11px]">
                    {bi > 0 && <span className="text-amber-600 font-bold">+OR</span>}
                    {branch.map((c, ci) => (
                      <span key={ci} className="inline-flex items-center gap-1">
                        {ci > 0 && <span className="text-gray-400">·AND</span>}
                        <span className={`px-1.5 py-0.5 rounded border ${c.kind === "no" ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700"}`}>
                          {c.kind === "no" ? "XIC" : "XIO"} {c.ref}
                        </span>
                      </span>
                    ))}
                  </span>
                ))}
                <span className="text-gray-400">→ ( </span>
                <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-mono text-[11px]">OTE {rung.coil}</span>
                <span className="text-gray-400">)</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Console */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Inputs &amp; outputs</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {preset.inputs.map((i) => (
            <button
              key={i}
              onClick={() => toggleInput(i)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition border ${
                inputState[i]
                  ? "bg-sky-500 border-sky-500 text-white"
                  : "bg-gray-100 border-gray-200 text-gray-500"
              }`}
            >
              {i}: {inputState[i] ? "ON" : "off"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={doScan}
            className="h-9 px-4 rounded-full bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> Scan once
          </button>
          <button
            onClick={() => resetPreset(presetId)}
            className="h-9 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          {scanCount > 0 && <span className="text-[10px] text-gray-400">{scanCount} scan(s) executed</span>}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {preset.outputs.map((o) => (
            <span
              key={o}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                outputState[o]
                  ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                  : "bg-gray-100 border-gray-200 text-gray-400"
              }`}
            >
              {o}: {outputState[o] ? "ON" : "off"}
            </span>
          ))}
        </div>

        {trace && (
          <div className="rounded-xl bg-gray-950 p-3 font-mono text-[10px] text-gray-300 space-y-1">
            {trace.map((t) => (
              <p key={t.rungId}>
                rung {t.rungId}: branches [{t.branchResults.map((b) => (b ? "T" : "F")).join(", ")}] → {t.coil} = <b className={t.coilOn ? "text-emerald-400" : "text-gray-500"}>{t.coilOn ? "ON" : "off"}</b>
              </p>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-2 flex gap-1">
          <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
          Each press of “Scan once” is one PLC scan cycle: inputs read → rungs evaluated top-to-bottom → outputs updated. Try: press START, scan, release START, scan again — the motor latches.
        </p>
      </section>
    </div>
  );
}

// =====================================================================
// Checklists panel
// =====================================================================

function ChecklistsPanel() {
  const [tradeId, setTradeId] = useState<Trade["id"]>("electrical");
  const [checked, setChecked] = useState<Record<string, Set<string>>>({});
  const [downloading, setDownloading] = useState(false);

  const trade = TRADES.find((t) => t.id === tradeId)!;
  const done = checked[tradeId] ?? new Set<string>();

  const totalItems = trade.competencies.reduce((s, c) => s + c.checklist.length, 0);
  const doneItems = trade.competencies.reduce((s, c) => s + c.checklist.filter((_, i) => done.has(`${c.code}-${i}`)).length, 0);

  const toggle = (code: string, i: number) => {
    const key = `${code}-${i}`;
    setChecked((prev) => {
      const set = new Set(prev[tradeId] ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, [tradeId]: set };
    });
  };

  const downloadSheet = () => {
    setDownloading(true);
    try {
      downloadText(
        `${tradeId}-assessment-sheet.md`,
        generateAssessmentSheet(trade, "", new Date().toISOString().slice(0, 10)),
        "text/markdown"
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-4 space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4 text-amber-500" /> CDACC skill checklists
          </h2>
          <select
            value={tradeId}
            onChange={(e) => setTradeId(e.target.value as Trade["id"])}
            className="text-xs bg-white border border-gray-200 rounded px-2 py-1.5"
          >
            {TRADES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${totalItems ? (doneItems / totalItems) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-gray-500">{doneItems}/{totalItems}</span>
          <button
            onClick={downloadSheet}
            disabled={downloading}
            className="text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-full px-2.5 py-1 flex items-center gap-1 disabled:opacity-50"
            title="Download a printable practical-assessment sheet (markdown)"
          >
            <Download className="w-3 h-3" /> Assessment sheet
          </button>
        </div>

        <div className="space-y-3">
          {trade.competencies.map((c) => (
            <div key={c.code} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-2">
                <p className="text-xs font-bold text-gray-900">
                  <span className="text-amber-700 font-mono mr-1.5">{c.code}</span>
                  {c.statement}
                </p>
              </div>
              <div className="p-3 space-y-1.5">
                {c.checklist.map((item, i) => {
                  const key = `${c.code}-${i}`;
                  const isDone = done.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggle(c.code, i)}
                      className="w-full flex items-start gap-2 text-left text-[11px] text-gray-700 hover:bg-gray-50 rounded-lg px-1.5 py-1 transition"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-px" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-300 flex-shrink-0 mt-px" />
                      )}
                      <span className={isDone ? "line-through text-gray-400" : ""}>{item}</span>
                    </button>
                  );
                })}
              </div>
              {c.safety.length > 0 && (
                <div className="px-3 py-2 bg-rose-50/60 border-t border-rose-100">
                  <p className="text-[10px] font-bold text-rose-700 uppercase mb-1">Safety gate</p>
                  {c.safety.map((s, i) => (
                    <p key={i} className="text-[11px] text-rose-600 flex gap-1.5">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {s}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-3 flex gap-1">
          <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
          Study aid distilled for revision and lab practice — always confirm against the current official CDACC curriculum documents for your level.
        </p>
      </section>
    </div>
  );
}


