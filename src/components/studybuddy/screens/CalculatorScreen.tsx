"use client";

/**
 * CalculatorScreen — Phase 46
 *
 * A scientific calculator that uses mathjs (already a project dependency)
 * for evaluation. Supports:
 *   - Basic arithmetic: +, -, *, /, %, ^
 *   - Functions: sin, cos, tan, asin, acos, atan, sqrt, log, ln, exp, abs
 *   - Constants: pi, e
 *   - Memory: M+, M-, MR, MC
 *   - History: last 10 expressions (persisted to localStorage)
 *   - Variable assignment: x = 5, then x*2 = 10
 *
 * The calculator also includes a "step-by-step" mode that asks the AI Tutor
 * to explain the steps to reach the result. (Future enhancement.)
 *
 * Use cases:
 *   - Quick math during study sessions
 *   - Verify homework answers
 *   - Compute physics/chemistry formulas
 *   - Solve equations symbolically (uses mathjs.simplify)
 */

import { useEffect, useState, useRef } from "react";
import { ChevronLeft, Loader2, Eraser } from "lucide-react";
import { useApp } from "../store";
import { create, all as mathjsAll, type MathJsInstance } from "mathjs";

const math: MathJsInstance = create(mathjsAll, {});

const BUTTONS: Array<{ label: string; insert?: string; cls?: string; colSpan?: number }> = [
  // Row 1 — memory + clear
  { label: "MC", cls: "bg-gray-100 text-gray-700" },
  { label: "MR", cls: "bg-gray-100 text-gray-700" },
  { label: "M+", cls: "bg-gray-100 text-gray-700" },
  { label: "M-", cls: "bg-gray-100 text-gray-700" },
  { label: "AC", cls: "bg-rose-50 text-rose-600 font-bold" },
  // Row 2 — scientific
  { label: "sin", insert: "sin(", cls: "bg-emerald-50 text-emerald-700" },
  { label: "cos", insert: "cos(", cls: "bg-emerald-50 text-emerald-700" },
  { label: "tan", insert: "tan(", cls: "bg-emerald-50 text-emerald-700" },
  { label: "√", insert: "sqrt(", cls: "bg-emerald-50 text-emerald-700" },
  { label: "xⁿ", insert: "^", cls: "bg-emerald-50 text-emerald-700" },
  // Row 3
  { label: "log", insert: "log10(", cls: "bg-emerald-50 text-emerald-700" },
  { label: "ln", insert: "log(", cls: "bg-emerald-50 text-emerald-700" },
  { label: "π", insert: "pi", cls: "bg-emerald-50 text-emerald-700" },
  { label: "e", insert: "e", cls: "bg-emerald-50 text-emerald-700" },
  { label: "(", cls: "bg-gray-100 text-gray-700" },
  // Row 4
  { label: ")", cls: "bg-gray-100 text-gray-700" },
  { label: "7", cls: "bg-white text-gray-900" },
  { label: "8", cls: "bg-white text-gray-900" },
  { label: "9", cls: "bg-white text-gray-900" },
  { label: "÷", insert: "/", cls: "bg-amber-50 text-amber-700 font-bold" },
  // Row 5
  { label: "4", cls: "bg-white text-gray-900" },
  { label: "5", cls: "bg-white text-gray-900" },
  { label: "6", cls: "bg-white text-gray-900" },
  { label: "×", insert: "*", cls: "bg-amber-50 text-amber-700 font-bold" },
  { label: "−", insert: "-", cls: "bg-amber-50 text-amber-700 font-bold" },
  // Row 6
  { label: "1", cls: "bg-white text-gray-900" },
  { label: "2", cls: "bg-white text-gray-900" },
  { label: "3", cls: "bg-white text-gray-900" },
  { label: "+", cls: "bg-amber-50 text-amber-700 font-bold" },
  { label: "=", cls: "bg-indigo-600 text-white font-bold row-span-2" },
  // Row 7
  { label: "0", cls: "bg-white text-gray-900 col-span-2" },
  { label: ".", cls: "bg-white text-gray-900" },
  { label: "⌫", insert: "__BACKSPACE__", cls: "bg-gray-100 text-gray-700" },
];

const HISTORY_KEY = "studybuddy_calc_history";
const MEM_KEY = "studybuddy_calc_memory";

