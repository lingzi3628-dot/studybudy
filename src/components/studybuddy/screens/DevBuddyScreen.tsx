"use client";

/**
 * DevBuddyScreen — Phase 48
 *
 * The full-screen code editor for DevBuddy projects. Three-pane layout:
 *   - Left: file tree (list of ProjectFile rows, click to open)
 *   - Center: CodeEditor for the active file
 *   - Bottom: Output panel (Run button + console output + Python/JS toggle)
 *
 * Features:
 *   - Open existing project: GET /api/projects/[id] on mount when activeProjectId is set
 *   - New empty project: create from the ProjectsScreen "New" button
 *   - Multi-file: tabs across the top, "New file" button to add more
 *   - Save: PUT /api/projects/[id]/files — bulk-upserts all changed files
 *   - Run: 
 *     - Python files → existing Pyodide runner (Phase 46)
 *     - JavaScript files → new useJSRunner hook (Phase 48)
 *     - Other files → "Can't run this file type" message
 *   - Delete file: small × on each tab (with confirm)
 *
 * The editor uses CodeMirror 6 (Phase 48) with syntax highlighting for
 * Python, JavaScript, TypeScript, SQL, Markdown, JSON, HTML, CSS.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft, Play, Loader2, Square, Save, Plus, FileCode2, FileX,
  X, AlertCircle, CheckCircle2, Terminal, Sparkles,
} from "lucide-react";
import { useApp } from "../store";
import { CodeEditor, detectLanguageFromPath, type CodeLanguage } from "./CodeEditor";
import { useJSRunner, type JSRunResult, type JSLogEntry } from "./useJSRunner";

type ProjectFile = {
  id: string;
  path: string;
  language: string;
  content: string;
  isEntry: boolean;
};

type Project = {
  id: string;
  buddyId: string;
  title: string;
  description: string | null;
  tags: string[];
  conversationId: string | null;
  files: ProjectFile[];
};

type RunState = "idle" | "loading" | "running" | "done" | "error";

const STARTER_FILES: Array<{ path: string; content: string; isEntry?: boolean }> = [
  {
    path: "main.py",
    isEntry: true,
    content: `# Welcome to DevBuddy — your in-browser code editor + runner
# Try running this file (press the Run button below).
# Supports: Python (via Pyodide), JavaScript (via Web Worker sandbox)

def greet(name):
    return f"Hello, {name}! Welcome to StudyBuddy DevBuddy."

print(greet("Student"))
print("Try editing me, then press Run again!")

# Want to test more? Try:
# - Ask DevBuddy in AI Tutor to generate code, then "Save as project"
# - Add a new file (New File button) — supports .js, .ts, .sql, .md
# - Run JavaScript: change to a .js file and click Run
`,
  },
];

export function DevBuddyScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;
  const [project, setProject] = useState<Project | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string>("");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [runOutput, setRunOutput] = useState<string>("");
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const pyodideRef = useRef<any>(null);

  // JS runner (Phase 48)
  const jsRunner = useJSRunner();

  // New file modal
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");

  // Load the project on mount
  const loadProject = useCallback(async () => {
    if (!activeProjectId) {
      // No project selected — create a new empty one
      setLoading(false);
      const tempId = "temp-" + Date.now();
      const starterFiles: ProjectFile[] = STARTER_FILES.map((f, i) => ({
        id: `temp-${i}`,
        path: f.path,
        language: detectLanguageFromPath(f.path) as string,
        content: f.content,
        isEntry: !!f.isEntry,
      }));
      setProject({
        id: tempId,
        buddyId: "dev",
        title: "Untitled project",
        description: null,
        tags: [],
        conversationId: null,
        files: starterFiles,
      });
      setFiles(starterFiles);
      setActiveFilePath(starterFiles[0]?.path ?? "");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${activeProjectId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const p = d.project;
      if (!p) throw new Error("Project not found");
      setProject(p);
      setFiles(p.files ?? []);
      setActiveFilePath(p.files.find((f: ProjectFile) => f.isEntry)?.path ?? p.files[0]?.path ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Update a file's content
  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
    setDirty(true);
  }, []);

  // Save all files to the server
  const saveProject = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      // If the project has a temp id, create it first (POST /api/projects)
      // then update files (PUT /api/projects/[id]/files)
      let projectId = project.id;
      if (project.id.startsWith("temp-")) {
        const createRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buddyId: "dev",
            title: project.title,
            description: project.description,
            tags: project.tags,
            files: files.map((f) => ({
              path: f.path,
              language: f.language,
              content: f.content,
              isEntry: f.isEntry,
            })),
          }),
        });
        if (!createRes.ok) throw new Error(`Create failed: HTTP ${createRes.status}`);
        const created = await createRes.json();
        projectId = created.project.id;
        setProject((p) => p ? { ...p, id: projectId } : p);
        setActiveProjectId(projectId);
      } else {
        // Existing project — bulk upsert files
        const updateRes = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: files.map((f) => ({
              path: f.path,
              language: f.language,
              content: f.content,
              isEntry: f.isEntry,
            })),
          }),
        });
        if (!updateRes.ok) throw new Error(`Save failed: HTTP ${updateRes.status}`);
      }
      setDirty(false);
      setSavedAt(Date.now());
      // Auto-clear the "saved" indicator after 2 seconds
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [project, files, setActiveProjectId]);

  // Add a new file
  const addNewFile = useCallback(() => {
    const path = newFilePath.trim();
    if (!path) return;
    if (files.some((f) => f.path === path)) {
      setError(`File already exists: ${path}`);
      return;
    }
    const newFile: ProjectFile = {
      id: `temp-${Date.now()}`,
      path,
      language: detectLanguageFromPath(path) as string,
      content: "",
      isEntry: false,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFilePath(path);
    setDirty(true);
    setShowNewFile(false);
    setNewFilePath("");
  }, [newFilePath, files]);

  // Delete a file
  const deleteFile = useCallback(async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    // If the file is the entry point, refuse to delete via UI
    const file = files.find((f) => f.path === path);
    if (file?.isEntry) {
      setError("Cannot delete the entry file. Set another file as the entry first.");
      return;
    }
    setFiles((prev) => prev.filter((f) => f.path !== path));
    if (activeFilePath === path) {
      const remaining = files.filter((f) => f.path !== path);
      setActiveFilePath(remaining[0]?.path ?? "");
    }
    setDirty(true);
    // If the project is persisted (not temp) and the file is in the DB, delete from server
    if (project && !project.id.startsWith("temp-")) {
      try {
        await fetch(`/api/projects/${project.id}/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      } catch (e) {
        console.warn("Failed to delete file from server:", e);
      }
    }
  }, [files, activeFilePath, project]);

  // Lazily load Pyodide for Python files (Phase 46 — same loader as the CodeRunner screen)
  const ensurePyodideLoaded = async (): Promise<any> => {
    if (pyodideRef.current) return pyodideRef.current;
    setPyodideLoading(true);
    // Inject the Pyodide script tag
    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Pyodide"));
        document.head.appendChild(script);
      });
    }
    const py = await (window as any).loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" });
    pyodideRef.current = py;
    setPyodideLoading(false);
    return py;
  };

  // Run the active file
  const runActiveFile = useCallback(async () => {
    const file = files.find((f) => f.path === activeFilePath);
    if (!file) return;
    setRunState("running");
    setRunOutput("");

    try {
      const lang = detectLanguageFromPath(file.path);
      if (lang === "python") {
        setPyodideLoading(true);
        const py = await ensurePyodideLoaded();
        setPyodideLoading(false);

        let captured = "";
        py.setStdout({ batched: (s: string) => { captured += s + "\n"; } });
        py.setStderr({ batched: (s: string) => { captured += s + "\n"; } });

        try {
          await py.runPythonAsync(file.content);
          setRunOutput(captured || "(no output)");
          setRunState("done");
        } catch (e: any) {
          setRunOutput(`❌ Python error:\n${e?.message ?? "Execution failed"}`);
          setRunState("error");
        }
      } else if (lang === "javascript" || lang === "typescript") {
        const result = await jsRunner.run(file.content, 5000);
        const lines: string[] = [];
        if (result.logs.length > 0) {
          for (const log of result.logs) {
            const prefix = log.level === "error" ? "❌ " : log.level === "warn" ? "⚠ " : "";
            lines.push(`${prefix}${log.message}`);
          }
          lines.push("");
        }
        if (result.error) {
          lines.push(`❌ ${result.error.name}: ${result.error.message}`);
          if (result.error.stack) {
            const stackLines = result.error.stack.split("\n").slice(0, 5);
            lines.push(...stackLines);
          }
        } else if (result.result !== null && result.result !== undefined) {
          lines.push(`→ ${typeof result.result === "object" ? JSON.stringify(result.result, null, 2) : String(result.result)}`);
        }
        if (result.durationMs > 0) {
          lines.push(`\n⏱ ${result.durationMs}ms`);
        }
        setRunOutput(lines.join("\n") || "(no output)");
        setRunState(result.ok ? "done" : "error");
      } else {
        setRunOutput(`Can't run this file type. Supported: .py (Python), .js (JavaScript). Detected: ${lang}`);
        setRunState("error");
      }
    } catch (e: any) {
      setRunOutput(`❌ Failed to load runtime: ${e?.message ?? "Unknown error"}`);
      setRunState("error");
    }
  }, [files, activeFilePath, jsRunner]);

  const activeFile = files.find((f) => f.path === activeFilePath);
  const activeLanguage: CodeLanguage = activeFile ? (detectLanguageFromPath(activeFile.path) as CodeLanguage) : "text";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        <span className="ml-2 text-sm">Loading project…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 h-14 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => setScreen("projects")}
          aria-label="Back to projects"
          className="text-gray-300 hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileCode2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <input
            type="text"
            value={project?.title ?? ""}
            onChange={(e) => setProject((p) => p ? { ...p, title: e.target.value } : p)}
            onBlur={() => setDirty(true)}
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-white outline-none border-b border-transparent focus:border-emerald-500 transition"
            placeholder="Untitled project"
          />
          {dirty && (
            <span className="text-[10px] text-amber-400 flex-shrink-0" title="Unsaved changes">
              ●
            </span>
          )}
          {savedAt && (
            <span className="text-[10px] text-emerald-400 flex-shrink-0 flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" /> Saved
            </span>
          )}
        </div>
        <button
          onClick={saveProject}
          disabled={saving}
          className="px-3 h-9 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </header>

      {/* File tabs */}
      <div className="bg-gray-800 border-b border-gray-700 px-2 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
        {files.map((f) => (
          <div
            key={f.path}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs cursor-pointer whitespace-nowrap ${
              activeFilePath === f.path
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
            }`}
            onClick={() => setActiveFilePath(f.path)}
          >
            {f.isEntry && <span className="text-emerald-400" title="Entry point">★</span>}
            <span>{f.path}</span>
            {!f.isEntry && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteFile(f.path); }}
                className="text-gray-500 hover:text-rose-400 ml-1"
                aria-label={`Delete ${f.path}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setShowNewFile(true)}
          className="flex-shrink-0 px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-700"
          aria-label="New file"
          title="New file"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Code editor (flex-1) */}
      <div className="flex-1 overflow-hidden p-2">
        {activeFile ? (
          <CodeEditor
            value={activeFile.content}
            onChange={(newValue) => updateFileContent(activeFile.path, newValue)}
            language={activeLanguage}
            minHeight="100%"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <FileX className="w-10 h-10" />
            <p className="mt-2 text-sm">No file selected</p>
            <button
              onClick={() => setShowNewFile(true)}
              className="mt-3 text-xs text-emerald-400 hover:underline"
            >
              Create a new file
            </button>
          </div>
        )}
      </div>

      {/* Run bar */}
      <div className="bg-gray-800 border-t border-gray-700 px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={runActiveFile}
          disabled={runState === "running" || pyodideLoading}
          className="px-3 h-9 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
        >
          {runState === "running" || pyodideLoading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {pyodideLoading ? "Loading Python…" : "Running…"}</>
          ) : (
            <><Play className="w-3.5 h-3.5" /> Run {activeFile?.path ?? ""}</>
          )}
        </button>
        {runState === "running" && (
          <button
            onClick={() => jsRunner.stop()}
            className="px-3 h-9 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-rose-700"
          >
            <Square className="w-3 h-3" /> Stop
          </button>
        )}
        <div className="text-[10px] text-gray-500 ml-auto flex items-center gap-1">
          <Terminal className="w-3 h-3" />
          {activeLanguage === "python" && "Pyodide (Python 3.11 in WASM)"}
          {activeLanguage === "javascript" && "JavaScript (Web Worker sandbox)"}
          {activeLanguage === "typescript" && "TypeScript (runs as JS — no type check)"}
          {(activeLanguage !== "python" && activeLanguage !== "javascript" && activeLanguage !== "typescript") && `Unsupported: ${activeLanguage}`}
        </div>
      </div>

      {/* Output panel */}
      <div className="bg-black border-t border-gray-800 px-3 py-2.5 max-h-64 overflow-y-auto flex-shrink-0">
        <p className="text-[10px] font-bold uppercase text-gray-500 mb-1.5 flex items-center gap-1">
          <Terminal className="w-3 h-3" /> Output
        </p>
        <pre className="text-xs font-mono text-emerald-200 whitespace-pre-wrap">
          {runOutput || <span className="text-gray-600">Run your code to see output…</span>}
        </pre>
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-rose-900/90 text-rose-100 px-4 py-2.5 rounded-lg shadow-lg max-w-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-300 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* New file modal */}
      {showNewFile && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowNewFile(false)}
        >
          <div
            className="bg-gray-800 rounded-2xl border border-gray-700 p-4 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
              <FileCode2 className="w-4 h-4 text-emerald-400" /> New file
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Enter the file path. The language is detected from the extension:
              <code className="text-emerald-400">.py</code>,{" "}
              <code className="text-emerald-400">.js</code>,{" "}
              <code className="text-emerald-400">.ts</code>,{" "}
              <code className="text-emerald-400">.sql</code>,{" "}
              <code className="text-emerald-400">.md</code>,{" "}
              <code className="text-emerald-400">.json</code>
            </p>
            <input
              type="text"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addNewFile(); }}
              placeholder="e.g. src/utils.py"
              autoFocus
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={addNewFile}
                disabled={!newFilePath.trim()}
                className="flex-1 h-9 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => setShowNewFile(false)}
                className="px-3 h-9 rounded-lg bg-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
