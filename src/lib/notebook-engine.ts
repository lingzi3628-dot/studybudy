/**
 * Notebook Engine — Phase 49 (fixed in Phase 61c)
 *
 * A persistent Pyodide kernel for Jupyter-style notebooks.
 *
 * Fixes from original:
 *   - Loads pandas + numpy + matplotlib explicitly (seaborn is NOT bundled)
 *   - Uses pyodide.runPython() with a wrapper that captures the last
 *     expression value via Python's `eval()` vs `exec()` distinction
 *   - DataFrame detection works via Python-side introspection
 *   - Datasets are embedded as raw CSV strings (no network fetch needed)
 *   - Error messages are clean Python tracebacks, not JS stack traces
 */

const PYODIDE_VERSION = "0.27.7";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type CellOutput =
  | { type: "text"; content: string }
  | { type: "image"; src: string }
  | { type: "table"; columns: string[]; rows: any[][] }
  | { type: "error"; name: string; message: string; stack?: string }
  | { type: "html"; content: string };

export type CellResult = {
  stdout: string;
  stderr: string;
  outputs: CellOutput[];
  executionCount: number;
  durationMs: number;
};

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
    __notebookPyodide?: any;
    __notebookPyodidePromise?: Promise<any>;
  }
}

export class NotebookKernel {
  private pyodide: any = null;
  private loadingPromise: Promise<any> | null = null;
  private packagesLoaded: Set<string> = new Set();
  private executionCount = 0;

