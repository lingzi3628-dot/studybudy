"use client";

/**
 * WebDesignScreen — Phase 12
 *
 * VISUAL web design interface — NOT code-first like WebBuilder.
 *
 * The difference:
 *   WebBuilder = AI chat → code editor → preview (developer workflow)
 *   WebDesign = component library → drag-drop canvas → properties panel → AI guide (designer workflow)
 *
 * Layout:
 *   ┌──────────┬────────────────┬──────────┐
 *   │ COMPONENT │   LIVE CANVAS   │ PROPERTIES│
 *   │ LIBRARY  │  (drag-drop)   │  PANEL   │
 *   │          │                 │          │
 *   │ Headers  │  [Navbar]       │ Colors   │
 *   │ Forms    │  [Hero]         │ Typography│
 *   │ Cards    │  [Features]     │ Spacing  │
 *   │ CTAs     │  [Footer]       │ Effects  │
 *   └──────────┴────────────────┴──────────┘
 *
 * Features:
 *   - Click a component → inserts it into the canvas
 *   - Properties panel: change colors, fonts, spacing in real-time
 *   - AI chat bar at bottom: "make the hero section blue" → AI modifies code
 *   - Templates: start from a pre-built design
 *   - Fork from Explore: import existing projects
 *   - Responsive preview: toggle mobile/tablet/desktop
 *   - Export: download as HTML/CSS/JS zip
 *
 * When a student tells the AI Tutor "I want to learn web design", the AI
 * opens THIS screen (not the WebBuilder) via computer_workspace with
 * workspace: "design".
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft, Loader2, Save, CheckCircle2, X, AlertCircle, Plus,
  Globe, Send, Monitor, Tablet, Smartphone, RefreshCw, Download,
  LayoutTemplate, MessageSquare, Code2, Eye, Trash2,
  Palette, Type, Move, Sparkles, Layers, Wand2,
} from "lucide-react";
import { useApp } from "../store";
import { WEB_COMPONENTS, COMPONENT_CATEGORIES } from "@/lib/web-components";
import { WEB_TEMPLATES } from "@/lib/web-templates";
import { buildPreviewDocument, isPreviewable, type PreviewFile } from "@/lib/web-preview";

type ProjectFile = { id: string; path: string; language: string; content: string; isEntry: boolean };
type Project = { id: string; buddyId: string; title: string; description: string | null; tags: string[]; conversationId: string | null; files: ProjectFile[] };
type ChatMsg = { role: "user" | "assistant"; text: string; files?: number };

const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Design</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; }
  </style>
</head>
<body>
  <!-- Components will be inserted here -->
</body>
</html>`;

const STARTER_CSS = `/* Design system — change these to re-theme the entire site */
:root {
  --primary: #6366F1;
  --primary-dark: #4F46E5;
  --bg: #FFFFFF;
  --text: #1F2937;
  --text-light: #6B7280;
  --border: #E5E7EB;
  --radius: 12px;
}`;

const STARTER_JS = `// Your JavaScript here
console.log("Web Design Studio ready!");`;

export function WebDesignScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState("index.html");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Component library state
  const [componentCategory, setComponentCategory] = useState("all");
  const [showCode, setShowCode] = useState(false); // toggle between visual + code view

  // Preview state
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  // Properties panel state
  const [primaryColor, setPrimaryColor] = useState("#6366F1");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [textColor, setTextColor] = useState("#1F2937");
  const [fontFamily, setFontFamily] = useState("system-ui");

  // AI chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // ---------- load project ----------
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
      const starter: ProjectFile[] = [
        { id: "temp-0", path: "index.html", language: "html", content: STARTER_HTML, isEntry: true },
        { id: "temp-1", path: "styles.css", language: "css", content: STARTER_CSS, isEntry: false },
        { id: "temp-2", path: "app.js", language: "javascript", content: STARTER_JS, isEntry: false },
      ];
      setProject({ id: "temp-" + Date.now(), buddyId: "web", title: "Untitled design", description: null, tags: [], conversationId: null, files: starter });
      setFiles(starter);
      setActiveFilePath("index.html");
      setLoading(false);
    }
  }, [activeProjectId]);

  // ---------- save ----------
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

  // ---------- component insertion ----------
  const insertComponent = (componentHtml: string) => {
    const htmlFile = files.find((f) => f.path === "index.html");
    if (htmlFile) {
      let newContent = htmlFile.content;
      if (newContent.includes("</body>")) {
        newContent = newContent.replace("</body>", `${componentHtml}\n</body>`);
      } else {
        newContent += "\n" + componentHtml;
      }
      updateFileContent("index.html", newContent);
    }
  };

  // ---------- template loading ----------
  const loadTemplate = (templateId: string) => {
    const t = WEB_TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    const newFiles: ProjectFile[] = t.files.map((f, i) => ({
      id: `temp-${i}-${Date.now()}`,
      path: f.path,
      language: f.path.endsWith(".css") ? "css" : f.path.endsWith(".js") ? "javascript" : "html",
      content: f.content,
      isEntry: f.path === "index.html" || i === 0,
    }));
    setFiles(newFiles);
    setActiveFilePath("index.html");
    setProject((p) => p ? { ...p, title: t.name } : p);
    setDirty(true);
  };

  // ---------- theme update ----------
  const applyTheme = () => {
    const cssFile = files.find((f) => f.path === "styles.css");
    if (cssFile) {
      const themeCss = `:root {
  --primary: ${primaryColor};
  --primary-dark: ${primaryColor};
  --bg: ${bgColor};
  --text: ${textColor};
  --border: #E5E7EB;
  --radius: 12px;
}
body { font-family: ${fontFamily}; background: var(--bg); color: var(--text); }`;
      updateFileContent("styles.css", themeCss);
    }

    // Also update inline styles in the HTML
    const htmlFile = files.find((f) => f.path === "index.html");
    if (htmlFile) {
      let html = htmlFile.content;
      // Replace color values in inline styles
      html = html.replace(/#6366F1/gi, primaryColor);
      html = html.replace(/#1F2937/gi, textColor);
      html = html.replace(/#FFFFFF/gi, bgColor);
      updateFileContent("index.html", html);
    }
  };

  // ---------- preview ----------
  const refreshPreview = useCallback(() => {
    const previewFiles: PreviewFile[] = files.map((f) => ({ path: f.path, content: f.content }));
    setPreviewDoc(buildPreviewDocument(previewFiles) ?? null);
  }, [files]);

  useEffect(() => {
    const t = setTimeout(refreshPreview, 500);
    return () => clearTimeout(t);
  }, [files, refreshPreview]);

  // ---------- AI chat ----------
  const sendChat = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
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
        body: JSON.stringify({
          message: text,
          buddyId: "web",
          conversationId: project?.conversationId ?? null,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
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
            // Auto-load code into editor as it streams
            const liveExtracted = extractCodeFilesLive(accumulated);
            if (liveExtracted.length > 0) {
              setFiles((prev) => {
                const next = [...prev];
                for (const f of liveExtracted) {
                  const idx = next.findIndex((p) => p.path === f.path);
                  if (idx >= 0) next[idx] = { ...next[idx], content: f.content };
                  else next.push({ id: `temp-${Date.now()}`, path: f.path, language: f.language, content: f.content, isEntry: f.path === "index.html" });
                }
                return next;
              });
            }
          } else if (evType === "done") {
            setMessages((m) => [...m, { role: "assistant", text: data.reply ?? accumulated }]);
            setStreamBuf("");
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages((m) => [...m, { role: "assistant", text: `Error: ${e?.message ?? e}` }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, project?.conversationId]);

  // Simple code extractor for live streaming
  function extractCodeFilesLive(text: string): Array<{ path: string; language: string; content: string }> {
    const re = /```(\w+)(?:\s+path="([^"]+)")?[^`\n]*\n([\s\S]*?)```/g;
    const files: Array<{ path: string; language: string; content: string }> = [];
    let match;
    while ((match = re.exec(text)) !== null) {
      const lang = match[1];
      const path = match[2] || (lang === "html" ? "index.html" : lang === "css" ? "styles.css" : lang === "javascript" || lang === "js" ? "app.js" : `main.${lang}`);
      files.push({ path, language: lang, content: match[3].trimEnd() });
    }
    return files;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
      </div>
    );
  }

  const filteredComponents = componentCategory === "all"
    ? WEB_COMPONENTS
    : WEB_COMPONENTS.filter(c => c.category === componentCategory);

  const activeFile = files.find(f => f.path === activeFilePath);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 bg-gray-950 border-b border-gray-800 flex-shrink-0">
        <button onClick={() => setScreen("home")} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <input
          type="text"
          value={project?.title ?? ""}
          onChange={(e) => setProject(p => p ? { ...p, title: e.target.value } : p)}
          className="bg-transparent text-sm font-bold text-white outline-none border-b border-transparent focus:border-amber-500 px-1"
        />
        {dirty && <span className="text-[10px] text-amber-400">●</span>}
        {savedAt && <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Saved</span>}
        <div className="flex-1" />
        {/* Templates */}
        <button onClick={() => {
          const choice = prompt("Choose a template:\n" + WEB_TEMPLATES.map(t => `  ${t.emoji} ${t.id} — ${t.name}`).join("\n") + "\n\nEnter template ID:");
          if (choice?.trim()) loadTemplate(choice.trim());
        }} className="px-2.5 h-8 rounded-full bg-gray-800 text-gray-300 text-xs font-semibold items-center gap-1 hover:bg-gray-700 hidden md:flex">
          <LayoutTemplate className="w-3.5 h-3.5" /> Templates
        </button>
        {/* Save */}
        <button onClick={saveProject} disabled={saving} className="px-2.5 h-8 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center gap-1 hover:bg-amber-500 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </header>

      {/* Main layout: 3 panels */}
      <div className="flex-1 min-h-0 flex">

        {/* LEFT: Component Library */}
        <div className="w-56 flex-col border-r border-gray-800 bg-gray-950 overflow-y-auto hidden md:flex flex-shrink-0">
          <div className="p-2 border-b border-gray-800">
            <span className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1">
              <Layers className="w-3 h-3" /> Components
            </span>
          </div>
          {/* Category filter */}
          <div className="p-2 flex flex-wrap gap-1 border-b border-gray-800">
            <button onClick={() => setComponentCategory("all")}
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${componentCategory === "all" ? "bg-amber-600 text-white" : "bg-gray-800 text-gray-400"}`}>
              All
            </button>
            {COMPONENT_CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setComponentCategory(cat.id)}
                className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${componentCategory === cat.id ? "bg-amber-600 text-white" : "bg-gray-800 text-gray-400"}`}>
                {cat.emoji}
              </button>
            ))}
          </div>
          {/* Component list */}
          <div className="p-2 space-y-1 flex-1 overflow-y-auto">
            {filteredComponents.map(comp => (
              <button key={comp.id} onClick={() => insertComponent(comp.html)}
                className="w-full text-left p-2 rounded-lg hover:bg-gray-800 transition group border border-transparent hover:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{comp.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-200 truncate">{comp.name}</div>
                    <div className="text-[9px] text-gray-500 truncate">{comp.description}</div>
                  </div>
                  <Plus className="w-3 h-3 text-gray-600 group-hover:text-amber-500 opacity-0 group-hover:opacity-100" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: Canvas / Preview */}
        <div className="flex-1 min-h-0 flex flex-col bg-gray-100">
          {/* Device toggle */}
          <div className="flex items-center gap-1 px-3 py-1.5 bg-white border-b border-gray-200 flex-shrink-0">
            <span className="text-[10px] font-bold uppercase text-gray-400 mr-2">Preview</span>
            {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([id, Icon]) => (
              <button key={id} onClick={() => setDevice(id)}
                className={`p-1.5 rounded ${device === id ? "bg-gray-900 text-white" : "text-gray-400 hover:bg-gray-100"}`}>
                <Icon className="w-4 h-4" />
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={() => setShowCode(!showCode)}
              className={`px-2 py-1.5 rounded text-xs font-semibold flex items-center gap-1 ${showCode ? "bg-gray-900 text-white" : "text-gray-400 hover:bg-gray-100"}`}
              title="Toggle split code/preview view">
              <Code2 className="w-4 h-4" /> {showCode ? "Visual" : "Split"}
            </button>
            <button onClick={refreshPreview} className="p-1.5 rounded text-gray-400 hover:bg-gray-100" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Canvas — bi-directional: code edits live-update preview */}
          <div className="flex-1 overflow-auto p-4 flex justify-center gap-2">
            {/* Code editor (when showCode is on, show SIDE BY SIDE with preview — not toggle) */}
            {showCode && activeFile && (
              <div className="w-[45%] flex-shrink-0 rounded-lg overflow-hidden border border-gray-700 shadow-xl">
                <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between border-b border-gray-700">
                  <div className="flex items-center gap-1">
                    {files.map((f) => (
                      <button key={f.id} onClick={() => setActiveFilePath(f.path)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${activeFilePath === f.path ? "bg-amber-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}>
                        {f.isEntry && "★ "}{f.path}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowCode(false)} className="text-gray-400 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <textarea
                  value={activeFile.content}
                  onChange={(e) => updateFileContent(activeFilePath, e.target.value)}
                  className="w-full h-[60vh] p-4 font-mono text-xs bg-gray-900 text-gray-100 resize-none focus:outline-none"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    // Tab key inserts 2 spaces instead of changing focus
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const start = e.currentTarget.selectionStart;
                      const end = e.currentTarget.selectionEnd;
                      const newValue = activeFile.content.substring(0, start) + "  " + activeFile.content.substring(end);
                      updateFileContent(activeFilePath, newValue);
                      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                    }
                  }}
                />
              </div>
            )}

            {/* Preview — always visible, updates in real-time as code changes */}
            <div className={`bg-white shadow-2xl transition-all duration-300 ${
              showCode ? "w-[52%]" : "w-full max-w-[1200px]"
            } ${
              device === "mobile" ? "!w-[375px]" : device === "tablet" ? "!w-[768px]" : ""
            }`}>
              <iframe
                srcDoc={previewDoc ?? "<html><body style='display:flex;align-items:center;justify-content:center;height:100vh;color:#999;font-family:sans-serif;'>Loading…</body></html>"}
                className="w-full border-0"
                style={{ minHeight: "60vh" }}
                sandbox="allow-scripts allow-forms allow-popups"
                title="Design Preview"
              />
            </div>
          </div>

          {/* AI Chat bar at bottom */}
          <div className="border-t border-gray-200 bg-white p-2 flex items-center gap-2 flex-shrink-0">
            <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="Ask AI to modify your design (e.g. 'make the hero section blue')…"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-amber-400"
              disabled={streaming}
            />
            <button onClick={() => sendChat()} disabled={streaming || !input.trim()}
              className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0">
              {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Chat messages (collapsible, above the input) */}
          {(messages.length > 0 || streamBuf) && (
            <div className="max-h-32 overflow-y-auto bg-gray-50 border-t border-gray-200 p-2 space-y-1 flex-shrink-0">
              {messages.map((m, i) => (
                <div key={i} className={`text-xs ${m.role === "user" ? "text-amber-700 font-semibold" : "text-gray-600"}`}>
                  <span className="font-bold">{m.role === "user" ? "You: " : "AI: "}</span>
                  <span className="line-clamp-2">{m.text.slice(0, 300)}</span>
                </div>
              ))}
              {streamBuf && (
                <div className="text-xs text-gray-500">
                  <span className="font-bold">AI: </span>
                  <span className="line-clamp-3">{streamBuf.slice(0, 300)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Properties Panel */}
        <div className="w-56 flex-col border-l border-gray-800 bg-gray-950 overflow-y-auto hidden md:flex flex-shrink-0">
          <div className="p-2 border-b border-gray-800">
            <span className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1">
              <Palette className="w-3 h-3" /> Design System
            </span>
          </div>

          {/* Colors */}
          <div className="p-3 space-y-3 border-b border-gray-800">
            <div className="text-[10px] font-bold uppercase text-gray-400">Colors</div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 flex-1">Primary</label>
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent" />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 flex-1">Background</label>
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent" />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 flex-1">Text</label>
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent" />
            </div>

            <button onClick={applyTheme}
              className="w-full py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-500 flex items-center justify-center gap-1">
              <Wand2 className="w-3 h-3" /> Apply Theme
            </button>
          </div>

          {/* Typography */}
          <div className="p-3 space-y-3 border-b border-gray-800">
            <div className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
              <Type className="w-3 h-3" /> Typography
            </div>

            <select value={fontFamily} onChange={(e) => { setFontFamily(e.target.value); }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
              <option value="system-ui">System UI (default)</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Georgia, serif">Georgia (serif)</option>
              <option value="'Courier New', monospace">Courier (mono)</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Verdana, sans-serif">Verdana</option>
            </select>

            <button onClick={applyTheme}
              className="w-full py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700 flex items-center justify-center gap-1">
              <Type className="w-3 h-3" /> Apply Font
            </button>
          </div>

          {/* File list — only shown when NOT in split mode */}
          {!showCode && (
          <div className="p-2 flex-1">
            <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Files</div>
            {files.map((f) => (
              <button key={f.id} onClick={() => { setActiveFilePath(f.path); setShowCode(true); }}
                className={`w-full text-left px-2 py-1 rounded text-xs ${activeFilePath === f.path ? "bg-gray-800 text-amber-400" : "text-gray-400 hover:bg-gray-800"}`}>
                {f.isEntry && "★ "}{f.path}
              </button>
            ))}
          </div>
          )}

          {/* Quick tips */}
          <div className="p-2 border-t border-gray-800">
            <div className="text-[9px] text-gray-500 space-y-0.5">
              <p>💡 Click a component on the left to add it</p>
              <p>🎨 Change colors → click "Apply Theme"</p>
              <p>💬 Ask AI to modify your design</p>
              <p>📱 Toggle device sizes above</p>
            </div>
          </div>

          {/* Phase 12 — AI Design Suggestions */}
          <DesignSuggestions
            htmlContent={files.find(f => f.path === "index.html")?.content ?? ""}
            primaryColor={primaryColor}
            bgColor={bgColor}
            textColor={textColor}
          />
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
    </div>
  );
}

// ============================================================
// Phase 12 — DesignSuggestions
// Analyzes the current HTML + color choices and shows real-time
// design feedback: contrast warnings, missing elements, responsive tips.
// ============================================================
function DesignSuggestions({
  htmlContent,
  primaryColor,
  bgColor,
  textColor,
}: {
  htmlContent: string;
  primaryColor: string;
  bgColor: string;
  textColor: string;
}) {
  const suggestions: Array<{ type: "warning" | "info" | "success"; text: string }> = [];

  // 1. Contrast check — WCAG AA requires 4.5:1 for text
  const contrast = getContrastRatio(textColor, bgColor);
  if (contrast < 4.5) {
    suggestions.push({
      type: "warning",
      text: `Text contrast is ${contrast.toFixed(1)}:1 — WCAG AA requires 4.5:1. Darken text color or lighten background.`,
    });
  } else if (contrast >= 7) {
    suggestions.push({ type: "success", text: `Text contrast is ${contrast.toFixed(1)}:1 — AAA compliant ✓` });
  }

  // 2. Check for missing elements
  if (!htmlContent.includes("<nav") && !htmlContent.includes("<header")) {
    suggestions.push({ type: "info", text: "No navigation bar detected. Add one from the Components panel → Headers." });
  }
  if (!htmlContent.includes("<footer")) {
    suggestions.push({ type: "info", text: "No footer detected. Add one from Components panel → Footer." });
  }
  if (!htmlContent.includes("<h1")) {
    suggestions.push({ type: "info", text: "No H1 heading found. Add a hero section for your main headline." });
  }
  if (!htmlContent.includes("<form") && !htmlContent.includes("input")) {
    suggestions.push({ type: "info", text: "No form or input found. Consider adding a contact form or newsletter signup." });
  }

  // 3. Responsive check
  if (htmlContent.includes("width: ") && !htmlContent.includes("max-width")) {
    suggestions.push({ type: "warning", text: "Fixed-width elements detected. Use max-width + percentage for responsive design." });
  }
  if (!htmlContent.includes("viewport") && htmlContent.includes("<html")) {
    suggestions.push({ type: "warning", text: "No viewport meta tag found. Mobile devices won't render correctly." });
  }

  // 4. Image alt text check
  const imgCount = (htmlContent.match(/<img /g) ?? []).length;
  const altCount = (htmlContent.match(/alt=["']/g) ?? []).length;
  if (imgCount > altCount) {
    suggestions.push({ type: "warning", text: `${imgCount - altCount} image(s) missing alt text — important for accessibility + SEO.` });
  }

  // 5. Empty canvas
  if (htmlContent.replace(/<[^>]*>/g, "").trim().length < 20) {
    suggestions.push({ type: "info", text: "Your canvas is empty. Click a component on the left to start building!" });
  }

  if (suggestions.length === 0) {
    suggestions.push({ type: "success", text: "Design looks good! No issues detected." });
  }

  return (
    <div className="p-2 border-t border-gray-800">
      <div className="text-[10px] font-bold uppercase text-gray-400 mb-1 flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-amber-500" /> AI Design Check
      </div>
      <div className="space-y-1">
        {suggestions.slice(0, 5).map((s, i) => (
          <div key={i} className={`text-[9px] leading-tight p-1.5 rounded ${
            s.type === "warning" ? "bg-amber-900/30 text-amber-300" :
            s.type === "success" ? "bg-emerald-900/30 text-emerald-300" :
            "bg-blue-900/30 text-blue-300"
          }`}>
            {s.type === "warning" ? "⚠️ " : s.type === "success" ? "✅ " : "💡 "}
            {s.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper — calculate WCAG contrast ratio between two hex colors
function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getLuminance(hex: string): number {
  // Parse hex color (#RRGGBB) to RGB
  const hex2 = hex.replace("#", "");
  if (hex2.length !== 6) return 0.5; // fallback
  const r = parseInt(hex2.slice(0, 2), 16) / 255;
  const g = parseInt(hex2.slice(2, 4), 16) / 255;
  const b = parseInt(hex2.slice(4, 6), 16) / 255;
  // WCAG luminance formula
  const linearR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const linearG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const linearB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
}
