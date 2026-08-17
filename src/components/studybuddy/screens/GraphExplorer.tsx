"use client";

import { useState } from "react";
import {
  X,
  Pencil,
  Bot,
  ListChecks,
  Loader2,
  AlertCircle,
  Activity,
  Save,
  Check,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useApp } from "../store";
import { api, type GraphResult } from "../api";

export function GraphExplorer() {
  const { setScreen } = useApp();
  const [equation, setEquation] = useState("y = 2x + 3");
  const [result, setResult] = useState<GraphResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

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

  const saveAsStudySet = async () => {
    if (!result) return;
    try {
      await api.saveGraphAsStudySet({
        equation: result.equation,
        explanation: result.explanation,
        subject: "Mathematics",
        topic: "Graphs",
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    }
  };

  const generateQuizFromGraph = () => {
    // Drop the user on the Create modal in "quiz" mode, prefilled with the equation as the topic
    // For simplicity, just route to Create modal where they can choose Generate Quiz
    setScreen("home");
    setTimeout(() => useApp.getState().openCreate("quiz"), 100);
  };

  // chart data
  const chartData = (result?.samplePoints ?? []).map((p) => ({ x: p.x, y: p.y }));
  const yValues = chartData.map((p) => p.y);
  const yMin = yValues.length ? Math.min(...yValues) : -10;
  const yMax = yValues.length ? Math.max(...yValues) : 10;
  const yPad = Math.max(1, (yMax - yMin) * 0.1);

  return (
    <div className="min-h-screen bg-gray-50 max-w-5xl mx-auto flex flex-col">
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
              placeholder="e.g. y = 2x + 3 or y = x^2 - 4"
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
          <p className="mt-1 text-[11px] text-gray-400">
            Try: <code className="bg-gray-100 px-1 rounded">y = 2x + 3</code>, <code className="bg-gray-100 px-1 rounded">y = x^2 - 4</code>, <code className="bg-gray-100 px-1 rounded">y = sin(x)</code>
          </p>
        </div>

        {error && (
          <div className="max-w-2xl p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* graph */}
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

          <div className="h-72 md:h-80 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={[-10, 10]}
                    ticks={[-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]}
                    stroke="#9CA3AF"
                    fontSize={11}
                    label={{ value: "x", position: "insideBottom", offset: -10, fill: "#6B7280" }}
                  />
                  <YAxis
                    domain={[yMin - yPad, yMax + yPad]}
                    stroke="#9CA3AF"
                    fontSize={11}
                    label={{ value: "y", angle: -90, position: "insideLeft", fill: "#6B7280" }}
                  />
                  <Tooltip
                    formatter={(value: any) => [Number(value).toFixed(2), "y"]}
                    labelFormatter={(label: any) => `x = ${Number(label).toFixed(2)}`}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }}
                  />
                  <ReferenceLine x={0} stroke="#9CA3AF" strokeDasharray="2 2" />
                  <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="2 2" />
                  <Line
                    type="monotone"
                    dataKey="y"
                    stroke="#4F46E5"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                Type an equation and tap Draw to see the graph
              </div>
            )}
          </div>
        </div>

        {/* AI explanation + properties */}
        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  AI Explanation
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{result.explanation}</p>
            </div>

            <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-2 text-xs">
              <p className="font-semibold text-gray-500 uppercase tracking-wide">Properties</p>
              {result.slope !== null && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-500">Slope</span>
                  <span className="font-semibold text-gray-900">{result.slope}</span>
                </div>
              )}
              {result.yIntercept !== null && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-500">Y-intercept</span>
                  <span className="font-semibold text-gray-900">{result.yIntercept}</span>
                </div>
              )}
              {result.vertex && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-500">Vertex</span>
                  <span className="font-semibold text-gray-900">
                    ({result.vertex.x}, {result.vertex.y})
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span className="text-gray-500">Sample points</span>
                <span className="font-semibold text-gray-900 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> {result.samplePoints.length}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          <button
            onClick={saveAsStudySet}
            disabled={!result}
            className="h-11 rounded-2xl bg-white border border-gray-200 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 shadow-sm hover:border-indigo-300 disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-indigo-600" /> Save as study set
          </button>
          <button
            onClick={() => setScreen("tutor")}
            disabled={!result}
            className="h-11 rounded-2xl bg-white border border-gray-200 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 shadow-sm hover:border-indigo-300 disabled:opacity-50"
          >
            <Bot className="w-4 h-4 text-rose-600" /> Ask about graph
          </button>
          <button
            onClick={generateQuizFromGraph}
            disabled={!result}
            className="h-11 rounded-2xl bg-white border border-gray-200 text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 shadow-sm hover:border-indigo-300 disabled:opacity-50"
          >
            <ListChecks className="w-4 h-4 text-emerald-600" /> Generate quiz
          </button>
        </div>
      </div>

      {/* saved toast */}
      {savedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-1.5 animate-in slide-in-from-bottom-4">
          <Check className="w-4 h-4" /> Saved to your study sets
        </div>
      )}
    </div>
  );
}
