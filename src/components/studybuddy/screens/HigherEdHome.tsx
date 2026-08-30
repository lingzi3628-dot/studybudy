"use client";

/**
 * HigherEdHome — Phase 51
 *
 * Home screen for users on a higher-education track (dev, data, ml, tvet, mixed).
 * Different layout from the K-12 Home:
 *   - Top: greeting + track badge + projects quick stats
 *   - Big buddy grid (all 8 buddies, with the user's track buddy highlighted)
 *   - Recent projects (mini cards, last 4 — one per buddy)
 *   - Quick links to Notebook / Code Editor / ML Playground / Lab Simulator
 *
 * The K-12 Home (the existing Home.tsx) remains for users on track="k12".
 */

import { useEffect, useState } from "react";
import {
  Flame, Loader2, ChevronRight, FileCode2, Database, Brain, Globe,
  Wrench, Code, Sparkles, FolderOpen,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Progress as ProgressData } from "../api";

// Phase 51 — buddy metadata for the grid (mirrors src/lib/buddies/registry.ts but
// kept inline to avoid pulling the server-side registry into the client bundle)
const BUDDY_GRID = [
  { id: "study",   emoji: "📚", name: "StudyBuddy",    tagline: "K-12 tutor (Kenya CBC / KCSE)",     accent: "from-indigo-500 to-violet-500",  track: "k12" },
  { id: "dev",     emoji: "💻", name: "DevBuddy",      tagline: "Code, debug, refactor, ship",      accent: "from-emerald-500 to-teal-500",   track: "dev" },
  { id: "data",    emoji: "📊", name: "DataBuddy",     tagline: "Notebooks, pandas, SQL, EDA",       accent: "from-sky-500 to-cyan-500",       track: "data" },
  { id: "ml",      emoji: "🧠", name: "MLBuddy",       tagline: "Train, visualize, evaluate models", accent: "from-violet-500 to-fuchsia-500", track: "ml" },
  { id: "web",     emoji: "🌐", name: "WebBuddy",      tagline: "Prompt → website → deploy",         accent: "from-amber-500 to-orange-500",  track: "web" },
  { id: "backend", emoji: "⚙️", name: "BackendBuddy", tagline: "APIs, SQL, databases, servers",     accent: "from-rose-500 to-pink-500",       track: "backend" },
  { id: "server",  emoji: "🖥️", name: "ServerBuddy",  tagline: "Linux, Docker, Nginx, deploy",      accent: "from-gray-700 to-gray-900",      track: "server" },
  { id: "tvet",    emoji: "🔧", name: "TVETBuddy",    tagline: "Technical & vocational training",   accent: "from-amber-600 to-red-600",      track: "tvet" },
] as const;

const TRACK_LABELS: Record<string, { label: string; emoji: string }> = {
  k12:   { label: "K-12",         emoji: "📚" },
  dev:   { label: "Coding",        emoji: "💻" },
  data:  { label: "Data Science",  emoji: "📊" },
  ml:    { label: "Machine Learning", emoji: "🧠" },
  tvet:  { label: "Technical / TVET", emoji: "🔧" },
  mixed: { label: "Multiple Interests", emoji: "🎯" },
};

type ProjectSummary = {
  id: string;
  buddyId: string;
  title: string;
  description: string | null;
  updatedAt: string;
  fileCount: number;
  entryFile: string | null;
};

