"use client";

import { useState } from "react";
import { X, Pencil, Bot, ListChecks, Loader2, AlertCircle, Activity } from "lucide-react";
import { useApp } from "../store";
import { api, type GraphResult } from "../api";

export function GraphExplorer() {
  const { setScreen } = useApp();
  const [equation, setEquation] = useState("y = 2x + 3");
  const [result, setResult] = useState<GraphResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draw = async () => {
    if (!equation.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.generateGraph(equation);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? "Graph generation failed");
    } finally {
      setLoading(false);
    }
  };

  // graph bounds: x in [-5, 5], y derived from sample points
  const points = result?.samplePoints ?? [];
  const yMin = points.length ? Math.min(...points.map((p) => p.y)) : -10;
  const yMax = points.length ? Math.max(...points.map((p) => p.y)) : 10;
  const yPad = (yMax - yMin) * 0.1 || 1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;
  const xLo = -5;
  const xHi = 5;

  // convert (x, y) → SVG coords
  const toX = (x: number) => ((x - xLo) / (xHi - xLo)) * 100;
  const toY = (y: number) => 100 - ((y - yLo) / (yHi - yLo)) * 100;

  const pathD = points.length
    ? points
        .map((p, i) => {
          const sx = toX(p.x);
          const sy = toY(p.y);
          return `${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`;
        })
        .join(" ")
    : "";

  return (
    <div className="min-h-screen bg-gray-50 max-w-5xl mx-auto flex flex-col">
      {/* top bar */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => setScreen("home")}
          aria-label="Exit"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">Graph Explorer</h1>
        <span className="w-9" />
      </header>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* equation input */}
        <div className="max-w-2xl">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Equation</label>
          <div className="mt-1.5 flex gap-2">
            <input
              value={equation}
              onChange={(e) => setEquation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && draw()}
              placeholder="e.g. y = 2x + 3"
              className="flex-1 p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={draw}
              disabled={loading}
              className="px-4 rounded-2xl bg-indigo-600 text-white text-sm font-semibold flex items-center gap-1.5 shadow-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Draw
            </button>
          </div>
        </div>

        {error && (
          <div className="max-w-2xl p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* graph area */}
        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-900">
              {result ? `f(x) = ${result.equation.replace(/^y\s*=\s*/i, "")}` : "Preview"}
            </p>
            {result && (
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full capitalize">
                {result.type}
              </span>
            )}
          </div>
          <div className="relative w-full h-56 md:h-72 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
            {/* grid */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #E5E7EB 1px, transparent 1px), linear-gradient(to bottom, #E5E7EB 1px, transparent 1px)",
                backgroundSize: "10% 10%",
              }}
            />
            {/* axes */}
            {toY(0) >= 0 && toY(0) <= 100 && (
              <div className="absolute left-0 right-0 bg-gray-400" style={{ top: `${toY(0)}%`, height: "1px" }} />
            )}
            {toX(0) >= 0 && toX(0) <= 100 && (
              <div className="absolute top-0 bottom-0 bg-gray-400" style={{ left: `${toX(0)}%`, width: "1px" }} />
            )}
            {/* line via SVG (viewBox 0..100) */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {pathD && (
                <path d={pathD} fill="none" stroke="#4F46E5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              )}
              {points.length > 0 && (
                <circle cx={toX(0)} cy={toY(result?.yIntercept ?? 0)} r="0.6" fill="#4F46E5" vectorEffect="non-scaling-stroke" />
              )}
            </svg>
            {/* axis labels */}
            <span className="absolute top-1 right-1 text-[10px] text-gray-400 font-medium">x</span>
            <span className="absolute top-1 left-1 text-[10px] text-gray-400 font-medium">y</span>
          </div>
        </div>

        {/* AI explanation */}
        {result && (
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">AI Explanation</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{result.explanation}</p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {result.slope !== null && (
                <div className="p-2 rounded-lg bg-gray-50">
                  <p className="text-gray-500">Slope</p>
                  <p className="font-semibold text-gray-900">{result.slope}</p>
                </div>
              )}
              {result.yIntercept !== null && (
                <div className="p-2 rounded-lg bg-gray-50">
                  <p className="text-gray-500">Y-intercept</p>
                  <p className="font-semibold text-gray-900">{result.yIntercept}</p>
                </div>
              )}
              {result.vertex && (
                <div className="p-2 rounded-lg bg-gray-50">
                  <p className="text-gray-500">Vertex</p>
                  <p className="font-semibold text-gray-900">
                    ({result.vertex.x}, {result.vertex.y})
                  </p>
                </div>
              )}
              <div className="p-2 rounded-lg bg-gray-50">
                <p className="text-gray-500">Sample points</p>
                <p className="font-semibold text-gray-900 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> {result.samplePoints.length}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* actions */}
        <div className="grid grid-cols-2 gap-3 max-w-2xl">
          <button
            onClick={() => setScreen("search")}
            className="h-11 rounded-2xl bg-white border border-gray-200 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 shadow-sm hover:border-indigo-300"
          >
            <Bot className="w-4 h-4 text-indigo-600" /> Ask about this graph
          </button>
          <button
            onClick={() => setScreen("quiz")}
            className="h-11 rounded-2xl bg-white border border-gray-200 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 shadow-sm hover:border-indigo-300"
          >
            <ListChecks className="w-4 h-4 text-emerald-600" /> Generate quiz
          </button>
        </div>
      </div>
    </div>
  );
}
