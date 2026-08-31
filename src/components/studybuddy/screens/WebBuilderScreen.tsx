"use client";

/**
 * WebBuilderScreen — Phase 54 (WebBuddy)
 *
 * Three-pane website builder fulfilling the Phase 47 web.ts stub promise:
 *
 *   ┌───────────┬───────────────┬──────────────────┐
 *   │ CHAT      │ CODE          │ LIVE PREVIEW     │
 *   │ WebBuddy  │ file tabs +   │ iframe srcdoc +  │
 *   │ (SSE      │ CodeEditor    │ device toggles + │
 *   │  stream)  │ (Phase 48)    │ console panel    │
 *   └───────────┴───────────────┴──────────────────┘
 *
 * Features:
 *   - Prompt → site: chat with WebBuddy (buddyId "web", /api/tutor/chat/stream).
 *     Assistant replies containing path="..."-annotated blocks get a
 *     "Load into editor" button (extractCodeFiles from Phase 48).
 *   - Templates: 8 one-tap starter sites (src/lib/web-templates.ts).
 *   - Multi-file editing, Save to Project (buddyId "web"), entry = index.html.
 *   - Live preview: src/lib/web-preview.ts inlines local css/js into one
 *     document + injects a console bridge (console.* + errors → parent).
 *   - Download ZIP: GET /api/projects/[id]/export.
 *   - Deploy: POST /api/deploy/vercel with the user's own token (BYOT —
 *     the token is used once and never stored).
 *
 * Mobile: segmented control switches chat / code / preview.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft, Loader2, Save, CheckCircle2, X, AlertCircle, Plus,
  Globe, Send, Monitor, Tablet, Smartphone, RefreshCw, Download,
  Rocket, LayoutTemplate, MessageSquare, Code2, Eye, Trash2,
} from "lucide-react";
import { useApp } from "../store";
import { CodeEditor, detectLanguageFromPath, type CodeLanguage } from "./CodeEditor";
import { extractCodeFiles } from "@/lib/code-extract";
import { buildPreviewDocument, isPreviewable, type PreviewFile } from "@/lib/web-preview";
import { WEB_TEMPLATES } from "@/lib/web-templates";

type ProjectFile = { id: string; path: string; language: string; content: string; isEntry: boolean };
type Project = { id: string; buddyId: string; title: string; description: string | null; tags: string[]; conversationId: string | null; files: ProjectFile[] };

type ChatMsg = { role: "user" | "assistant"; text: string; files?: number };
type ConsoleEntry = { level: string; text: string; at: number };
type Device = "mobile" | "tablet" | "desktop";

const DEVICE_WIDTHS: Record<Device, string> = { mobile: "375px", tablet: "768px", desktop: "100%" };

const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Site</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="container">
    <h1>Hello 👋</h1>
    <p>Edit me in the editor, or tell WebBuddy what to build.</p>
  </main>
  <script src="app.js"></script>
</body>
</html>`;

const STARTER_CSS = `:root { --primary: #f59e0b; --bg: #fffbeb; --text: #292524; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); display: flex;
  min-height: 100vh; align-items: center; justify-content: center; }
.container { text-align: center; padding: 40px 20px; }
h1 { font-size: 40px; color: var(--primary); }`;

const STARTER_JS = `console.log("Welcome to WebBuddy! Edit app.js and watch the console below.");`;

export function WebBuilderScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Preview state
  const [device, setDevice] = useState<Device>("mobile");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [showConsole, setShowConsole] = useState(false);

  // Deploy modal
  const [showDeploy, setShowDeploy] = useState(false);
  const [deployToken, setDeployToken] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ url: string | null; note: string } | null>(null);

  // Templates modal
  const [showTemplates, setShowTemplates] = useState(false);

  // Mobile pane switcher
  const [pane, setPane] = useState<"chat" | "code" | "preview">("chat");

  // ---------- project load / save (mirrors DevBuddyScreen) ----------
  useEffect(() => {
    if (activeProjectId) {
      setLoading(true);
      fetch(`/api/projects/${activeProjectId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          const p = d.project;
          if (!p) throw new Error("Project not found");
          setProject(p);
          setFiles(p.files ?? []);
          setActiveFilePath(p.files.find((f: ProjectFile) => f.isEntry)?.path ?? p.files[0]?.path ?? "");
        })
        .catch((e) => setError(e?.message ?? "Failed to load project"))
        .finally(() => setLoading(false));
    } else {
      // New project from scratch
      const starter: ProjectFile[] = [
        { id: "temp-0", path: "index.html", language: "html", content: STARTER_HTML, isEntry: true },
        { id: "temp-1", path: "styles.css", language: "css", content: STARTER_CSS, isEntry: false },
        { id: "temp-2", path: "app.js", language: "javascript", content: STARTER_JS, isEntry: false },
      ];
      setProject({ id: "temp-" + Date.now(), buddyId: "web", title: "Untitled website", description: null, tags: [], conversationId: null, files: starter });
      setFiles(starter);
      setActiveFilePath("index.html");
      setLoading(false);
    }
  }, [activeProjectId]);

  const saveProject = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      let projectId = project.id;
      const payload = {
        files: files.map((f) => ({ path: f.path, language: f.language, content: f.content, isEntry: f.isEntry })),
      };
      if (project.id.startsWith("temp-")) {
        const createRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buddyId: "web", title: project.title, description: project.description, tags: project.tags, ...payload }),
        });
        if (!createRes.ok) throw new Error(`Create failed: HTTP ${createRes.status}`);
        const created = await createRes.json();
        projectId = created.project.id;
        setProject((p) => (p ? { ...p, id: projectId } : p));
        setActiveProjectId(projectId);
      } else {
        const updateRes = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!updateRes.ok) throw new Error(`Save failed: HTTP ${updateRes.status}`);
      }
      setDirty(false);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [project, files, setActiveProjectId]);

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
    setDirty(true);
  }, []);

  const addFile = () => {
    const path = prompt("New file path (e.g. about.html, styles.css):")?.trim();
    if (!path) return;
    if (files.some((f) => f.path === path)) { setError(`File already exists: ${path}`); return; }
    setFiles((prev) => [...prev, { id: `temp-${Date.now()}`, path, language: detectLanguageFromPath(path) as string, content: "", isEntry: false }]);
    setActiveFilePath(path);
    setDirty(true);
  };

  const deleteFile = (path: string) => {
    const file = files.find((f) => f.path === path);
    if (file?.isEntry) { setError("The entry file (index.html) can't be deleted."); return; }
    if (!confirm(`Delete ${path}?`)) return;
    setFiles((prev) => prev.filter((f) => f.path !== path));
    if (activeFilePath === path) setActiveFilePath(files.find((f) => f.path !== path)?.path ?? "");
    setDirty(true);
  };

  const loadTemplate = (id: string) => {
    const t = WEB_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const loaded: ProjectFile[] = t.files.map((f, i) => ({
      id: `temp-t${i}-${Date.now()}`,
      path: f.path,
      language: detectLanguageFromPath(f.path) as string,
      content: f.content,
      isEntry: !!f.isEntry,
    }));
    setFiles(loaded);
    setProject((p) => (p ? { ...p, title: t.name } : p));
    setActiveFilePath(loaded.find((f) => f.isEntry)?.path ?? loaded[0].path);
    setDirty(true);
    setShowTemplates(false);
    setPane("preview");
  };

  // ---------- preview ----------
  const refreshPreview = useCallback(() => {
    setPreviewDoc(buildPreviewDocument(files as PreviewFile[]));
  }, [files]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setTimeout(refreshPreview, 700);
    return () => clearTimeout(t);
  }, [files, autoRefresh, refreshPreview]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (d && typeof d === "object" && d.__webbuddyPreview) {
        setConsoleEntries((prev) => [...prev.slice(-80), { level: d.level, text: d.text, at: Date.now() }]);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ---------- chat with WebBuddy ----------
  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setStreaming(true);
    setStreamBuf("");
    const ac = new AbortController();
    abortRef.current = ac;
    let accumulated = "";
    try {
      const res = await fetch("/api/tutor/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, buddyId: "web", conversationId: project?.conversationId ?? null }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const evType = ev.match(/^event: (.+)$/m)?.[1];
          const dataLine = ev.match(/^data: (.+)$/m)?.[1];
          if (!evType || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (evType === "delta") {
            accumulated += data.text ?? "";
            setStreamBuf(accumulated);
          } else if (evType === "done") {
            const extracted = extractCodeFiles(accumulated);
            setMessages((m) => [...m, { role: "assistant", text: data.reply ?? accumulated, files: extracted?.length ?? 0 }]);
            setStreamBuf("");
          } else if (evType === "error") {
            throw new Error(data.error ?? "AI error");
          }
        }
      }
      if (accumulated && !messages.some((m) => m.role === "assistant" && m.text === (streamBuf || accumulated))) {
        // Stream ended without a done event — still show the reply.
        const extracted = extractCodeFiles(accumulated);
        setMessages((m) => [...m, { role: "assistant", text: accumulated, files: extracted?.length ?? 0 }]);
        setStreamBuf("");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${e?.message ?? "Chat failed. Try again."}` }]);
        setStreamBuf("");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, project?.conversationId, messages, streamBuf]);

  const loadReplyIntoEditor = useCallback((replyText: string) => {
    const extracted = extractCodeFiles(replyText);
    if (!extracted || extracted.length === 0) return;
    const loaded: ProjectFile[] = extracted.map((f, i) => ({
      id: `temp-x${i}-${Date.now()}`,
      path: f.path,
      language: f.language,
      content: f.content,
      isEntry: /(^|\/)index\.html$/i.test(f.path) || (i === 0 && extracted.length === 1 && f.path.endsWith(".html")),
    }));
    // Merge: replace files with the same path, keep the rest.
    setFiles((prev) => {
      const next = [...prev];
      for (const f of loaded) {
        const idx = next.findIndex((x) => x.path === f.path);
        if (idx >= 0) next[idx] = { ...f, isEntry: next[idx].isEntry || f.isEntry };
        else next.push(f);
      }
      if (!next.some((f) => f.isEntry)) {
        const htmlIdx = next.findIndex((f) => f.path.toLowerCase().endsWith(".html"));
        if (htmlIdx >= 0) next[htmlIdx] = { ...next[htmlIdx], isEntry: true };
      }
      return next;
    });
    setDirty(true);
    setPane("preview");
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuf]);

  // ---------- deploy ----------
  const deployToVercel = useCallback(async () => {
    if (!project) return;
    setDeploying(true);
    setDeployResult(null);
    setError(null);
    try {
      // Save first so we deploy the latest files.
      await saveProject();
      const projectId = project.id.startsWith("temp-")
        ? (await fetch("/api/projects").then((r) => r.json()).catch(() => null), project.id)
        : project.id;
      const res = await fetch("/api/deploy/vercel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, token: deployToken.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Deploy failed: HTTP ${res.status}`);
      setDeployResult({ url: data.url ?? null, note: data.note ?? "" });
    } catch (e: any) {
      setError(e?.message ?? "Deploy failed");
    } finally {
      setDeploying(false);
    }
  }, [project, deployToken, saveProject]);

  const downloadZip = useCallback(async () => {
    if (!project) return;
    try {
      await saveProject();
      if (project.id.startsWith("temp-")) { setError("Save the project first, then download the ZIP."); return; }
      const res = await fetch(`/api/projects/${project.id}/export`);
      if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "site"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(e?.message ?? "Download failed");
    }
  }, [project, saveProject]);

  // ---------- render helpers ----------
  const activeFile = files.find((f) => f.path === activeFilePath);
  const activeLanguage: CodeLanguage = activeFile ? (detectLanguageFromPath(activeFile.path) as CodeLanguage) : "text";
  const previewable = isPreviewable(files as PreviewFile[]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        <span className="ml-2 text-sm">Loading website…</span>
      </div>
    );
  }

  const chatPane = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-6 px-2">
            <Globe className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="mt-2 text-sm text-gray-300 font-semibold">Describe your website</p>
            <p className="text-xs text-gray-500 mt-1">WebBuddy generates real HTML/CSS/JS files you can edit and deploy. Or start from a template.</p>
            <button onClick={() => setShowTemplates(true)} className="mt-3 text-xs text-amber-400 hover:underline inline-flex items-center gap-1">
              <LayoutTemplate className="w-3.5 h-3.5" /> Browse templates
            </button>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap ${m.role === "user" ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-100"}`}>
              {m.text.length > 400 ? m.text.slice(0, 400) + "…" : m.text}
              {m.role === "assistant" && !!m.files && m.files > 0 && (
                <button
                  onClick={() => loadReplyIntoEditor(m.text)}
                  className="mt-2 block w-full text-left bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-semibold rounded-lg px-2 py-1.5"
                >
                  ⬇ Load {m.files} file{m.files > 1 ? "s" : ""} into editor
                </button>
              )}
            </div>
          </div>
        ))}
        {streaming && streamBuf && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-3 py-2 text-xs bg-gray-700 text-gray-300 whitespace-pre-wrap">
              {streamBuf.slice(-300) || "…"}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="p-2 border-t border-gray-700 flex-shrink-0">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="e.g. Build a landing page for my bakery…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
            disabled={streaming}
          />
          <button
            onClick={streaming ? () => abortRef.current?.abort() : sendChat}
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${streaming ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"} text-white`}
            aria-label={streaming ? "Stop" : "Send"}
          >
            {streaming ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  const codePane = (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-gray-800 border-b border-gray-700 px-2 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
        {files.map((f) => (
          <div
            key={f.path}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs cursor-pointer whitespace-nowrap ${activeFilePath === f.path ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"}`}
            onClick={() => setActiveFilePath(f.path)}
          >
            {f.isEntry && <span className="text-amber-400" title="Entry point">★</span>}
            <span>{f.path}</span>
            {!f.isEntry && (
              <button onClick={(e) => { e.stopPropagation(); deleteFile(f.path); }} className="text-gray-500 hover:text-rose-400 ml-1" aria-label={`Delete ${f.path}`}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addFile} className="flex-shrink-0 px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-700" aria-label="New file" title="New file">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden p-2 min-h-0">
        {activeFile ? (
          <CodeEditor value={activeFile.content} onChange={(v) => updateFileContent(activeFile.path, v)} language={activeLanguage} minHeight="100%" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Code2 className="w-10 h-10" />
            <p className="mt-2 text-sm">No file selected</p>
          </div>
        )}
      </div>
    </div>
  );

  const previewPane = (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-gray-800 border-b border-gray-700 px-2 py-1.5 flex items-center gap-1.5 flex-shrink-0 overflow-x-auto no-scrollbar">
        {(["mobile", "tablet", "desktop"] as Device[]).map((d) => (
          <button
            key={d}
            onClick={() => setDevice(d)}
            className={`p-1.5 rounded-md ${device === d ? "bg-amber-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}
            aria-label={`${d} preview`}
            title={d}
          >
            {d === "mobile" ? <Smartphone className="w-4 h-4" /> : d === "tablet" ? <Tablet className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </button>
        ))}
        <div className="w-px h-5 bg-gray-700 mx-0.5" />
        <button onClick={refreshPreview} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-700" aria-label="Refresh preview" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-amber-500" />
          auto
        </label>
        <button
          onClick={() => setShowConsole((s) => !s)}
          className={`ml-auto px-2 py-1 rounded-md text-[10px] flex items-center gap-1 ${consoleEntries.some((c) => c.level === "error") ? "text-rose-400" : "text-gray-400"} hover:bg-gray-700`}
        >
          Console {consoleEntries.length > 0 && `(${consoleEntries.length})`}
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-white overflow-hidden flex justify-center">
        {previewable ? (
          <iframe
            title="Website preview"
            srcDoc={previewDoc ?? buildPreviewDocument(files as PreviewFile[]) ?? ""}
            className="h-full border-0 bg-white"
            style={{ width: DEVICE_WIDTHS[device] }}
            sandbox="allow-scripts allow-forms allow-popups"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 text-xs text-center px-6">
            <Eye className="w-8 h-8" />
            <p className="mt-2">No HTML file to preview yet.</p>
            <p className="mt-1 text-gray-500">Ask WebBuddy to build a site, or load a template.</p>
          </div>
        )}
      </div>
      {showConsole && (
        <div className="bg-black border-t border-gray-800 px-3 py-2 h-32 overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold uppercase text-gray-500">Console</p>
            <button onClick={() => setConsoleEntries([])} className="text-gray-500 hover:text-gray-300" aria-label="Clear console">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {consoleEntries.length === 0 ? (
            <p className="text-[11px] text-gray-600">console.log output and errors appear here…</p>
          ) : (
            consoleEntries.map((c, i) => (
              <pre key={i} className={`text-[11px] font-mono whitespace-pre-wrap ${c.level === "error" ? "text-rose-300" : c.level === "warn" ? "text-amber-300" : "text-emerald-200"}`}>
                {c.text}
              </pre>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-3 h-14 flex items-center gap-2.5 flex-shrink-0">
        <button onClick={() => setScreen("projects")} aria-label="Back to projects" className="text-gray-300 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Globe className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <input
          type="text"
          value={project?.title ?? ""}
          onChange={(e) => setProject((p) => (p ? { ...p, title: e.target.value } : p))}
          onBlur={() => setDirty(true)}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-white outline-none border-b border-transparent focus:border-amber-500 transition"
          placeholder="Untitled website"
        />
        {dirty && <span className="text-[10px] text-amber-400 flex-shrink-0">●</span>}
        {savedAt && (
          <span className="text-[10px] text-emerald-400 flex-shrink-0 flex items-center gap-0.5">
            <CheckCircle2 className="w-3 h-3" /> Saved
          </span>
        )}
        <button
          onClick={() => setShowTemplates(true)}
          className="hidden md:flex px-2.5 h-8 rounded-full bg-gray-700 text-gray-200 text-xs font-semibold items-center gap-1 hover:bg-gray-600 flex-shrink-0"
          title="Start from a template"
        >
          <LayoutTemplate className="w-3.5 h-3.5" /> Templates
        </button>
        <button
          onClick={downloadZip}
          className="hidden md:flex px-2.5 h-8 rounded-full bg-gray-700 text-gray-200 text-xs font-semibold items-center gap-1 hover:bg-gray-600 flex-shrink-0"
          title="Download as ZIP"
        >
          <Download className="w-3.5 h-3.5" /> ZIP
        </button>
        <button
          onClick={() => { setDeployResult(null); setShowDeploy(true); }}
          className="px-3 h-8 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-violet-700 flex-shrink-0"
        >
          <Rocket className="w-3.5 h-3.5" /> Deploy
        </button>
        <button
          onClick={saveProject}
          disabled={saving}
          className="px-3 h-8 rounded-full bg-amber-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </header>

      {/* Mobile pane switcher */}
      <div className="md:hidden bg-gray-800 border-b border-gray-700 px-2 py-1.5 flex gap-1 flex-shrink-0">
        {([["chat", "Chat", MessageSquare], ["code", "Code", Code2], ["preview", "Preview", Eye]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setPane(id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold ${pane === id ? "bg-amber-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Three panes (desktop) / one pane (mobile) */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className={`flex-1 min-h-0 border-gray-700 md:max-w-[30%] md:border-r ${pane === "chat" ? "" : "hidden md:flex"} md:flex flex-col`}>
          {chatPane}
        </div>
        <div className={`flex-1 min-h-0 border-gray-700 md:max-w-[34%] md:border-r ${pane === "code" ? "" : "hidden md:flex"} md:flex flex-col`}>
          {codePane}
        </div>
        <div className={`flex-1 min-h-0 ${pane === "preview" ? "" : "hidden md:flex"} md:flex flex-col`}>
          {previewPane}
        </div>
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

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-gray-800 rounded-t-2xl md:rounded-2xl border border-gray-700 p-4 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
              <LayoutTemplate className="w-4 h-4 text-amber-400" /> Start from a template
            </h3>
            <p className="text-xs text-gray-400 mb-3">Real, working starter sites — load one, then edit or ask WebBuddy to customize it. Replaces the current files.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {WEB_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadTemplate(t.id)}
                  className="text-left bg-gray-900 border border-gray-700 hover:border-amber-500 rounded-xl p-3 transition"
                >
                  <div className="text-xl">{t.emoji}</div>
                  <div className="text-xs font-bold text-white mt-1">{t.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{t.description}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowTemplates(false)} className="mt-3 w-full h-9 rounded-lg bg-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Deploy modal */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowDeploy(false)}>
          <div className="bg-gray-800 rounded-t-2xl md:rounded-2xl border border-gray-700 p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
              <Rocket className="w-4 h-4 text-violet-400" /> Deploy to Vercel
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Deploys your saved files as a live static site. Paste a Vercel token
              (<span className="text-violet-400">vercel.com → Account → Tokens</span>). Your token is used once and <strong>never stored</strong>.
            </p>
            <input
              type="password"
              value={deployToken}
              onChange={(e) => setDeployToken(e.target.value)}
              placeholder="Paste your Vercel token…"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-violet-500"
              autoFocus
            />
            {deployResult && (
              <div className="mt-3 bg-violet-900/30 border border-violet-700 rounded-lg p-3 text-xs">
                {deployResult.url ? (
                  <>
                    <p className="font-semibold text-violet-200">🎉 {deployResult.note}</p>
                    <a href={deployResult.url} target="_blank" rel="noopener noreferrer" className="text-violet-300 underline break-all mt-1 block">
                      {deployResult.url}
                    </a>
                  </>
                ) : (
                  <p className="text-violet-200">{deployResult.note}</p>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={deployToVercel}
                disabled={deploying || !deployToken.trim()}
                className="flex-1 h-9 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {deploying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying…</> : <><Rocket className="w-3.5 h-3.5" /> Deploy site</>}
              </button>
              <button onClick={() => setShowDeploy(false)} className="px-3 h-9 rounded-lg bg-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-600">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