export function HigherEdHome() {
  const { setScreen } = useApp();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [userTrack, setUserTrack] = useState<string>("dev");  // default if fetch fails
  const [userName, setUserName] = useState<string>("");
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Fetch user profile + progress + recent projects in parallel
        const [meRes, progressRes, projectsRes] = await Promise.all([
          fetch("/api/auth/me"),
          api.getProgress().catch(() => null),
          fetch("/api/projects").catch(() => null),
        ]);
        if (!mounted) return;
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.user?.track) setUserTrack(me.user.track);
          if (me.user?.name) setUserName(me.user.name.split(" ")[0]);
          else if (me.user?.email) setUserName(me.user.email.split("@")[0]);
        }
        if (progressRes) setProgress(progressRes);
        if (projectsRes?.ok) {
          const d = await projectsRes.json();
          setRecentProjects((d.projects ?? []).slice(0, 4));
        }
      } catch (e) {
        console.warn("HigherEdHome fetch failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Open the AI Tutor with the user's track buddy pre-selected
  const openTutorWithBuddy = (buddyId: string) => {
    try {
      localStorage.setItem("studybuddy_active_buddy", buddyId);
    } catch { /* ignore */ }
    setScreen("tutor");
  };

  const trackMeta = TRACK_LABELS[userTrack] ?? TRACK_LABELS.dev;
  const streak = progress?.streak ?? 0;
  const xp = progress?.xp ?? 0;
  const level = progress?.level ?? 1;

  if (loading) {
    return (
      <div className="md:px-8 md:py-6">
        <div className="max-w-md mx-auto px-4 pt-10 pb-28 md:max-w-5xl md:px-0 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="ml-2 text-sm">Loading your workspace…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        {/* Greeting + track badge */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Welcome back, {userName || "there"}! 👋</p>
            <h1 className="text-2xl font-bold text-gray-900">Your workspace</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 flex items-center gap-1">
              {trackMeta.emoji} {trackMeta.label}
            </span>
            {streak > 0 && (
              <span className="hidden md:flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full">
                <Flame className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-bold">{streak}</span>
                <span className="text-xs text-amber-600/80">day streak</span>
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white border border-gray-200 p-3">
            <p className="text-[10px] font-bold uppercase text-gray-500">Level</p>
            <p className="text-lg font-bold text-gray-900">Lv. {level}</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-3">
            <p className="text-[10px] font-bold uppercase text-gray-500">XP</p>
            <p className="text-lg font-bold text-gray-900">{xp.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-3">
            <p className="text-[10px] font-bold uppercase text-gray-500">Projects</p>
            <p className="text-lg font-bold text-gray-900">{recentProjects.length}</p>
          </div>
        </div>

        {/* Buddy grid */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Choose your buddy</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {BUDDY_GRID.map((b) => {
              // Highlight the user's track buddy
              const isPrimary = b.track === userTrack;
              return (
                <button
                  key={b.id}
                  onClick={() => openTutorWithBuddy(b.id)}
                  className={`text-left rounded-2xl border p-3 flex flex-col gap-1.5 transition shadow-sm hover:shadow-md ${
                    isPrimary
                      ? "border-indigo-500 bg-indigo-50/50"
                      : "border-gray-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${b.accent} text-white flex items-center justify-center text-lg`}>
                    {b.emoji}
                  </div>
                  <p className="text-xs font-bold text-gray-900">{b.name}</p>
                  <p className="text-[10px] text-gray-500 line-clamp-2">{b.tagline}</p>
                  {isPrimary && (
                    <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wide">★ Your track</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Quick tools */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick tools</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <button
              onClick={() => setScreen("devBuddy")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-emerald-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Code className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-gray-900">Code Editor</p>
              <p className="text-[10px] text-gray-500">Multi-file projects</p>
            </button>
            <button
              onClick={() => setScreen("notebook")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-sky-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-gray-900">Notebook</p>
              <p className="text-[10px] text-gray-500">Jupyter-style cells</p>
            </button>
            <button
              onClick={() => setScreen("mlPlayground")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-violet-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                <Brain className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-gray-900">ML Playground</p>
              <p className="text-[10px] text-gray-500">Train neural networks</p>
            </button>
            <button
              onClick={() => setScreen("lab")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-rose-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-gray-900">Lab Simulator</p>
              <p className="text-[10px] text-gray-500">PhET interactive sims</p>
            </button>
          </div>
        </section>

        {/* Recent projects */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-indigo-500" /> Recent projects
            </h2>
            <button
              onClick={() => setScreen("projects")}
              className="text-xs text-indigo-600 font-medium flex items-center"
            >
              See all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {recentProjects.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-5 text-center">
              <FileCode2 className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="mt-2 text-sm text-gray-600">No projects yet</p>
              <p className="mt-1 text-xs text-gray-500">
                Ask any buddy to build something — DevBuddy for code, MLBuddy for models, DataBuddy for notebooks.
              </p>
              <button
                onClick={() => setScreen("tutor")}
                className="mt-3 px-4 h-9 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                Open AI Tutor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {recentProjects.map((p) => {
                const meta = BUDDY_GRID.find((b) => b.id === p.buddyId) ?? BUDDY_GRID[0];
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      (useApp as any).getState().setActiveProjectId?.(p.id);
                      // Route to the right editor per buddy
                      if (p.buddyId === "dev") setScreen("devBuddy");
                      else if (p.buddyId === "data") setScreen("notebook");
                      else if (p.buddyId === "ml") setScreen("mlPlayground");
                      else setScreen("projects");
                    }}
                    className="text-left rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition p-3 flex items-center gap-3"
                  >
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${meta.accent} text-white flex items-center justify-center text-base flex-shrink-0`}>
                      {meta.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{p.title}</p>
                      <p className="text-[10px] text-gray-500">{meta.name} · {p.fileCount} {p.fileCount === 1 ? "file" : "files"} · {new Date(p.updatedAt).toLocaleDateString()}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