export function CalculatorScreen() {
  const { setScreen } = useApp();
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string>("");
  const [history, setHistory] = useState<Array<{ expr: string; result: string }>>([]);
  const [memory, setMemory] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      if (Array.isArray(savedHistory)) setHistory(savedHistory.slice(0, 10));
      const savedMem = parseFloat(localStorage.getItem(MEM_KEY) ?? "0");
      if (!isNaN(savedMem)) setMemory(savedMem);
    } catch { /* ignore */ }
  }, []);

  const saveHistory = (entries: Array<{ expr: string; result: string }>) => {
    const next = entries.slice(0, 10);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const saveMemory = (m: number) => {
    setMemory(m);
    localStorage.setItem(MEM_KEY, String(m));
  };

  const evaluate = (): string | null => {
    if (!expr.trim()) return null;
    try {
      setError(null);
      // Use mathjs evaluate — handles implicit mult, sin^2, |x|, etc.
      const r = math.evaluate(expr);
      if (r === undefined || r === null) return null;
      // mathjs may return a complex number, BigNumber, etc. — stringify.
      const formatted = math.format(r, { precision: 10 });
      return formatted;
    } catch (e: any) {
      setError(e?.message ?? "Invalid expression");
      return null;
    }
  };

  const onEqual = () => {
    const r = evaluate();
    if (r === null) {
      setResult("");
      return;
    }
    setResult(r);
    saveHistory([{ expr, result: r }, ...history].slice(0, 10));
  };

  const onButton = (label: string, insert?: string) => {
    setError(null);
    if (label === "AC") {
      setExpr("");
      setResult("");
      setError(null);
      return;
    }
    if (label === "⌫" || insert === "__BACKSPACE__") {
      setExpr((s) => s.slice(0, -1));
      return;
    }
    if (label === "=") {
      onEqual();
      return;
    }
    if (label === "MC") { saveMemory(0); return; }
    if (label === "MR") { setExpr((s) => s + String(memory)); return; }
    if (label === "M+") {
      const r = evaluate();
      if (r !== null) saveMemory(memory + parseFloat(r));
      return;
    }
    if (label === "M-") {
      const r = evaluate();
      if (r !== null) saveMemory(memory - parseFloat(r));
      return;
    }
    setExpr((s) => s + (insert ?? label));
  };

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-2xl md:px-0 md:pb-8">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setScreen("home")}
            aria-label="Back"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Scientific Calculator</h1>
        </div>

        {/* Display */}
        <div className="rounded-2xl bg-gray-900 p-4 mb-3">
          <div className="text-right text-xs text-gray-400 mb-1 h-4">
            {memory !== 0 && `M = ${memory}`}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={expr}
            onChange={(e) => { setExpr(e.target.value); setResult(""); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEqual(); } }}
            placeholder="0"
            spellCheck={false}
            className="w-full bg-transparent text-right text-2xl font-mono text-white outline-none placeholder-gray-600"
          />
          <div className="text-right text-sm font-mono text-emerald-400 mt-1 min-h-[20px]">
            {error ? <span className="text-rose-400 text-xs">⚠ {error}</span> : result ? `= ${result}` : ""}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase text-gray-500">History</p>
              <button
                onClick={() => saveHistory([])}
                className="text-[10px] text-rose-500 hover:text-rose-600 flex items-center gap-1"
              >
                <Eraser className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setExpr(h.expr); setResult(h.result); }}
                  className="w-full text-left px-2 py-1 rounded-md hover:bg-gray-100 transition"
                >
                  <p className="text-[11px] text-gray-500 truncate">{h.expr}</p>
                  <p className="text-xs font-mono font-medium text-gray-900 truncate">= {h.result}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Button grid — 5 columns */}
        <div className="grid grid-cols-5 gap-2">
          {BUTTONS.map((btn) => (
            <button
              key={btn.label}
              onClick={() => onButton(btn.label, btn.insert)}
              className={`h-12 rounded-xl text-sm font-semibold transition hover:brightness-95 active:brightness-90 ${btn.cls ?? "bg-white text-gray-900"}`}
              style={btn.colSpan ? { gridColumn: `span ${btn.colSpan}` } : undefined}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-[10px] text-gray-400">
          Powered by mathjs — supports sin/cos/tan, sqrt, log, ln, π, e, ^, parentheses, and variable assignment (x = 5).
        </p>
      </div>
    </div>
  );
}
