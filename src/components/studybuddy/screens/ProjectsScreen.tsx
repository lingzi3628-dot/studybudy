"use client";

/**
 * ProjectsScreen — Phase 47
 *
 * Lists all of the user's saved projects across all buddies, with a
 * filter for which buddy created each. Each project card shows:
 *   - Title, description, tags
 *   - Buddy badge (emoji + name)
 *   - File count + entry file path
 *   - Last-updated timestamp
 *   - "Open" button (Phase 48+ will route to the right editor based on buddyId)
 *   - "Delete" button (with confirm)
 *
 * Phase 47 ships the list + delete. Phase 48+ ships the per-buddy editors
 * that route from the "Open" button.
 */

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, Loader2, AlertCircle, FileCode2, Trash2, Plus, Star, Globe, Sparkles, Database, Brain, LayoutTemplate, Server,
} from "lucide-react";
import { useApp } from "../store";
import { isValidBuddyId } from "@/lib/buddies/registry";
import type { BuddyId, BuddyMetadata } from "@/lib/buddies/types";

type Project = {
  id: string;
  buddyId: string;
  title: string;
  description: string | null;
  tags: string[];
  isPublic: boolean;
  starCount: number;
  conversationId: string | null;
  fileCount: number;
  entryFile: string | null;
  createdAt: string;
  updatedAt: string;
};

const BUDDY_META: Record<string, { emoji: string; displayName: string; accent: string }> = {
  study: { emoji: "📚", displayName: "StudyBuddy", accent: "from-indigo-500 to-violet-500" },
  dev: { emoji: "💻", displayName: "DevBuddy", accent: "from-emerald-500 to-teal-500" },
  data: { emoji: "📊", displayName: "DataBuddy", accent: "from-sky-500 to-cyan-500" },
  ml: { emoji: "🧠", displayName: "MLBuddy", accent: "from-violet-500 to-fuchsia-500" },
  ai: { emoji: "🤖", displayName: "AIBuddy", accent: "from-fuchsia-500 to-purple-600" },
  web: { emoji: "🌐", displayName: "WebBuddy", accent: "from-amber-500 to-orange-500" },
  backend: { emoji: "⚙️", displayName: "BackendBuddy", accent: "from-rose-500 to-pink-500" },
  server: { emoji: "🖥️", displayName: "ServerBuddy", accent: "from-gray-700 to-gray-900" },
  tvet: { emoji: "🔧", displayName: "TVETBuddy", accent: "from-amber-600 to-red-600" },
};

const FILTERS: Array<{ id: "all" | BuddyId; label: string }> = [
  { id: "all", label: "All" },
  { id: "dev", label: "💻 Code" },
  { id: "data", label: "📊 Data" },
  { id: "ml", label: "🧠 ML" },
  { id: "ai", label: "🤖 AI" },
  { id: "web", label: "🌐 Web" },
  { id: "backend", label: "⚙️ Backend" },
  { id: "server", label: "🖥️ Server" },
  { id: "tvet", label: "🔧 TVET" },
];

