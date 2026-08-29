"use client";

/**
 * NotebookScreen — Phase 49
 *
 * Jupyter-style notebook that runs 100% in the browser via Pyodide.
 * Supports code cells (Python) and markdown cells, with persistent
 * variable state across cells (shared kernel).
 *
 * Layout:
 *   - Header: notebook title (editable), Save, Run All, Reset Kernel
 *   - Cells: vertical stack of code/markdown cells
 *   - Each code cell: CodeEditor + Run button + output area
 *   - Each markdown cell: rendered markdown (with edit toggle)
 *   - Bottom: + Code / + Markdown buttons to add new cells
 *
 * Persistence:
 *   The notebook is stored as a single `notebook.ipynb` JSON file in a
 *   Project with buddyId="data". On save, all cells + outputs are
 *   serialized to JSON and PUT to /api/projects/[id]/files.
 *
 * Datasets:
 *   Pre-loaded via `from studybuddy.datasets import load_dataset`.
 *   Available: iris, titanic, tips, planets, flights, mpg.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft, Play, Loader2, Plus, Save, RotateCcw, Code2, FileText,
  Trash2, Square, AlertCircle, CheckCircle2, Database, Sparkles,
} from "lucide-react";
import { useApp } from "../store";
import { CodeEditor } from "./CodeEditor";
import { NotebookKernel, type CellOutput, type CellResult } from "@/lib/notebook-engine";

type CellType = "code" | "markdown";

type NotebookCell = {
  id: string;
  type: CellType;
  source: string;
  outputs: CellOutput[];
  executionCount: number | null;  // null = not yet run
};

type Notebook = {
  nbformat: number;
  cells: NotebookCell[];
};

const STARTER_NOTEBOOK: Notebook = {
  nbformat: 1,
  cells: [
    {
      id: "intro-md",
      type: "markdown",
      source: "# 📊 My DataBuddy Notebook\n\nThis notebook runs **100% in your browser** via Pyodide (Python in WASM).\n\nVariables persist across cells — `x = 5` in one cell is visible in the next.",
      outputs: [],
      executionCount: null,
    },
    {
      id: "intro-code",
      type: "code",
      source: `# Load a pre-built dataset and explore it
from studybuddy.datasets import load_dataset
import pandas as pd

df = load_dataset('titanic')
print(f"Loaded {len(df)} rows")
df.head()`,
      outputs: [],
      executionCount: null,
    },
    {
      id: "viz-code",
      type: "code",
      source: `# Visualize survival by gender
import matplotlib.pyplot as plt

survival = df.groupby('sex')['survived'].mean()
survival.plot(kind='bar', color=['#ec4899', '#3b82f6'])
plt.title('Survival Rate by Gender')
plt.ylabel('Survival Rate')
plt.xticks(rotation=0)
plt.show()`,
      outputs: [],
      executionCount: null,
    },
  ],
};

function uuid(): string {
  return `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function NotebookScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;
  const [notebook, setNotebook] = useState<Notebook>(STARTER_NOTEBOOK);
  const [title, setTitle] = useState("Untitled notebook");
  const [projectId, setProjectId] = useState<string | null>(activeProjectId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [kernelLoading, setKernelLoading] = useState(false);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [editingMarkdownId, setEditingMarkdownId] = useState<string | null>(null);

  const kernelRef = useRef<NotebookKernel | null>(null);

  // Initialize kernel once
  useEffect(() => {
    kernelRef.current = new NotebookKernel();
    return () => {
      kernelRef.current = null;
    };
  }, []);

  // Load the project on mount
  useEffect(() => {
    (async () => {
      if (!activeProjectId) {
        // New notebook — use starter
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const r = await fetch(`/api/projects/${activeProjectId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        const p = d.project;
        if (!p) throw new Error("Project not found");
        setTitle(p.title);
        setProjectId(p.id);
        // Find the notebook file
        const nbFile = p.files?.find((f: any) =>
          f.path === "notebook.ipynb" || f.path.endsWith(".ipynb")
        );
        if (nbFile) {
          const parsed = JSON.parse(nbFile.content);
          if (parsed.cells) {
            setNotebook({ nbformat: parsed.nbformat ?? 1, cells: parsed.cells });
          }
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load notebook");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeProjectId]);

  // Update a cell's source
  const updateCell = useCallback((id: string, source: string) => {
    setNotebook((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (c.id === id ? { ...c, source } : c)),
    }));
    setDirty(true);
  }, []);

  // Run a single code cell
  const runCell = useCallback(async (id: string) => {
    const cell = notebook.cells.find((c) => c.id === id);
    if (!cell || cell.type !== "code") return;

    setRunningCellId(id);
    setError(null);

    try {
      const kernel = kernelRef.current!;
      if (!kernel.isLoaded()) {
        setKernelLoading(true);
      }
      await kernel.ensureLoaded();
      await kernel.loadDatasets();
      setKernelLoading(false);

      const result: CellResult = await kernel.runCell(cell.source);

      // Update the cell with outputs
      setNotebook((prev) => ({
        ...prev,
        cells: prev.cells.map((c) =>
          c.id === id
            ? { ...c, outputs: result.outputs, executionCount: result.executionCount }
            : c
        ),
      }));
    } catch (e: any) {
      setNotebook((prev) => ({
        ...prev,
        cells: prev.cells.map((c) =>
          c.id === id
            ? { ...c, outputs: [{ type: "error", name: "KernelError", message: e?.message ?? "Failed to run" }], executionCount: 0 }
            : c
        ),
      }));
    } finally {
      setRunningCellId(null);
      setKernelLoading(false);
    }
  }, [notebook.cells]);

  // Run all code cells in order
  const runAll = useCallback(async () => {
    const codeCells = notebook.cells.filter((c) => c.type === "code");
    for (const cell of codeCells) {
      await runCell(cell.id);
    }
  }, [notebook.cells, runCell]);

  // Reset the kernel
  const resetKernel = useCallback(async () => {
    if (!confirm("Reset the Python kernel? All variables will be cleared.")) return;
    const kernel = kernelRef.current;
    if (!kernel) return;
    await kernel.reset();
    // Clear execution counts and outputs
    setNotebook((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => ({
        ...c,
        outputs: [],
        executionCount: null,
      })),
    }));
  }, []);

  // Add a new cell after the given id (or at the end if null)
  const addCell = useCallback((type: CellType, afterId?: string) => {
    const newCell: NotebookCell = {
      id: uuid(),
      type,
      source: type === "code" ? "" : "",
      outputs: [],
      executionCount: null,
    };
    setNotebook((prev) => {
      const cells = [...prev.cells];
      if (afterId) {
        const idx = cells.findIndex((c) => c.id === afterId);
        cells.splice(idx + 1, 0, newCell);
      } else {
        cells.push(newCell);
      }
      return { ...prev, cells };
    });
    setDirty(true);
  }, []);

  // Delete a cell
  const deleteCell = useCallback((id: string) => {
    setNotebook((prev) => ({
      ...prev,
      cells: prev.cells.filter((c) => c.id !== id),
    }));
    setDirty(true);
  }, []);

  // Save the notebook as a Project
  const saveNotebook = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const notebookJson = JSON.stringify(notebook, null, 2);
      const files = [{ path: "notebook.ipynb", language: "json", content: notebookJson, isEntry: true }];

      if (projectId && !projectId.startsWith("temp-")) {
        // Existing project — update files
        const r = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files }),
        });
        if (!r.ok) throw new Error(`Save failed: HTTP ${r.status}`);
      } else {
        // New project — create
        const r = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buddyId: "data",
            title,
            description: "Jupyter notebook via DataBuddy",
            tags: ["notebook", "data"],
            files,
          }),
        });
        if (!r.ok) throw new Error(`Create failed: HTTP ${r.status}`);
        const d = await r.json();
        setProjectId(d.project.id);
        setActiveProjectId(d.project.id);
      }
      setDirty(false);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [notebook, projectId, title, setActiveProjectId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
        <span className="ml-2 text-sm text-gray-500">Loading notebook…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => setScreen("projects")}
          aria-label="Back to projects"
          className="text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Database className="w-5 h-5 text-sky-500 flex-shrink-0" />
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-900 outline-none border-b border-transparent focus:border-sky-500"
          placeholder="Untitled notebook"
        />
        {dirty && <span className="text-[10px] text-amber-500" title="Unsaved">●</span>}
        {savedAt && (
          <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
            <CheckCircle2 className="w-3 h-3" /> Saved
          </span>
        )}
        <button
          onClick={resetKernel}
          className="px-2.5 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold flex items-center gap-1 hover:bg-gray-200"
          title="Reset Python kernel (clears all variables)"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button
          onClick={runAll}
          className="px-2.5 h-9 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1 hover:bg-sky-200"
          title="Run all code cells"
        >
          <Play className="w-3.5 h-3.5" /> Run All
        </button>
        <button
          onClick={saveNotebook}
          disabled={saving}
          className="px-3 h-9 rounded-full bg-sky-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </header>

      {/* Cells */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-4 space-y-3">
        {notebook.cells.map((cell, index) => (
          <Cell
            key={cell.id}
            cell={cell}
            index={index}
            isRunning={runningCellId === cell.id}
            kernelLoading={kernelLoading && runningCellId === cell.id}
            editing={editingMarkdownId === cell.id}
            onEdit={(source) => updateCell(cell.id, source)}
            onRun={() => runCell(cell.id)}
            onDelete={() => deleteCell(cell.id)}
            onToggleEdit={() => setEditingMarkdownId(editingMarkdownId === cell.id ? null : cell.id)}
            onAddAfter={(type) => addCell(type, cell.id)}
          />
        ))}

        {/* Add cell buttons at the bottom */}
        <div className="flex items-center justify-center gap-2 py-4">
          <button
            onClick={() => addCell("code")}
            className="px-3 h-9 rounded-full bg-white border border-gray-200 text-gray-700 text-xs font-semibold flex items-center gap-1 hover:border-sky-300 hover:text-sky-700"
          >
            <Code2 className="w-3.5 h-3.5" /> + Code
          </button>
          <button
            onClick={() => addCell("markdown")}
            className="px-3 h-9 rounded-full bg-white border border-gray-200 text-gray-700 text-xs font-semibold flex items-center gap-1 hover:border-sky-300 hover:text-sky-700"
          >
            <FileText className="w-3.5 h-3.5" /> + Markdown
          </button>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-rose-900/90 text-rose-100 px-4 py-2.5 rounded-lg shadow-lg max-w-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-300 hover:text-white">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A single notebook cell — code or markdown.
 */
