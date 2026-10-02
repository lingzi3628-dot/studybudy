"use client";

/**
 * GraphLab — Phase G4 (Interactive Graph Workspace)
 *
 * Turns the graph from a passive viewer into an interactive learning activity.
 * Three tabs:
 *   1. Explore — view the graph, select bars, read values, text summary
 *   2. Edit Data — change category names + values, see graph update live
 *   3. Questions — deterministic math questions about the graph data
 *
 * Only supports bar graphs in this phase. Other graph types fall through
 * to the regular GraphRenderer (view-only).
 *
 * The activity objective comes from the spec's title + an instruction
 * derived from the graph data (e.g. "Compare the values shown in this bar graph").
 *
 * State is LOCAL to this component (not global Zustand) — editing graph data
 * doesn't mutate the saved conversation until the learner clicks "Save".
 */

import { useState, useMemo, useCallback } from "react";
import {
  Eye, Table2, HelpCircle, CheckCircle2, XCircle,
  RotateCcw, Plus, Trash2, Download, Bot, Target,
} from "lucide-react";
import { GraphRenderer, type GraphSpec } from "../GraphRenderers";

// ============================================================
// Types
// ============================================================

type GraphLabProps = {
  spec: GraphSpec;
  onAskTutor?: (context: string) => void;
  onSave?: (spec: GraphSpec) => void;
  onDownload?: () => void;
};

type Tab = "explore" | "edit" | "questions";

// ============================================================
// Component
// ============================================================