export function ProjectsScreen() {
  const { setScreen } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"all" | BuddyId>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filter === "all" ? "/api/projects" : `/api/projects?buddyId=${filter}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProjects(d.projects ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setScreen("home")}
            aria-label="Back"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileCode2 className="w-6 h-6 text-indigo-500" /> My Projects
            </h1>
            <p className="text-xs text-gray-500">
              Saved code, notebooks, websites, and models across all buddies.
            </p>
          </div>
          {/* Phase 48 — New blank code project (opens DevBuddyScreen with a temp id) */}
          <button
            onClick={() => {
              (useApp.getState() as any).setActiveProjectId(null);
              setScreen("devBuddy");
            }}
            className="px-3 h-9 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-emerald-700"
            title="Open the DevBuddy editor with a new empty project"
          >
            <Plus className="w-3.5 h-3.5" /> New Code Project
          </button>
          {/* Phase 49 — New blank notebook (opens NotebookScreen with a starter notebook) */}
          <button
            onClick={() => {
              (useApp.getState() as any).setActiveProjectId(null);
              setScreen("notebook");
            }}
            className="px-3 h-9 rounded-full bg-sky-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-sky-700"
            title="Open a new Jupyter-style notebook (runs in-browser via Pyodide)"
          >
            <Database className="w-3.5 h-3.5" /> New Notebook
          </button>
          {/* Phase 50 — New ML model (opens MLPlaygroundScreen) */}
          <button
            onClick={() => {
              (useApp.getState() as any).setActiveProjectId(null);
              setScreen("mlPlayground");
            }}
            className="px-3 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-violet-700"
            title="Open the ML training playground (TensorFlow.js in-browser)"
          >
            <Brain className="w-3.5 h-3.5" /> New Model
          </button>
          {/* Phase 54 — New website (opens WebBuilderScreen) */}
          <button
            onClick={() => {
              (useApp.getState() as any).setActiveProjectId(null);
              setScreen("webBuilder");
            }}
            className="px-3 h-9 rounded-full bg-amber-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-amber-700"
            title="Open the website builder (prompt → edit → preview → deploy)"
          >
            <LayoutTemplate className="w-3.5 h-3.5" /> New Website
          </button>
          {/* Phase 55 — New backend project (opens BackendBuddyScreen) */}
          <button
            onClick={() => {
              (useApp.getState() as any).setActiveProjectId(null);
              setScreen("backendBuddy");
            }}
            className="px-3 h-9 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-rose-700"
            title="Open the SQL playground + API designer (schema → spec → test)"
          >
            <Database className="w-3.5 h-3.5" /> New API Project
          </button>
          {/* Phase 58 — New server lab (opens ServerBuddyScreen) */}
          <button
            onClick={() => {
              (useApp.getState() as any).setActiveProjectId(null);
              setScreen("serverBuddy");
            }}
            className="px-3 h-9 rounded-full bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 hover:bg-emerald-600"
            title="Open the simulated DevOps lab (shell, Docker, Nginx, deploy runbooks)"
          >
            <Server className="w-3.5 h-3.5" /> New Server Lab
          </button>
          <button
            onClick={() => setScreen("tutor")}
            className="px-3 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-indigo-700"
          >
            <Sparkles className="w-3.5 h-3.5" /> New via AI
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                filter === f.id
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:border-indigo-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center text-gray-400 py-12">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="ml-2 text-sm">Loading your projects…</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-center">
            <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
            <p className="mt-2 text-sm text-rose-700">{error}</p>
            <button onClick={load} className="mt-3 text-xs font-semibold text-rose-700 hover:underline">
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <FileCode2 className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="mt-3 text-sm font-medium text-gray-700">No projects yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Ask any buddy to build something — DevBuddy for code, WebBuddy for sites, MLBuddy for models — then save it.
            </p>
            <button
              onClick={() => setScreen("tutor")}
              className="mt-4 px-4 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              Open AI Tutor
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => {
              const meta = BUDDY_META[p.buddyId] ?? BUDDY_META.dev;
              return (
                <div
                  key={p.id}
                  className="rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  <div className={`h-2 bg-gradient-to-br ${meta.accent}`} />
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-base">{meta.emoji}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {meta.displayName}
                      </span>
                      {p.isPublic && (
                        <span className="ml-auto text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-0.5">
                          <Globe className="w-2.5 h-2.5" /> Public
                        </span>
                      )}
                      {p.starCount > 0 && (
                        <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {p.starCount}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 line-clamp-1">{p.title}</p>
                    {p.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{p.description}</p>
                    )}
                    {p.entryFile && (
                      <p className="text-[10px] text-gray-400 mt-1.5 font-mono truncate">
                        📄 {p.entryFile}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {p.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium"
                        >
                          {t}
                        </span>
                      ))}
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {p.fileCount} {p.fileCount === 1 ? "file" : "files"} · {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-1.5 mt-2.5">
                      <button
                        // Phase 48: dev projects route to DevBuddyScreen.
                        // Phase 49+ will add the per-buddy editors:
                        //   data → NotebookScreen (Phase 49)
                        //   ml → MLPlayground (Phase 50)
                        //   web → WebBuilderScreen (Phase 54)
                        //   backend → ships in Phase 55
                        //   server → ships in Phase 58
                        //   tvet → ships in Phase 59
                        onClick={() => {
                          const state = useApp.getState() as any;
                          if (p.buddyId === "dev") {
                            state.setActiveProjectId(p.id);
                            setScreen("devBuddy");
                          } else if (p.buddyId === "data") {
                            // Phase 49 — data projects route to NotebookScreen
                            state.setActiveProjectId(p.id);
                            setScreen("notebook");
                          } else if (p.buddyId === "ml") {
                            // Phase 50 — ml projects route to MLPlaygroundScreen
                            state.setActiveProjectId(p.id);
                            setScreen("mlPlayground");
                          } else if (p.buddyId === "web") {
                            // Phase 54 — web projects route to WebBuilderScreen
                            state.setActiveProjectId(p.id);
                            setScreen("webBuilder");
                          } else if (p.buddyId === "backend") {
                            // Phase 55 — backend projects route to BackendBuddyScreen
                            state.setActiveProjectId(p.id);
                            setScreen("backendBuddy");
                          } else if (p.buddyId === "ai") {
                            // Phase 56 — ai projects route to the Prompt Playground
                            state.setActiveProjectId(p.id);
                            setScreen("promptPlayground");
                          } else if (p.buddyId === "server") {
                            // Phase 58 — server projects route to ServerBuddyScreen
                            state.setActiveProjectId(p.id);
                            setScreen("serverBuddy");
                          } else if (p.conversationId) {
                            // No editor yet for this buddy — open AI Tutor with this conversation
                            setScreen("tutor");
                          } else {
                            alert(`The ${meta.displayName} editor ships in Phase ${getPhaseForBuddy(p.buddyId)}. For now, ask the buddy to update it via chat.`);
                          }
                        }}
                        className="flex-1 px-2.5 h-8 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.title)}
                        disabled={deletingId === p.id}
                        aria-label="Delete project"
                        className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition flex items-center justify-center disabled:opacity-50"
                      >
                        {deletingId === p.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function getPhaseForBuddy(buddyId: string): number {
  const phases: Record<string, number> = {
    dev: 48, data: 49, ml: 50, ai: 56, web: 54, backend: 55, server: 58, tvet: 59,
  };
  return phases[buddyId] ?? 48;
}