function Cell({
  cell,
  index,
  isRunning,
  kernelLoading,
  editing,
  onEdit,
  onRun,
  onDelete,
  onToggleEdit,
  onAddAfter,
}: {
  cell: NotebookCell;
  index: number;
  isRunning: boolean;
  kernelLoading: boolean;
  editing: boolean;
  onEdit: (source: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onToggleEdit: () => void;
  onAddAfter: (type: CellType) => void;
}) {
  if (cell.type === "markdown") {
    return (
      <div className="group relative rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        {/* Cell toolbar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 opacity-0 group-hover:opacity-100 transition">
          <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
            <FileText className="w-3 h-3" /> MD
          </span>
          <div className="flex-1" />
          <button onClick={onToggleEdit} className="text-[10px] text-gray-500 hover:text-sky-600 px-1">
            {editing ? "Preview" : "Edit"}
          </button>
          <button onClick={() => onAddAfter("code")} className="text-[10px] text-gray-500 hover:text-sky-600 px-1">
            + Code
          </button>
          <button onClick={() => onAddAfter("markdown")} className="text-[10px] text-gray-500 hover:text-sky-600 px-1">
            + MD
          </button>
          <button onClick={onDelete} className="text-[10px] text-gray-500 hover:text-rose-600 px-1">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* Cell content */}
        {editing ? (
          <CodeEditor
            value={cell.source}
            onChange={onEdit}
            language="markdown"
            minHeight="100px"
          />
        ) : (
          <div
            className="px-4 py-3 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source) }}
          />
        )}
      </div>
    );
  }

  // Code cell
  return (
    <div className="group relative rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      {/* Cell toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-gray-50/50">
        <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
          <Code2 className="w-3 h-3" /> In [{cell.executionCount ?? " "}]
        </span>
        <div className="flex-1" />
        <button
          onClick={onRun}
          disabled={isRunning}
          className="px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition disabled:opacity-50"
          style={{
            background: isRunning ? "#e0f2fe" : "transparent",
            color: isRunning ? "#0284c7" : "#0369a1",
          }}
          title="Run this cell"
        >
          {isRunning ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> {kernelLoading ? "Loading Python…" : "Running…"}</>
          ) : (
            <><Play className="w-3 h-3" /> Run</>
          )}
        </button>
        <button onClick={() => onAddAfter("code")} className="text-[10px] text-gray-500 hover:text-sky-600 px-1">
          + Code
        </button>
        <button onClick={() => onAddAfter("markdown")} className="text-[10px] text-gray-500 hover:text-sky-600 px-1">
          + MD
        </button>
        <button onClick={onDelete} className="text-[10px] text-gray-500 hover:text-rose-600 px-1">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Code editor */}
      <CodeEditor
        value={cell.source}
        onChange={onEdit}
        language="python"
        minHeight="60px"
      />

      {/* Output area */}
      {cell.outputs.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50/30 px-3 py-2">
          {cell.outputs.map((output, i) => (
            <CellOutputView key={i} output={output} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Render a single cell output (text, image, table, error).
 */
function CellOutputView({ output }: { output: CellOutput }) {
  switch (output.type) {
    case "text":
      return (
        <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap mt-1">
          {output.content}
        </pre>
      );
    case "image":
      return (
        <img
          src={output.src}
          alt="Matplotlib output"
          className="max-w-full rounded-lg bg-white border border-gray-200 my-1"
        />
      );
    case "table":
      return (
        <div className="overflow-x-auto my-1">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                {output.columns.map((col, i) => (
                  <th key={i} className="border-b-2 border-gray-300 px-3 py-1.5 text-left font-semibold text-gray-700 bg-gray-50">
                    {String(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.rows.map((row, i) => (
                <tr key={i} className="even:bg-gray-50/50">
                  {row.map((cell, j) => (
                    <td key={j} className="border-b border-gray-100 px-3 py-1.5 text-gray-600">
                      {String(cell ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "error":
      return (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 my-1">
          <p className="text-xs font-bold text-rose-700">{output.name}</p>
          <pre className="text-xs text-rose-600 whitespace-pre-wrap mt-1">{output.message}</pre>
        </div>
      );
    case "html":
      return (
        <div dangerouslySetInnerHTML={{ __html: output.content }} />
      );
    default:
      return null;
  }
}

/**
 * Simple markdown renderer — converts basic markdown to HTML.
 * Supports: # headings, **bold**, *italic*, `code`, [links](url), lists.
 * For production, we'd use a real parser (marked/react-markdown), but
 * this keeps the bundle small.
 */
function renderMarkdown(source: string): string {
  let html = source;
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-3 mb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-3 mb-2">$1</h1>');
  // Bold + italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-sky-600 hover:underline">$1</a>');
  // Line breaks → paragraphs
  html = html.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  return html;
}