export function GraphLab({ spec: initialSpec, onAskTutor, onSave, onDownload }: GraphLabProps) {
  const [tab, setTab] = useState<Tab>("explore");
  const [editedSpec, setEditedSpec] = useState<GraphSpec>(initialSpec);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // Only bar graphs get the full interactive lab. Other types get view-only.
  const isBarGraph = initialSpec.type === "bar";
  const categories: string[] = Array.isArray(editedSpec.categories) ? editedSpec.categories : [];
  const values: number[] = Array.isArray(editedSpec.values) ? editedSpec.values : [];

  // ---- Edit Data handlers ----
  const updateCategory = useCallback((idx: number, value: string) => {
    setEditedSpec((prev) => {
      const cats = [...(prev.categories ?? [])];
      cats[idx] = value;
      return { ...prev, categories: cats };
    });
    setDirty(true);
  }, []);

  const updateValue = useCallback((idx: number, value: string) => {
    setEditedSpec((prev) => {
      const vals = [...(prev.values ?? [])];
      vals[idx] = parseFloat(value) || 0;
      return { ...prev, values: vals };
    });
    setDirty(true);
  }, []);

  const addRow = useCallback(() => {
    setEditedSpec((prev) => ({
      ...prev,
      categories: [...(prev.categories ?? []), `Item ${(prev.categories ?? []).length + 1}`],
      values: [...(prev.values ?? []), 0],
    }));
    setDirty(true);
  }, []);

  const removeRow = useCallback((idx: number) => {
    setEditedSpec((prev) => ({
      ...prev,
      categories: (prev.categories ?? []).filter((_, i) => i !== idx),
      values: (prev.values ?? []).filter((_, i) => i !== idx),
    }));
    setDirty(true);
  }, []);

  const reset = useCallback(() => {
    setEditedSpec(initialSpec);
    setDirty(false);
    setSelectedBar(null);
  }, [initialSpec]);

  // ---- Questions logic (deterministic, local — no AI) ----
  const highestIdx = values.length > 0 ? values.indexOf(Math.max(...values)) : -1;
  const lowestIdx = values.length > 0 ? values.indexOf(Math.min(...values)) : -1;
  const total = values.reduce((a, b) => a + b, 0);

  const [q1Answer, setQ1Answer] = useState("");
  const [q1Result, setQ1Result] = useState<"correct" | "wrong" | null>(null);
  const [q2Answer, setQ2Answer] = useState("");
  const [q2Result, setQ2Result] = useState<"correct" | "wrong" | null>(null);
  const [q3Answer, setQ3Answer] = useState("");
  const [q3Result, setQ3Result] = useState<"correct" | "wrong" | null>(null);

  const checkQ1 = () => {
    // "Who has the highest value?" — match category name
    const correct = categories[highestIdx]?.toLowerCase().trim();
    const ans = q1Answer.toLowerCase().trim();
    setQ1Result(ans === correct ? "correct" : "wrong");
  };
  const checkQ2 = () => {
    // "What is the total?" — match number
    const ans = parseFloat(q3Answer);
    setQ3Result(Math.abs(ans - total) < 0.01 ? "correct" : "wrong");
  };
  const checkQ3 = () => {
    // "How many more does X have than Y?" — difference between highest and lowest
    if (highestIdx < 0 || lowestIdx < 0) return;
    const diff = values[highestIdx] - values[lowestIdx];
    const ans = parseFloat(q3Answer);
    setQ3Result(Math.abs(ans - diff) < 0.01 ? "correct" : "wrong");
  };

  // ---- Ask Tutor (bounded context) ----
  const askTutor = useCallback((action: string, question?: string) => {
    const context = {
      artifactType: "graph",
      graphType: editedSpec.type,
      title: editedSpec.title,
      currentData: {
        categories: editedSpec.categories,
        values: editedSpec.values,
      },
      selectedElement: selectedBar !== null ? {
        category: categories[selectedBar],
        value: values[selectedBar],
      } : null,
      learnerAction: action,
      learnerQuestion: question || "",
    };
    const ctxStr = `[Looking at graph "${editedSpec.title}" in my workspace. Data: ${JSON.stringify({ categories: editedSpec.categories, values: editedSpec.values })}${selectedBar !== null ? `. Selected: ${categories[selectedBar]} = ${values[selectedBar]}` : ""}]\n\n`;
    onAskTutor?.(ctxStr + (question || `Please ${action}.`));
  }, [editedSpec, selectedBar, categories, values, onAskTutor]);

  // ---- Activity objective ----
  const objective = useMemo(() => {
    if (!isBarGraph || categories.length === 0) return null;
    return `Compare the ${categories.length} values shown in this bar graph. Identify the highest, lowest, and total.`;
  }, [isBarGraph, categories.length]);

  // ============================================================
  // Render
  // ============================================================

  if (!isBarGraph) {
    // Non-bar graphs: view-only (no interactive lab yet)
    return (
      <div className="p-4">
        <GraphRenderer spec={initialSpec} />
        {onDownload && (
          <button
            onClick={onDownload}
            className="mt-3 flex items-center gap-1 text-xs text-indigo-600 font-semibold"
          >
            <Download className="w-3 h-3" /> Download
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Activity objective */}
      {objective && (
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
          <div className="flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase text-indigo-600">Activity</p>
              <p className="text-xs text-gray-700 leading-snug">{objective}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0" role="tablist">
        <button
          onClick={() => setTab("explore")}
          role="tab"
          aria-selected={tab === "explore"}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "explore" ? "text-indigo-600 border-b-2 border-indigo-600 bg-white" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Eye className="w-3 h-3" /> Explore
        </button>
        <button
          onClick={() => setTab("edit")}
          role="tab"
          aria-selected={tab === "edit"}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "edit" ? "text-indigo-600 border-b-2 border-indigo-600 bg-white" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Table2 className="w-3 h-3" /> Edit Data
        </button>
        <button
          onClick={() => setTab("questions")}
          role="tab"
          aria-selected={tab === "questions"}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "questions" ? "text-indigo-600 border-b-2 border-indigo-600 bg-white" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <HelpCircle className="w-3 h-3" /> Questions
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4 min-h-0" role="tabpanel">

        {/* ---- Explore tab ---- */}
        {tab === "explore" && (
          <div className="space-y-3">
            {/* The graph itself */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <GraphRenderer spec={editedSpec} />
            </div>

            {/* Selected bar info */}
            {selectedBar !== null && categories[selectedBar] && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
                <p className="text-[10px] font-bold uppercase text-indigo-600">Selected</p>
                <p className="text-sm font-bold text-gray-900">{categories[selectedBar]}: {values[selectedBar]}</p>
              </div>
            )}

            {/* Bar selection buttons */}
            <div>
              <p className="text-[10px] font-semibold uppercase text-gray-500 mb-1.5">Tap a bar to select it</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedBar(selectedBar === i ? null : i)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition ${
                      selectedBar === i
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {cat}: {values[i]}
                  </button>
                ))}
              </div>
            </div>

            {/* Text summary (accessibility) */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">Summary</p>
              <p className="text-xs text-gray-700 leading-relaxed">
                This bar graph titled "{editedSpec.title || "Untitled"}" shows {categories.length} categories.
                {highestIdx >= 0 && ` The highest value is ${categories[highestIdx]} at ${values[highestIdx]}.`}
                {lowestIdx >= 0 && ` The lowest is ${categories[lowestIdx]} at ${values[lowestIdx]}.`}
                {` The total of all values is ${total}.`}
              </p>
            </div>

            {/* Ask Tutor contextual buttons */}
            {onAskTutor && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => askTutor("explain this graph")}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 transition"
                >
                  <Bot className="w-3 h-3" /> Explain graph
                </button>
                <button
                  onClick={() => askTutor("ask me a question about this graph data")}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 transition"
                >
                  <Bot className="w-3 h-3" /> Ask me a question
                </button>
                {selectedBar !== null && (
                  <button
                    onClick={() => askTutor("explain the selected value", `Why does ${categories[selectedBar]} have a value of ${values[selectedBar]}?`)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 transition"
                  >
                    <Bot className="w-3 h-3" /> Explain selected
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- Edit Data tab ---- */}
        {tab === "edit" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Category</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Value</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={cat}
                          onChange={(e) => updateCategory(i, e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-200 text-xs outline-none focus:border-indigo-400 bg-white"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={values[i]}
                          onChange={(e) => updateValue(i, e.target.value)}
                          className="w-20 px-2 py-1 rounded border border-gray-200 text-xs text-right outline-none focus:border-indigo-400 bg-white"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => removeRow(i)}
                          className="text-gray-400 hover:text-rose-500"
                          title="Remove row"
                          aria-label={`Remove ${cat}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={addRow}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-semibold hover:bg-gray-200 transition"
              >
                <Plus className="w-3 h-3" /> Add row
              </button>
              {dirty && (
                <button
                  onClick={reset}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold hover:bg-amber-100 transition"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to original
                </button>
              )}
              {dirty && onSave && (
                <button
                  onClick={() => { onSave(editedSpec); setDirty(false); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700 transition ml-auto"
                >
                  <CheckCircle2 className="w-3 h-3" /> Apply changes
                </button>
              )}
            </div>

            {/* Live preview */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold uppercase text-gray-500 mb-2">Live preview</p>
              <GraphRenderer spec={editedSpec} />
            </div>
          </div>
        )}

        {/* ---- Questions tab ---- */}
        {tab === "questions" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Answer these questions about the graph data. Checked by your device — no AI needed.</p>

            {/* Q1: Who has the highest value? */}
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-900 mb-2">
                1. Which category has the highest value?
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={q1Answer}
                  onChange={(e) => { setQ1Answer(e.target.value); setQ1Result(null); }}
                  placeholder="Type the category name..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-indigo-400"
                />
                <button
                  onClick={checkQ1}
                  disabled={!q1Answer.trim()}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700 disabled:opacity-40"
                >
                  Check
                </button>
              </div>
              {q1Result && (
                <div className={`mt-2 flex items-center gap-1.5 text-xs ${q1Result === "correct" ? "text-emerald-600" : "text-rose-500"}`}>
                  {q1Result === "correct"
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Correct! {categories[highestIdx]} has the highest value of {values[highestIdx]}.</>
                    : <><XCircle className="w-3.5 h-3.5" /> Not quite. Look for the tallest bar. The correct answer is {categories[highestIdx]}.</>
                  }
                </div>
              )}
            </div>

            {/* Q2: What is the total? */}
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-900 mb-2">
                2. What is the total of all values?
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={q3Answer}
                  onChange={(e) => { setQ3Answer(e.target.value); setQ3Result(null); }}
                  placeholder="Type a number..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-indigo-400"
                />
                <button
                  onClick={checkQ2}
                  disabled={!q3Answer.trim()}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700 disabled:opacity-40"
                >
                  Check
                </button>
              </div>
              {q3Result && (
                <div className={`mt-2 flex items-center gap-1.5 text-xs ${q3Result === "correct" ? "text-emerald-600" : "text-rose-500"}`}>
                  {q3Result === "correct"
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Correct! The total is {total}.</>
                    : <><XCircle className="w-3.5 h-3.5" /> Not quite. Add all values: {values.join(" + ")} = {total}.</>
                  }
                </div>
              )}
            </div>

            {/* Q3: Difference between highest and lowest */}
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-900 mb-2">
                3. What is the difference between the highest and lowest values?
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={q2Answer}
                  onChange={(e) => { setQ2Answer(e.target.value); setQ2Result(null); }}
                  placeholder="Type a number..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-indigo-400"
                />
                <button
                  onClick={checkQ3}
                  disabled={!q2Answer.trim()}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700 disabled:opacity-40"
                >
                  Check
                </button>
              </div>
              {q2Result && highestIdx >= 0 && lowestIdx >= 0 && (
                <div className={`mt-2 flex items-center gap-1.5 text-xs ${q2Result === "correct" ? "text-emerald-600" : "text-rose-500"}`}>
                  {q2Result === "correct"
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Correct! {values[highestIdx]} - {values[lowestIdx]} = {values[highestIdx] - values[lowestIdx]}.</>
                    : <><XCircle className="w-3.5 h-3.5" /> Not quite. {values[highestIdx]} - {values[lowestIdx]} = {values[highestIdx] - values[lowestIdx]}.</>
                  }
                </div>
              )}
            </div>

            {/* Note: no mastery updates */}
            <p className="text-[9px] text-gray-400 text-center">
              These are practice questions. Your answers don't affect your progress score.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
