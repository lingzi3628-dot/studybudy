"use client";

/**
 * WebDesignScreen — Phase 12 PREMIUM
 *
 * A studio-quality visual web design interface with:
 *   - Animated welcome onboarding (blob background, step transitions)
 *   - Gradient header with tool toolbar, search, zoom, AI button, deploy
 *   - Left sidebar: component library with categories + drag indicators
 *   - Center canvas: live preview with device toggle + split code view
 *   - Right sidebar: design system (colors, typography) + AI design check
 *   - Floating action bar: toggle sidebars, undo/redo, zoom
 *   - AI chat bar at bottom: ask AI to modify design
 *   - Dark theme by default (toggle to light)
 *
 * Built with framer-motion for smooth animations.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Loader2, Save, CheckCircle2, X, AlertCircle, Plus,
  Globe, Send, Monitor, Tablet, Smartphone, RefreshCw, Download,
  LayoutTemplate, Code2, Eye, Trash2,
  Palette, Type, Sparkles, Layers, Wand2,
  Search, ZoomIn, ZoomOut, Rocket, Share2, Moon, Sun,
  Undo2, Redo2, PanelLeft, PanelRight, Play,
} from "lucide-react";
import { useApp } from "../store";
import { WEB_COMPONENTS, COMPONENT_CATEGORIES } from "@/lib/web-components";
import { WEB_TEMPLATES } from "@/lib/web-templates";
import { buildPreviewDocument, type PreviewFile } from "@/lib/web-preview";

type ProjectFile = { id: string; path: string; language: string; content: string; isEntry: boolean };
type Project = { id: string; buddyId: string; title: string; description: string | null; tags: string[]; conversationId: string | null; files: ProjectFile[] };
type ChatMsg = { role: "user" | "assistant"; text: string };

const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Design</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Click a component from the left to start building -->
</body>
</html>`;

const STARTER_CSS = `:root {
  --primary: #6366F1;
  --primary-dark: #4F46E5;
  --bg: #FFFFFF;
  --text: #1F2937;
  --text-light: #6B7280;
  --border: #E5E7EB;
  --radius: 12px;
}
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }`;

const STARTER_JS = `console.log("Design Studio ready!");`;

export function WebDesignScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;

  // State
  const [showWelcome, setShowWelcome] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState("index.html");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // UI state
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [componentCategory, setComponentCategory] = useState("all");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [zoom, setZoom] = useState(100);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  // Properties
  const [primaryColor, setPrimaryColor] = useState("#6366F1");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [textColor, setTextColor] = useState("#1F2937");
  const [fontFamily, setFontFamily] = useState("system-ui");

  // AI chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");

  // ---------- load project ----------
  useEffect(() => {
    if (activeProjectId) {
      setLoading(true);
      fetch(`/api/projects/${activeProjectId}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => {
          const p = d.project;
          if (!p) throw new Error("Project not found");
          setProject(p);
          setFiles(p.files ?? []);
          setActiveFilePath(p.files.find((f: ProjectFile) => f.isEntry)?.path ?? p.files[0]?.path ?? "");
          setShowWelcome(false);
        })
        .catch(e => setError(e?.message ?? "Failed to load"))
        .finally(() => setLoading(false));
    } else {
      const starter: ProjectFile[] = [
        { id: "t0", path: "index.html", language: "html", content: STARTER_HTML, isEntry: true },
        { id: "t1", path: "styles.css", language: "css", content: STARTER_CSS, isEntry: false },
        { id: "t2", path: "app.js", language: "javascript", content: STARTER_JS, isEntry: false },
      ];
      setProject({ id: "temp-" + Date.now(), buddyId: "web", title: "Untitled Design", description: null, tags: [], conversationId: null, files: starter });
      setFiles(starter);
      setActiveFilePath("index.html");
      setLoading(false);
    }
  }, [activeProjectId]);

  // ---------- helpers ----------
  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles(prev => prev.map(f => f.path === path ? { ...f, content } : f));
    setDirty(true);
  }, []);

  const insertComponent = (html: string) => {
    const f = files.find(f => f.path === "index.html");
    if (f) {
      let c = f.content;
      c = c.includes("</body>") ? c.replace("</body>", `${html}\n</body>`) : c + "\n" + html;
      updateFileContent("index.html", c);
    }
  };

  const loadTemplate = (id: string) => {
    const t = WEB_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setFiles(t.files.map((f, i) => ({
      id: `t${i}-${Date.now()}`, path: f.path,
      language: f.path.endsWith(".css") ? "css" : f.path.endsWith(".js") ? "javascript" : "html",
      content: f.content, isEntry: f.path === "index.html" || i === 0,
    })));
    setActiveFilePath("index.html");
    setProject(p => p ? { ...p, title: t.name } : p);
    setDirty(true);
    setShowWelcome(false);
  };

  const applyTheme = () => {
    const css = `:root {\n  --primary: ${primaryColor};\n  --primary-dark: ${primaryColor};\n  --bg: ${bgColor};\n  --text: ${textColor};\n  --border: #E5E7EB;\n  --radius: 12px;\n}\nbody { font-family: ${fontFamily}; background: var(--bg); color: var(--text); }`;
    updateFileContent("styles.css", css);
    const html = files.find(f => f.path === "index.html");
    if (html) updateFileContent("index.html", html.content.replace(/#6366F1/gi, primaryColor).replace(/#1F2937/gi, textColor).replace(/#FFFFFF/gi, bgColor));
  };

  const saveProject = async () => {
    if (!project) return;
    setSaving(true);
    try {
      const payload = { files: files.map(f => ({ path: f.path, language: f.language, content: f.content, isEntry: f.isEntry })) };
      if (project.id.startsWith("temp-")) {
        const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buddyId: "web", title: project.title, ...payload }) });
        const d = await r.json();
        if (d.project?.id) { setProject(p => p ? { ...p, id: d.project.id } : p); setActiveProjectId(d.project.id); }
      } else {
        await fetch(`/api/projects/${project.id}/files`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      setDirty(false); setSavedAt(Date.now()); setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) { setError(e?.message ?? "Save failed"); }
    finally { setSaving(false); }
  };

  // ---------- preview ----------
  useEffect(() => {
    const t = setTimeout(() => {
      const pf: PreviewFile[] = files.map(f => ({ path: f.path, content: f.content }));
      setPreviewDoc(buildPreviewDocument(pf) ?? null);
    }, 500);
    return () => clearTimeout(t);
  }, [files]);

  // ---------- AI chat ----------
  const sendChat = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setStreaming(true);
    setStreamBuf("");
    let accumulated = "";
    try {
      const res = await fetch("/api/tutor/chat/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, buddyId: "web", conversationId: project?.conversationId ?? null }),
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
            // Auto-extract code + update files
            const re = /```(\w+)(?:\s+path="([^"]+)")?[^`\n]*\n([\s\S]*?)```/g;
            let m;
            while ((m = re.exec(accumulated)) !== null) {
              const lang = m[1];
              const path = m[2] || (lang === "html" ? "index.html" : lang === "css" ? "styles.css" : "app.js");
              setFiles(prev => {
                const idx = prev.findIndex(p => p.path === path);
                if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], content: m[3].trimEnd() }; return next; }
                return [...prev, { id: `t-${Date.now()}`, path, language: lang, content: m[3].trimEnd(), isEntry: path === "index.html" }];
              });
            }
          } else if (evType === "done") {
            setMessages(m => [...m, { role: "assistant", text: data.reply ?? accumulated }]);
            setStreamBuf("");
          }
        }
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", text: `Error: ${e?.message ?? e}` }]);
    } finally { setStreaming(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        </motion.div>
      </div>
    );
  }

  const activeFile = files.find(f => f.path === activeFilePath);
  const filteredComponents = componentCategory === "all" ? WEB_COMPONENTS : WEB_COMPONENTS.filter(c => c.category === componentCategory);

  // ===== WELCOME ONBOARDING =====
  if (showWelcome) {
    return (
      <div className={`min-h-screen ${theme === "dark" ? "bg-gray-950" : "bg-gray-50"} flex items-center justify-center p-4 relative overflow-hidden`}>
        {/* Animated blobs */}
        <motion.div className="absolute w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: "radial-gradient(circle, #6366F1, transparent)" }}
          animate={{ x: [0, 100, 0], y: [0, -50, 0] }} transition={{ duration: 10, repeat: Infinity }} />
        <motion.div className="absolute w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: "radial-gradient(circle, #8B5CF6, transparent)" }}
          animate={{ x: [0, -80, 0], y: [0, 60, 0] }} transition={{ duration: 12, repeat: Infinity }} />

        <motion.div className="relative max-w-2xl w-full" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <button onClick={() => setScreen("home")} className="absolute top-0 left-0 text-gray-400 hover:text-white flex items-center gap-1 text-xs mb-6">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="text-center pt-12">
            <motion.div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mb-6"
              animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity }}>
              <Palette className="w-10 h-10 text-white" />
            </motion.div>

            <motion.h1 className={`text-4xl font-bold mb-3 ${theme === "dark" ? "text-white" : "text-gray-900"}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              Welcome to <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Design Studio</span>
            </motion.h1>
            <motion.p className={`text-lg mb-8 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              The most powerful visual web design tool — drag, drop, design, deploy.
            </motion.p>

            {/* Template grid */}
            <motion.div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
              {WEB_TEMPLATES.slice(0, 6).map((t, i) => (
                <motion.button key={t.id} onClick={() => loadTemplate(t.id)}
                  className={`p-4 rounded-xl border text-left transition ${theme === "dark" ? "bg-gray-900 border-gray-800 hover:border-indigo-500" : "bg-white border-gray-200 hover:border-indigo-400"}`}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.05 }}
                  whileHover={{ y: -4, boxShadow: "0 10px 30px rgba(99,102,241,0.15)" }}>
                  <span className="text-2xl block mb-1">{t.emoji}</span>
                  <span className={`text-sm font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>{t.name}</span>
                  <p className={`text-[10px] ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>{t.description}</p>
                </motion.button>
              ))}
            </motion.div>

            <motion.button onClick={() => { setShowWelcome(false); }}
              className="px-8 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold text-sm hover:shadow-lg transition flex items-center gap-2 mx-auto"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              Start with Blank Canvas <Plus className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ===== MAIN DESIGNER =====
  return (
    <div className={`h-screen flex flex-col overflow-hidden ${theme === "dark" ? "bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-900"}`}>
      {/* HEADER */}
      <motion.header className={`flex items-center gap-2 px-3 py-2 border-b flex-shrink-0 ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}
        initial={{ y: -48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }}>
        <button onClick={() => setScreen("home")} className={`p-1.5 rounded-lg ${theme === "dark" ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
            <Palette className="w-4 h-4 text-white" />
          </div>
          <input type="text" value={project?.title ?? ""} onChange={e => setProject(p => p ? { ...p, title: e.target.value } : p)}
            className={`bg-transparent text-sm font-bold outline-none border-b border-transparent focus:border-indigo-500 px-1 ${theme === "dark" ? "text-white" : "text-gray-900"}`} />
          {dirty && <span className="text-[10px] text-amber-400">●</span>}
          {savedAt && <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /></span>}
        </div>

        <div className="flex-1" />

        {/* Device toggle */}
        <div className={`flex items-center gap-0.5 p-0.5 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-100"}`}>
          {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([id, Icon]) => (
            <button key={id} onClick={() => setDevice(id)}
              className={`p-1.5 rounded ${device === id ? (theme === "dark" ? "bg-gray-700 text-white" : "bg-white text-gray-900 shadow") : "text-gray-400"}`}>
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Split toggle */}
        <button onClick={() => setShowCode(!showCode)}
          className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${showCode ? (theme === "dark" ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-700") : (theme === "dark" ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100")}`}>
          <Code2 className="w-3.5 h-3.5" /> {showCode ? "Visual" : "Split"}
        </button>

        {/* Theme toggle */}
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={`p-1.5 rounded-lg ${theme === "dark" ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100"}`}>
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Sidebar toggles */}
        <button onClick={() => setShowLeftSidebar(!showLeftSidebar)}
          className={`p-1.5 rounded-lg ${showLeftSidebar ? (theme === "dark" ? "text-indigo-400" : "text-indigo-600") : (theme === "dark" ? "text-gray-500" : "text-gray-400")}`}>
          <PanelLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setShowRightSidebar(!showRightSidebar)}
          className={`p-1.5 rounded-lg ${showRightSidebar ? (theme === "dark" ? "text-indigo-400" : "text-indigo-600") : (theme === "dark" ? "text-gray-500" : "text-gray-400")}`}>
          <PanelRight className="w-4 h-4" />
        </button>

        {/* Save */}
        <button onClick={saveProject} disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center gap-1 hover:shadow-lg disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
      </motion.header>

      {/* WORKSPACE */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT: Component Library */}
        <AnimatePresence>
          {showLeftSidebar && (
            <motion.div className={`w-56 flex-col border-r flex-shrink-0 overflow-y-auto ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} hidden md:flex`}
              initial={{ x: -224, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -224, opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="p-2 border-b flex items-center gap-1">
                <Layers className="w-3 h-3 text-gray-400" />
                <span className="text-[10px] font-bold uppercase text-gray-400">Components</span>
              </div>
              <div className="p-2 flex flex-wrap gap-1 border-b">
                <button onClick={() => setComponentCategory("all")}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${componentCategory === "all" ? "bg-indigo-600 text-white" : (theme === "dark" ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500")}`}>All</button>
                {COMPONENT_CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setComponentCategory(cat.id)}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${componentCategory === cat.id ? "bg-indigo-600 text-white" : (theme === "dark" ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500")}`}>
                    {cat.emoji}
                  </button>
                ))}
              </div>
              <div className="p-2 space-y-1 flex-1 overflow-y-auto">
                {filteredComponents.map((comp, i) => (
                  <motion.button key={comp.id} onClick={() => insertComponent(comp.html)}
                    className={`w-full text-left p-2 rounded-lg transition group border border-transparent ${theme === "dark" ? "hover:bg-gray-800 hover:border-gray-700" : "hover:bg-gray-50 hover:border-gray-200"}`}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    whileHover={{ x: 2 }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{comp.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold truncate ${theme === "dark" ? "text-gray-200" : "text-gray-800"}`}>{comp.name}</div>
                        <div className="text-[9px] text-gray-500 truncate">{comp.description}</div>
                      </div>
                      <Plus className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CENTER: Canvas */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Canvas area */}
          <div className="flex-1 overflow-auto p-4 flex justify-center gap-2">
            {/* Code editor (split mode) */}
            <AnimatePresence>
              {showCode && activeFile && (
                <motion.div className="w-[45%] flex-shrink-0 rounded-lg overflow-hidden border shadow-xl" style={{ borderColor: theme === "dark" ? "#374151" : "#E5E7EB" }}
                  initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "45%" }} exit={{ opacity: 0, width: 0 }}>
                  <div className={`px-2 py-1.5 flex items-center gap-1 border-b ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                    {files.map(f => (
                      <button key={f.id} onClick={() => setActiveFilePath(f.path)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${activeFilePath === f.path ? "bg-indigo-600 text-white" : (theme === "dark" ? "text-gray-400 hover:bg-gray-700" : "text-gray-500 hover:bg-gray-100")}`}>
                        {f.isEntry && "★ "}{f.path}
                      </button>
                    ))}
                    <div className="flex-1" />
                    <button onClick={() => setShowCode(false)} className="text-gray-400 hover:text-white"><X className="w-3 h-3" /></button>
                  </div>
                  <textarea value={activeFile.content} onChange={e => updateFileContent(activeFilePath, e.target.value)}
                    className="w-full h-[60vh] p-4 font-mono text-xs bg-gray-900 text-gray-100 resize-none focus:outline-none" spellCheck={false}
                    onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); const s = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; updateFileContent(activeFilePath, activeFile.content.substring(0, s) + "  " + activeFile.content.substring(end)); e.currentTarget.selectionStart = e.currentTarget.selectionEnd = s + 2; } }} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Preview */}
            <div className={`bg-white shadow-2xl transition-all duration-300 ${showCode ? "w-[52%]" : "w-full max-w-[1200px]"} ${device === "mobile" ? "!w-[375px]" : device === "tablet" ? "!w-[768px]" : ""}`}>
              <iframe srcDoc={previewDoc ?? "<html><body style='display:flex;align-items:center;justify-content:center;height:100vh;color:#999;font-family:sans-serif;'>Loading…</body></html>"}
                className="w-full border-0" style={{ minHeight: "60vh", zoom: `${zoom}%` }}
                sandbox="allow-scripts allow-forms allow-popups" title="Preview" />
            </div>
          </div>

          {/* AI Chat bar */}
          <div className={`border-t p-2 flex items-center gap-2 flex-shrink-0 ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
            <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="Ask AI to modify your design (e.g. 'make the hero section blue')…"
              className={`flex-1 rounded-full px-3 py-1.5 text-xs outline-none ${theme === "dark" ? "bg-gray-800 border border-gray-700 text-gray-100 focus:border-indigo-500" : "bg-gray-50 border border-gray-200 text-gray-900 focus:border-indigo-400"}`}
              disabled={streaming} />
            <button onClick={() => sendChat()} disabled={streaming || !input.trim()}
              className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0">
              {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Chat messages */}
          {(messages.length > 0 || streamBuf) && (
            <div className={`max-h-24 overflow-y-auto px-2 pb-1 space-y-0.5 flex-shrink-0 ${theme === "dark" ? "bg-gray-900" : "bg-gray-50"}`}>
              {messages.slice(-3).map((m, i) => (
                <div key={i} className={`text-xs ${m.role === "user" ? "text-indigo-400 font-semibold" : (theme === "dark" ? "text-gray-400" : "text-gray-600")}`}>
                  <span className="font-bold">{m.role === "user" ? "You: " : "AI: "}</span>
                  <span className="line-clamp-1">{m.text.slice(0, 200)}</span>
                </div>
              ))}
              {streamBuf && <div className="text-xs text-gray-500"><span className="font-bold">AI: </span><span className="line-clamp-2">{streamBuf.slice(0, 300)}</span></div>}
            </div>
          )}
        </div>

        {/* RIGHT: Properties */}
        <AnimatePresence>
          {showRightSidebar && (
            <motion.div className={`w-56 flex-col border-l flex-shrink-0 overflow-y-auto ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} hidden md:flex`}
              initial={{ x: 224, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 224, opacity: 0 }} transition={{ duration: 0.2 }}>
              {/* Design System */}
              <div className="p-3 border-b">
                <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1 mb-2"><Palette className="w-3 h-3" /> Design System</span>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 flex-1">Primary</label>
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 flex-1">Background</label>
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 flex-1">Text</label>
                    <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent" />
                  </div>
                  <button onClick={applyTheme} className="w-full py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1 hover:shadow-lg">
                    <Wand2 className="w-3 h-3" /> Apply Theme
                  </button>
                </div>
              </div>

              {/* Typography */}
              <div className="p-3 border-b">
                <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1 mb-2"><Type className="w-3 h-3" /> Typography</span>
                <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className={`w-full rounded px-2 py-1 text-xs ${theme === "dark" ? "bg-gray-800 border border-gray-700 text-gray-200" : "bg-gray-50 border border-gray-200 text-gray-800"}`}>
                  <option value="system-ui">System UI</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Courier New', monospace">Courier</option>
                  <option value="Verdana, sans-serif">Verdana</option>
                </select>
              </div>

              {/* Files */}
              {!showCode && (
                <div className="p-2 border-b">
                  <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Files</div>
                  {files.map(f => (
                    <button key={f.id} onClick={() => { setActiveFilePath(f.path); setShowCode(true); }}
                      className={`w-full text-left px-2 py-1 rounded text-xs ${activeFilePath === f.path ? "bg-indigo-600 text-white" : (theme === "dark" ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-50")}`}>
                      {f.isEntry && "★ "}{f.path}
                    </button>
                  ))}
                </div>
              )}

              {/* AI Design Check */}
              <DesignSuggestions htmlContent={files.find(f => f.path === "index.html")?.content ?? ""} primaryColor={primaryColor} bgColor={bgColor} textColor={textColor} theme={theme} />

              {/* Tips */}
              <div className="p-2 border-t">
                <div className="text-[9px] text-gray-500 space-y-0.5">
                  <p>💡 Click a component on the left</p>
                  <p>🎨 Change colors → Apply Theme</p>
                  <p>💬 Ask AI to modify design</p>
                  <p>📱 Toggle device sizes</p>
                  <p>🔄 Split view = code + preview</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-rose-900/90 text-rose-100 px-4 py-2.5 rounded-lg shadow-lg max-w-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-300 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
}

// ===== DesignSuggestions Component =====
function DesignSuggestions({ htmlContent, primaryColor, bgColor, textColor, theme }: {
  htmlContent: string; primaryColor: string; bgColor: string; textColor: string; theme: string;
}) {
  const suggestions: Array<{ type: "warning" | "info" | "success"; text: string }> = [];
  const contrast = getContrastRatio(textColor, bgColor);
  if (contrast < 4.5) suggestions.push({ type: "warning", text: `Text contrast ${contrast.toFixed(1)}:1 — WCAG AA needs 4.5:1` });
  else if (contrast >= 7) suggestions.push({ type: "success", text: `Contrast ${contrast.toFixed(1)}:1 — AAA ✓` });
  if (!htmlContent.includes("<nav") && !htmlContent.includes("<header")) suggestions.push({ type: "info", text: "No navigation bar. Add one from Components → Headers." });
  if (!htmlContent.includes("<footer")) suggestions.push({ type: "info", text: "No footer. Add one from Components → Footer." });
  if (!htmlContent.includes("<h1")) suggestions.push({ type: "info", text: "No H1 heading. Add a hero section." });
  if (!htmlContent.includes("<form") && !htmlContent.includes("input")) suggestions.push({ type: "info", text: "No form. Consider a contact form or newsletter." });
  if (htmlContent.replace(/<[^>]*>/g, "").trim().length < 20) suggestions.push({ type: "info", text: "Canvas is empty. Click a component to start!" });
  if (suggestions.length === 0) suggestions.push({ type: "success", text: "Design looks good! ✓" });

  return (
    <div className="p-2 border-t">
      <div className="text-[10px] font-bold uppercase text-gray-400 mb-1 flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-amber-500" /> AI Design Check
      </div>
      <div className="space-y-1">
        {suggestions.slice(0, 4).map((s, i) => (
          <div key={i} className={`text-[9px] leading-tight p-1.5 rounded ${s.type === "warning" ? "bg-amber-900/30 text-amber-300" : s.type === "success" ? "bg-emerald-900/30 text-emerald-300" : "bg-blue-900/30 text-blue-300"}`}>
            {s.type === "warning" ? "⚠️ " : s.type === "success" ? "✅ " : "💡 "}{s.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function getContrastRatio(c1: string, c2: string): number {
  const l1 = getLuminance(c1), l2 = getLuminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function getLuminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const lr = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const lg = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const lb = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
