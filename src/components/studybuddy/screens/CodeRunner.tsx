"use client";

/**
 * CodeRunner — Phase 46
 *
 * Interactive Python code runner using Pyodide (Python compiled to WASM).
 * Loaded via CDN script tag — no npm dependency needed.
 *
 * Features:
 *   - Editable code textarea with example buttons
 *   - Run button that executes the code in the browser (no server roundtrip)
 *   - stdout/stderr capture and display
 *   - Example snippets for common student tasks (print, loop, function, math)
 *
 * Use cases:
 *   - STEM: compute physics formulas, plot data, simulate systems
 *   - Computer Science: practice Python syntax
 *   - Math: solve equations symbolically (sympy is bundled with Pyodide)
 *
 * The runner is also embeddable as an attachment type in AI Tutor chat
 * (future work — currently a standalone screen).
 */

import { useEffect, useState, useRef } from "react";
import { Play, Loader2, Square, RotateCcw, Code2 } from "lucide-react";

const EXAMPLES = [
  {
    label: "Hello World",
    code: `print("Hello, StudyBuddy!")\nprint("Python is running in your browser via Pyodide.")`,
  },
  {
    label: "Loop",
    code: `for i in range(1, 11):\n    print(f"{i} x 7 = {i * 7}")`,
  },
  {
    label: "Function",
    code: `def is_prime(n):\n    if n < 2: return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0: return False\n    return True\n\nfor n in range(2, 20):\n    print(f"{n}: {'prime' if is_prime(n) else 'composite'}")`,
  },
  {
    label: "Math",
    code: `import math\n# Solve quadratic equation: x^2 - 5x + 6 = 0\na, b, c = 1, -5, 6\ndiscriminant = b**2 - 4*a*c\nx1 = (-b + math.sqrt(discriminant)) / (2*a)\nx2 = (-b - math.sqrt(discriminant)) / (2*a)\nprint(f"Roots: x1 = {x1}, x2 = {x2}")`,
  },
  {
    label: "Sympy",
    code: `from sympy import symbols, solve, Eq\nx = symbols('x')\n# Solve x^2 - 5x + 6 = 0 symbolically\nsolutions = solve(Eq(x**2 - 5*x + 6, 0), x)\nprint(f"Solutions: {solutions}")`,
  },
  {
    label: "Plot",
    code: `# Plot a parabola y = x^2 using matplotlib\nimport matplotlib\nmatplotlib.use("Agg")\nimport matplotlib.pyplot as plt\nimport io, base64\n\nxs = list(range(-5, 6))\nys = [x**2 for x in xs]\n\nplt.figure(figsize=(6, 4))\nplt.plot(xs, ys, 'b-o')\nplt.title("y = x^2")\nplt.xlabel("x"); plt.ylabel("y")\nplt.grid(True)\n\nbuf = io.BytesIO()\nplt.savefig(buf, format="png")\nplt.close()\nb64 = base64.b64encode(buf.getvalue()).decode()\nprint(f"PLOT_PNG:{b64}")`,
  },
];

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
    __pyodidePromise?: Promise<any>;
    __pyodide?: any;
  }
}

const PYODIDE_VERSION = "0.27.7";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export function CodeRunner() {
  const [code, setCode] = useState<string>(EXAMPLES[0].code);
  const [output, setOutput] = useState<string>("");
  const [plotDataUrl, setPlotDataUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Load Pyodide script tag once on mount (lazy — only when the user first clicks Run)
  const ensurePyodideLoaded = async (): Promise<any> => {
    if (window.__pyodide) return window.__pyodide;
    if (window.__pyodidePromise) return window.__pyodidePromise;

    setLoading(true);
    setError(null);

    // Inject the script tag if not already present
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `${PYODIDE_CDN}pyodide.js`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Pyodide from CDN"));
        document.head.appendChild(script);
      });
    }

    window.__pyodidePromise = window.loadPyodide!({ indexURL: PYODIDE_CDN })
      .then((pyodide: any) => {
        window.__pyodide = pyodide;
        // Pre-load common scientific packages
        try { pyodide.loadPackage(["matplotlib", "sympy", "numpy"]); } catch { /* best-effort */ }
        setLoading(false);
        return pyodide;
      })
      .catch((e: any) => {
        setLoading(false);
        setError(e?.message ?? "Failed to load Pyodide");
        throw e;
      });

    return window.__pyodidePromise;
  };

  const run = async () => {
    setRunning(true);
    setOutput("");
    setPlotDataUrl(null);
    setError(null);

    try {
      const pyodide = await ensurePyodideLoaded();

      // Capture stdout/stderr
      let captured = "";
      pyodide.setStdout({ batched: (s: string) => { captured += s + "\n"; } });
      pyodide.setStderr({ batched: (s: string) => { captured += s + "\n"; } });

      await pyodide.runPythonAsync(code);

      // Check for an embedded plot (matplotlib → base64 PNG)
      const plotMatch = captured.match(/PLOT_PNG:([A-Za-z0-9+/=]+)/);
      if (plotMatch) {
        setPlotDataUrl(`data:image/png;base64,${plotMatch[1]}`);
        captured = captured.replace(/PLOT_PNG:[A-Za-z0-9+/=]+/, "").trim();
      }

      setOutput(captured || "(no output)");
    } catch (e: any) {
      setOutput(`❌ Error: ${e?.message ?? "Execution failed"}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col max-w-3xl mx-auto">
      <header className="bg-gray-800 border-b border-gray-700 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-bold flex items-center gap-1.5">
          <Code2 className="w-4 h-4 text-emerald-400" /> Python Runner
          <span className="text-[10px] font-normal text-gray-400 ml-1">via Pyodide (WASM)</span>
        </h1>
        <div className="flex items-center gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => setCode(ex.code)}
              className="text-[10px] font-medium px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 transition"
              title={`Load example: ${ex.label}`}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 flex flex-col p-3 gap-3">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="w-full h-64 rounded-xl bg-gray-900 border border-gray-700 p-3 font-mono text-sm text-gray-100 outline-none focus:border-emerald-500 resize-y"
          placeholder="Write Python code..."
        />

        <div className="flex items-center gap-2">
          <button
            onClick={run}
            disabled={running || loading}
            className="px-4 h-10 rounded-full bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Loading Python…</>
            ) : running ? (
              <><Square className="w-4 h-4" /> Running…</>
            ) : (
              <><Play className="w-4 h-4" /> Run</>
            )}
          </button>
          <button
            onClick={() => { setOutput(""); setPlotDataUrl(null); setError(null); }}
            className="px-3 h-10 rounded-full bg-gray-700 text-gray-200 text-sm font-semibold flex items-center gap-1 hover:bg-gray-600"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Clear
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-900/40 border border-rose-700 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-[200px]">
          <p className="text-[10px] font-bold uppercase text-gray-400 mb-1.5">Output</p>
          <div
            ref={outputRef}
            className="rounded-xl bg-black border border-gray-700 p-3 font-mono text-xs text-emerald-200 whitespace-pre-wrap min-h-[120px] max-h-[400px] overflow-y-auto"
          >
            {output || <span className="text-gray-500">Run your code to see output…</span>}
          </div>

          {plotDataUrl && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1.5">Plot</p>
              <img src={plotDataUrl} alt="Python plot" className="max-w-full rounded-lg bg-white" />
            </div>
          )}
        </div>

        <p className="text-[10px] text-gray-500 text-center">
          Runs 100% in your browser — no server roundtrip. Pyodide is Python compiled to WASM.
        </p>
      </div>
    </div>
  );
}