  async ensureLoaded(): Promise<any> {
    if (this.pyodide) return this.pyodide;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      if (window.__notebookPyodide) {
        this.pyodide = window.__notebookPyodide;
        return this.pyodide;
      }

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

      const py = await window.loadPyodide!({ indexURL: PYODIDE_CDN });
      window.__notebookPyodide = py;
      this.pyodide = py;

      // Load core packages: numpy, pandas, matplotlib
      // Do NOT load seaborn — it's not in the Pyodide package index by default
      await py.loadPackage(["numpy", "pandas", "matplotlib"]);

      // Set up matplotlib Agg backend + helpers
      await py.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io, base64
import numpy as np
import pandas as pd

# Helper: capture all open figures as base64 PNGs
def _studybuddy_get_figures():
    figs = []
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=80, bbox_inches='tight')
        buf.seek(0)
        b64 = base64.b64encode(buf.getvalue()).decode()
        figs.append(b64)
    plt.close('all')
    return figs

# Helper: check if a Python object is a DataFrame and return records
def _studybuddy_check_df(name):
    """Check if the last expression result is a DataFrame. Returns JSON or None."""
    import json
    try:
        obj = globals().get('__last_expr_result__', None)
        if obj is None:
            return None
        if isinstance(obj, pd.DataFrame):
            truncated = obj.head(100)
            result = {
                "columns": [str(c) for c in truncated.columns],
                "rows": truncated.values.tolist(),
                "total_rows": len(obj),
                "truncated": len(obj) > 100,
            }
            return json.dumps(result)
        return None
    except:
        return None

# Helper: format the last expression result as a string
def _studybuddy_format_result():
    obj = globals().get('__last_expr_result__', None)
    if obj is None:
        return None
    if isinstance(obj, pd.DataFrame):
        return obj.to_string()
    if isinstance(obj, np.ndarray):
        return str(obj)
    return repr(obj)
`);
      return this.pyodide;
    })();

    return this.loadingPromise;
  }

  async loadPackage(name: string): Promise<void> {
    if (this.packagesLoaded.has(name)) return;
    const py = await this.ensureLoaded();
    try {
      await py.loadPackage(name);
      this.packagesLoaded.add(name);
    } catch (e) {
      console.warn(`Failed to load package ${name}:`, e);
      throw e;
    }
  }

  /**
   * Load pre-loaded datasets as in-memory CSVs.
   * Uses embedded CSV data — no network fetch needed.
   */
  async loadDatasets(): Promise<void> {
    const py = await this.ensureLoaded();
    try {
      await py.runPythonAsync(`
import sys, types, io
import pandas as pd

# Create the studybuddy.datasets module
studybuddy_mod = types.ModuleType('studybuddy')
datasets_mod = types.ModuleType('studybuddy.datasets')

# Embedded CSV data (small datasets, no network needed)
_IRIS_CSV = """sepal_length,sepal_width,petal_length,petal_width,species
5.1,3.5,1.4,0.2,setosa
4.9,3.0,1.4,0.2,setosa
4.7,3.2,1.3,0.2,setosa
4.6,3.1,1.5,0.2,setosa
5.0,3.6,1.4,0.2,setosa
5.4,3.9,1.7,0.4,setosa
4.6,3.4,1.4,0.3,setosa
5.0,3.4,1.5,0.2,setosa
4.4,2.9,1.4,0.2,setosa
4.9,3.1,1.5,0.1,setosa
5.4,3.7,1.5,0.2,setosa
4.8,3.4,1.6,0.2,setosa
4.8,3.0,1.4,0.1,setosa
4.3,3.0,1.1,0.1,setosa
5.8,4.0,1.2,0.2,setosa
5.7,4.4,1.5,0.4,setosa
5.4,3.9,1.3,0.4,setosa
5.1,3.5,1.4,0.3,setosa
5.7,3.8,1.7,0.3,setosa
5.1,3.8,1.5,0.3,setosa
5.4,3.4,1.7,0.2,setosa
5.1,3.7,1.5,0.4,setosa
4.6,3.6,1.0,0.2,setosa
5.1,3.3,1.7,0.5,setosa
4.8,3.4,1.9,0.2,setosa
5.0,3.0,1.6,0.2,setosa
5.0,3.4,1.6,0.4,setosa
5.2,3.5,1.5,0.2,setosa
5.2,3.4,1.4,0.2,setosa
4.7,3.2,1.6,0.2,setosa
4.8,3.1,1.6,0.2,setosa
5.4,3.4,1.5,0.4,setosa
5.2,4.1,1.5,0.1,setosa
5.5,4.2,1.4,0.2,setosa
4.9,3.1,1.5,0.2,setosa
5.0,3.2,1.2,0.2,setosa
5.5,3.5,1.3,0.2,setosa
4.9,3.6,1.4,0.1,setosa
4.4,3.0,1.3,0.2,setosa
5.1,3.4,1.5,0.2,setosa
5.0,3.5,1.3,0.3,setosa
4.5,2.3,1.3,0.3,setosa
4.4,3.2,1.3,0.2,setosa
5.0,3.5,1.6,0.6,setosa
5.1,3.8,1.9,0.4,setosa
4.8,3.0,1.4,0.3,setosa
5.1,3.8,1.6,0.2,setosa
4.6,3.2,1.4,0.2,setosa
5.3,3.7,1.5,0.2,setosa
5.0,3.3,1.4,0.2,setosa
7.0,3.2,4.7,1.4,versicolor
6.4,3.2,4.5,1.5,versicolor
6.9,3.1,4.9,1.5,versicolor
5.5,2.3,4.0,1.3,versicolor
6.5,2.8,4.6,1.5,versicolor
5.7,2.8,4.5,1.3,versicolor
6.3,3.3,4.7,1.6,versicolor
4.9,2.4,3.3,1.0,versicolor
6.6,2.9,4.6,1.3,versicolor
5.2,2.7,3.9,1.4,versicolor
5.0,2.0,3.5,1.0,versicolor
5.9,3.0,4.2,1.5,versicolor
6.0,2.2,4.0,1.0,versicolor
6.1,2.9,4.7,1.4,versicolor
5.6,2.9,3.6,1.3,versicolor
6.7,3.1,4.4,1.4,versicolor
5.6,3.0,4.5,1.5,versicolor
5.8,2.7,4.1,1.0,versicolor
6.2,2.2,4.5,1.5,versicolor
5.6,2.5,3.9,1.1,versicolor
5.9,3.2,4.8,1.8,versicolor
6.1,2.8,4.0,1.3,versicolor
6.3,2.5,4.9,1.5,versicolor
6.1,2.8,4.7,1.2,versicolor
6.4,2.9,4.3,1.3,versicolor
6.6,3.0,4.4,1.4,versicolor
6.8,2.8,4.8,1.4,versicolor
6.7,3.0,5.0,1.7,versicolor
6.0,2.9,4.5,1.5,versicolor
5.7,2.6,3.5,1.0,versicolor
5.5,2.4,3.8,1.1,versicolor
5.5,2.4,3.7,1.0,versicolor
5.8,2.7,3.9,1.2,versicolor
6.0,2.7,5.1,1.6,versicolor
5.4,3.0,4.5,1.5,versicolor
6.0,3.4,4.5,1.6,versicolor
6.7,3.1,4.7,1.5,versicolor
6.3,2.3,4.4,1.3,versicolor
5.6,3.0,4.1,1.3,versicolor
5.5,2.5,4.0,1.3,versicolor
5.5,2.6,4.4,1.2,versicolor
6.1,3.0,4.6,1.4,versicolor
5.8,2.6,4.0,1.2,versicolor
5.0,2.3,3.3,1.0,versicolor
5.6,2.7,4.2,1.3,versicolor
5.7,3.0,4.2,1.2,versicolor
5.7,2.9,4.2,1.3,versicolor
6.2,2.9,4.3,1.3,versicolor
5.1,2.5,3.0,1.1,versicolor
5.7,2.8,4.1,1.3,versicolor
6.3,3.3,6.0,2.5,virginica
5.8,2.7,5.1,1.9,virginica
7.1,3.0,5.9,2.1,virginica
6.3,2.9,5.6,1.8,virginica
6.5,3.0,5.8,2.2,virginica
7.6,3.0,6.6,2.1,virginica
4.9,2.5,4.5,1.7,virginica
7.3,2.9,6.3,1.8,virginica
6.7,2.5,5.8,1.8,virginica
7.2,3.6,6.1,2.5,virginica
6.5,3.2,5.1,2.0,virginica
6.4,2.7,5.3,1.9,virginica
6.8,3.0,5.5,2.1,virginica
5.7,2.5,5.0,2.0,virginica
5.8,2.8,5.1,2.4,virginica
6.4,3.2,5.3,2.3,virginica
6.5,3.0,5.5,1.8,virginica
7.7,3.8,6.7,2.2,virginica
7.7,2.6,6.9,2.3,virginica
6.0,2.2,5.0,1.5,virginica
6.9,3.2,5.7,2.3,virginica
5.6,2.8,4.9,2.0,virginica
7.7,2.8,6.7,2.0,virginica
6.3,2.7,4.9,1.8,virginica
6.7,3.3,5.7,2.1,virginica
7.2,3.2,6.0,1.8,virginica
6.2,2.8,4.8,1.8,virginica
6.1,3.0,4.9,1.8,virginica
6.4,2.8,5.6,2.1,virginica
7.2,3.0,5.8,1.6,virginica
7.4,2.8,6.1,1.9,virginica
7.9,3.8,6.4,2.0,virginica
6.4,2.8,5.6,2.2,virginica
6.3,2.8,5.1,1.5,virginica
6.1,2.6,5.6,1.4,virginica
7.7,3.0,6.1,2.3,virginica
6.3,3.4,5.6,2.4,virginica
6.4,3.1,5.5,1.8,virginica
6.0,3.0,4.8,1.8,virginica
6.9,3.1,5.4,2.1,virginica
6.7,3.1,5.6,2.4,virginica
6.9,3.1,5.1,2.3,virginica
5.8,2.7,5.1,1.9,virginica
6.8,3.2,5.9,2.3,virginica
6.7,3.3,5.7,2.5,virginica
6.7,3.0,5.2,2.3,virginica
6.3,2.5,5.0,1.9,virginica
6.5,3.0,5.2,2.0,virginica
6.2,3.4,5.4,2.3,virginica
5.9,3.0,5.1,1.8,virginica
"""

# Simple tips dataset (synthetic)
_TIPS_CSV = """total_bill,tip,sex,smoker,day,time,size
16.99,1.01,Female,No,Sun,Dinner,2
10.34,1.66,Male,No,Sun,Dinner,3
21.01,3.5,Male,No,Sun,Dinner,3
23.68,3.31,Male,No,Sun,Dinner,2
24.59,3.61,Female,No,Sun,Dinner,4
25.29,4.71,Male,No,Sun,Dinner,4
8.77,2.0,Male,No,Sun,Dinner,2
26.88,3.12,Male,No,Sun,Dinner,4
15.04,1.96,Male,No,Sun,Dinner,2
14.78,3.23,Male,No,Sun,Dinner,2
"""

def load_dataset(name):
    """Load a pre-loaded dataset. Available: 'iris', 'tips'."""
    datasets = {
        'iris': _IRIS_CSV,
        'tips': _TIPS_CSV,
    }
    if name not in datasets:
        raise ValueError(f"Dataset '{name}' not found. Available: {', '.join(datasets.keys())}")
    return pd.read_csv(io.StringIO(datasets[name]))

datasets_mod.load_dataset = load_dataset
studybuddy_mod.datasets = datasets_mod
sys.modules['studybuddy'] = studybuddy_mod
sys.modules['studybuddy.datasets'] = datasets_mod
`);
    } catch (e) {
      console.warn("Failed to load datasets module:", e);
    }
  }

  /**
   * Run a cell of Python code.
   *
   * Strategy: use Python's `compile()` + `eval()`/`exec()` to distinguish
   * between expressions (which return a value) and statements (which don't).
   * This is what real Jupyter does.
   */
  async runCell(code: string): Promise<CellResult> {
    const py = await this.ensureLoaded();
    const startTime = Date.now();
    this.executionCount++;

    let stdout = "";
    let stderr = "";

    py.setStdout({ batched: (s: string) => { stdout += s + "\n"; } });
    py.setStderr({ batched: (s: string) => { stderr += s + "\n"; } });

    const outputs: CellOutput[] = [];

    try {
      // Use a Python wrapper that tries eval first (for expressions),
      // falls back to exec (for statements). Stores the result in
      // __last_expr_result__ so we can inspect it afterwards.
      const wrappedCode = `
__last_expr_result__ = None
try:
    # Try to compile as an expression (returns a value)
    try:
        tree = compile(${JSON.stringify(code)}, '<cell>', 'eval')
        __last_expr_result__ = eval(tree)
    except SyntaxError:
        # It's a statement (or multiple statements), use exec
        exec(compile(${JSON.stringify(code)}, '<cell>', 'exec'))
except Exception as e:
    import traceback
    print(traceback.format_exc(), file=__import__('sys').stderr)
    raise
`;

      try {
        await py.runPythonAsync(wrappedCode);
      } catch (e: any) {
        // Error was already printed to stderr by the Python traceback above.
        // Extract the clean error message.
        const errMsg = stderr.trim() || e?.message || "Execution error";
        outputs.push({
          type: "error",
          name: "PythonError",
          message: errMsg.split("\n").slice(-3).join("\n"),
          stack: errMsg,
        });
        return {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          outputs,
          executionCount: this.executionCount,
          durationMs: Date.now() - startTime,
        };
      }

      // Check for matplotlib figures
      try {
        const figures = py.runPython("_studybuddy_get_figures()");
        if (figures && figures.length > 0) {
          for (const fig of figures) {
            outputs.push({ type: "image", src: `data:image/png;base64,${fig}` });
          }
        }
      } catch { /* no figures */ }

      // Check if the last expression was a DataFrame
      try {
        const dfJson = py.runPython("_studybuddy_check_df('__last_expr_result__')");
        if (dfJson) {
          const parsed = JSON.parse(dfJson);
          if (parsed) {
            outputs.push({
              type: "table",
              columns: parsed.columns,
              rows: parsed.rows,
            });
          }
        }
      } catch { /* not a DataFrame */ }

      // If no table was added, try to format the result as text
      if (outputs.length === 0) {
        try {
          const resultStr = py.runPython("_studybuddy_format_result()");
          if (resultStr && resultStr !== "None") {
            outputs.push({ type: "text", content: resultStr });
          }
        } catch { /* ignore */ }
      }
    } finally {
      py.setStdout({});
      py.setStderr({});
    }

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      outputs,
      executionCount: this.executionCount,
      durationMs: Date.now() - startTime,
    };
  }

  async reset(): Promise<void> {
    if (!this.pyodide) return;
    try {
      await this.pyodide.runPythonAsync(`
import sys
for name in list(globals()):
    if not name.startswith('_') and name not in ['sys', 'os', 'json', 'io', 'base64', 'matplotlib', 'plt', 'pd', 'np']:
        del globals()[name]
plt.close('all')
`);
    } catch { /* ignore */ }
    this.executionCount = 0;
  }

  isLoaded(): boolean { return this.pyodide !== null; }
  getExecutionCount(): number { return this.executionCount; }
}
