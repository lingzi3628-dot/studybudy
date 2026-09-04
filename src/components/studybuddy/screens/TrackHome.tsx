"use client";

/**
 * TrackHome — Phase 61
 *
 * A track-specific home screen that adapts its layout to the user's
 * education track. Each track gets:
 *   - A track-branded hero section with gradient + emoji
 *   - Track-specific quick actions (simulators, editors, playgrounds)
 *   - Recent projects from this track's buddies
 *   - An embedded AI Tutor chat (always available — no need to leave Home)
 *   - A "Switch track" button that opens the TrackSwitchModal
 *
 * This replaces the generic HigherEdHome for non-K12 users, giving each
 * track its own "world" feel.
 *
 * Tracks:
 *   - dev: Code editor + JS sandbox + multi-file projects
 *   - data: Notebook + datasets + SQL
 *   - ml: TF.js playground + CNN + confusion matrix
 *   - aiapp: Prompt playground + RAG + agent builder
 *   - tvet: Circuit sim + gear train + network topo + PLC
 *   - mixed: All tools (same as HigherEdHome)
 */

import { useEffect, useState } from "react";
import {
  Flame, Loader2, ChevronRight, FileCode2, Database, Brain, Globe,
  Wrench, Code, Sparkles, FolderOpen, ArrowRight, Bot, Cpu, Network,
  GitBranch, Play, Server, Zap, BookOpen, MessageCircle,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Progress as ProgressData } from "../api";
import { TrackSwitchModal, ALL_TRACKS } from "./TrackSwitchModal";

type ProjectSummary = {
  id: string;
  buddyId: string;
  title: string;
  description: string | null;
  updatedAt: string;
  fileCount: number;
  entryFile: string | null;
};

// Per-track configuration: hero, quick actions, buddy list
const TRACK_CONFIG: Record<string, {
  heroGradient: string;
  heroEmoji: string;
  heroTitle: string;
  heroSubtitle: string;
  quickActions: Array<{ label: string; icon: any; screen: string; color: string; desc: string }>;
  buddyIds: string[];
}> = {
  dev: {
    heroGradient: "from-emerald-600 to-teal-600",
    heroEmoji: "💻",
    heroTitle: "Code. Debug. Ship.",
    heroSubtitle: "Multi-language editor with Python (Pyodide) + JavaScript sandbox. Save projects, run code in-browser.",
    quickActions: [
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "Multi-file projects" },
      { label: "Python Runner", icon: Play, screen: "codeRunner", color: "bg-emerald-50 text-emerald-600", desc: "Quick script" },
      { label: "Calculator", icon: Cpu, screen: "calculator", color: "bg-violet-50 text-violet-600", desc: "Scientific calc" },
      { label: "Lab Simulator", icon: Globe, screen: "lab", color: "bg-rose-50 text-rose-600", desc: "PhET sims" },
    ],
    buddyIds: ["dev", "web", "backend", "server"],
  },
  data: {
    heroGradient: "from-sky-600 to-cyan-600",
    heroEmoji: "📊",
    heroTitle: "Explore data. Find insights.",
    heroSubtitle: "Jupyter-style notebooks in your browser. pandas, matplotlib, SQL — all via Pyodide. Pre-loaded datasets ready.",
    quickActions: [
      { label: "Notebook", icon: Database, screen: "notebook", color: "bg-sky-50 text-sky-600", desc: "Jupyter cells" },
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "Quick script" },
      { label: "Lab Simulator", icon: Globe, screen: "lab", color: "bg-rose-50 text-rose-600", desc: "PhET sims" },
      { label: "Explore", icon: Globe, screen: "explore", color: "bg-indigo-50 text-indigo-600", desc: "Public projects" },
    ],
    buddyIds: ["data", "dev"],
  },
  ml: {
    heroGradient: "from-violet-600 to-fuchsia-600",
    heroEmoji: "🧠",
    heroTitle: "Train neural networks in your browser.",
    heroSubtitle: "TensorFlow.js with WebGL acceleration. XOR, Iris, MNIST, housing — train, visualize, evaluate. Build chatbots and watch them think.",
    quickActions: [
      { label: "ML Playground", icon: Brain, screen: "mlPlayground", color: "bg-violet-50 text-violet-600", desc: "Train models" },
      { label: "Chatbot Trainer", icon: MessageCircle, screen: "chatbotPlayground", color: "bg-fuchsia-50 text-fuchsia-600", desc: "Train + chat + think" },
      { label: "AI Templates", icon: Sparkles, screen: "aiTemplates", color: "bg-indigo-50 text-indigo-600", desc: "Start from a template" },
      { label: "Notebook", icon: Database, screen: "notebook", color: "bg-sky-50 text-sky-600", desc: "Data prep" },
    ],
    buddyIds: ["ml", "data", "dev"],
  },
  aiapp: {
    heroGradient: "from-fuchsia-600 to-purple-700",
    heroEmoji: "🤖",
    heroTitle: "Build AI apps from scratch.",
    heroSubtitle: "Prompt playground, in-browser RAG, agent builder, model evals. Ship AI-powered apps without a backend.",
    quickActions: [
      { label: "Prompt Playground", icon: Bot, screen: "promptPlayground", color: "bg-fuchsia-50 text-fuchsia-600", desc: "Test prompts" },
      { label: "AI Templates", icon: Sparkles, screen: "aiTemplates", color: "bg-indigo-50 text-indigo-600", desc: "Start from a template" },
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "Build apps" },
      { label: "Web Builder", icon: Globe, screen: "webBuilder", color: "bg-amber-50 text-amber-600", desc: "Ship sites" },
    ],
    buddyIds: ["ai", "dev", "web", "backend"],
  },
  tvet: {
    heroGradient: "from-amber-600 to-red-600",
    heroEmoji: "🔧",
    heroTitle: "Learn trades. Build skills. Get certified.",
    heroSubtitle: "Kenya TVET CDACC curriculum with hands-on simulators: circuits, gears, networking, PLC logic. AI Tutor grounded in trade standards.",
    quickActions: [
      { label: "TVET Simulator", icon: Wrench, screen: "tvetBuddy", color: "bg-amber-50 text-amber-600", desc: "Circuits + gears + PLC" },
      { label: "Lab Simulator", icon: Globe, screen: "lab", color: "bg-rose-50 text-rose-600", desc: "PhET physics sims" },
      { label: "Calculator", icon: Cpu, screen: "calculator", color: "bg-violet-50 text-violet-600", desc: "Trade math" },
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "ICT practice" },
    ],
    buddyIds: ["tvet", "study"],
  },
  server: {
    heroGradient: "from-gray-700 to-gray-900",
    heroEmoji: "🖥️",
    heroTitle: "Master Linux, Docker, deployment.",
    heroSubtitle: "Simulated shell with docker, nginx, systemd. Step-by-step deploy runbooks for AWS, Vercel, Railway. No real server — break things safely.",
    quickActions: [
      { label: "Shell Simulator", icon: Server, screen: "serverBuddy", color: "bg-gray-100 text-gray-700", desc: "Linux + Docker" },
      { label: "Backend Buddy", icon: GitBranch, screen: "backendBuddy", color: "bg-rose-50 text-rose-600", desc: "APIs + SQL" },
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "Scripts" },
      { label: "Explore", icon: Globe, screen: "explore", color: "bg-indigo-50 text-indigo-600", desc: "DevOps projects" },
    ],
    buddyIds: ["server", "backend", "dev"],
  },
  backend: {
    heroGradient: "from-rose-600 to-pink-600",
    heroEmoji: "⚙️",
    heroTitle: "Design APIs. Write SQL. Build backends.",
    heroSubtitle: "SQL playground (SQLite WASM), OpenAPI designer, API tester, ER diagram visualizer. Generate Express/FastAPI scaffolds.",
    quickActions: [
      { label: "Backend Buddy", icon: GitBranch, screen: "backendBuddy", color: "bg-rose-50 text-rose-600", desc: "SQL + APIs" },
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "Server code" },
      { label: "Server Buddy", icon: Server, screen: "serverBuddy", color: "bg-gray-100 text-gray-700", desc: "Deploy" },
      { label: "Explore", icon: Globe, screen: "explore", color: "bg-indigo-50 text-indigo-600", desc: "API projects" },
    ],
    buddyIds: ["backend", "dev", "server"],
  },
  web: {
    heroGradient: "from-amber-500 to-orange-600",
    heroEmoji: "🌐",
    heroTitle: "Prompt → Website → Deploy.",
    heroSubtitle: "Three-pane builder: describe what you want, edit the code, see live preview. One-click deploy to Vercel.",
    quickActions: [
      { label: "Web Builder", icon: Globe, screen: "webBuilder", color: "bg-amber-50 text-amber-600", desc: "Build sites" },
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "Edit code" },
      { label: "Backend Buddy", icon: GitBranch, screen: "backendBuddy", color: "bg-rose-50 text-rose-600", desc: "APIs" },
      { label: "Explore", icon: Globe, screen: "explore", color: "bg-indigo-50 text-indigo-600", desc: "Web projects" },
    ],
    buddyIds: ["web", "dev", "backend"],
  },
  mixed: {
    heroGradient: "from-rose-500 to-pink-500",
    heroEmoji: "🎯",
    heroTitle: "All tools. All buddies. No limits.",
    heroSubtitle: "Full access to every buddy, every editor, every simulator. The power-user mode — pick the right tool per task.",
    quickActions: [
      { label: "Code Editor", icon: Code, screen: "devBuddy", color: "bg-emerald-50 text-emerald-600", desc: "Multi-file" },
      { label: "Notebook", icon: Database, screen: "notebook", color: "bg-sky-50 text-sky-600", desc: "Jupyter" },
      { label: "ML Playground", icon: Brain, screen: "mlPlayground", color: "bg-violet-50 text-violet-600", desc: "Train models" },
      { label: "Explore", icon: Globe, screen: "explore", color: "bg-indigo-50 text-indigo-600", desc: "Community" },
    ],
    buddyIds: ["study", "dev", "data", "ml", "ai", "web", "backend", "server", "tvet"],
  },
};

const BUDDY_META: Record<string, { emoji: string; name: string; accent: string }> = {
  study:   { emoji: "📚", name: "StudyBuddy",    accent: "from-indigo-500 to-violet-500" },
  dev:     { emoji: "💻", name: "DevBuddy",      accent: "from-emerald-500 to-teal-500" },
  data:    { emoji: "📊", name: "DataBuddy",     accent: "from-sky-500 to-cyan-500" },
  ml:      { emoji: "🧠", name: "MLBuddy",       accent: "from-violet-500 to-fuchsia-500" },
  ai:      { emoji: "🤖", name: "AIBuddy",       accent: "from-fuchsia-500 to-purple-600" },
  web:     { emoji: "🌐", name: "WebBuddy",      accent: "from-amber-500 to-orange-500" },
  backend: { emoji: "⚙️", name: "BackendBuddy", accent: "from-rose-500 to-pink-500" },
  server:  { emoji: "🖥️", name: "ServerBuddy",  accent: "from-gray-700 to-gray-900" },
  tvet:    { emoji: "🔧", name: "TVETBuddy",    accent: "from-amber-600 to-red-600" },
};

export function TrackHome({ track }: { track: string }) {
  const { setScreen } = useApp();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [userName, setUserName] = useState("");
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrackModal, setShowTrackModal] = useState(false);

  const config = TRACK_CONFIG[track] ?? TRACK_CONFIG.mixed;
  const trackInfo = ALL_TRACKS.find((t) => t.key === track) ?? ALL_TRACKS[6]; // mixed

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [meRes, progressRes, projectsRes] = await Promise.all([
          fetch("/api/auth/me"),
          api.getProgress().catch(() => null),
          fetch("/api/projects").catch(() => null),
        ]);
        if (!mounted) return;
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.user?.name) setUserName(me.user.name.split(" ")[0]);
          else if (me.user?.email) setUserName(me.user.email.split("@")[0]);
        }
        if (progressRes) setProgress(progressRes);
        if (projectsRes?.ok) {
          const d = await projectsRes.json();
          // Filter to this track's buddies
          const filtered = (d.projects ?? []).filter((p: ProjectSummary) =>
            config.buddyIds.includes(p.buddyId)
          );
          setRecentProjects(filtered.slice(0, 4));
        }
      } catch (e) {
        console.warn("TrackHome fetch failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [track]);

  const openTutorWithBuddy = (buddyId: string) => {
    try { localStorage.setItem("studybuddy_active_buddy", buddyId); } catch { /* ignore */ }
    setScreen("tutor");
  };

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
        {/* Hero section — track-branded */}
        <div className={`rounded-3xl bg-gradient-to-br ${config.heroGradient} p-5 md:p-6 text-white shadow-lg`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-3xl">{config.heroEmoji}</span>
                <div>
                  <p className="text-xs opacity-80">Welcome back, {userName || "there"}!</p>
                  <p className="text-[10px] opacity-60 uppercase tracking-wide font-bold">{trackInfo.label}</p>
                </div>
              </div>
              <h1 className="text-xl md:text-2xl font-bold mt-2">{config.heroTitle}</h1>
              <p className="text-sm opacity-90 mt-1 leading-relaxed">{config.heroSubtitle}</p>
            </div>
            {/* Switch track button */}
            <button
              onClick={() => setShowTrackModal(true)}
              className="flex-shrink-0 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" /> Switch
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">Lv.{level}</span>
              <span className="text-[10px] opacity-70">level</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">{xp.toLocaleString()}</span>
              <span className="text-[10px] opacity-70">XP</span>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1">
                <Flame className="w-4 h-4" />
                <span className="text-lg font-bold">{streak}</span>
                <span className="text-[10px] opacity-70">streak</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {config.quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => setScreen(action.screen as any)}
                  className="text-left rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition p-3 flex flex-col gap-1.5"
                >
                  <span className={`w-9 h-9 rounded-xl ${action.color} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <p className="text-xs font-bold text-gray-900">{action.label}</p>
                  <p className="text-[10px] text-gray-500">{action.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* AI Tutor — embedded always-available */}
        <section className="mt-5">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-indigo-500" /> Ask your AI Tutor
              </h2>
              <button
                onClick={() => openTutorWithBuddy(config.buddyIds[0])}
                className="text-xs text-indigo-600 font-medium flex items-center"
              >
                Open full chat <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {/* Quick prompt buttons — one per buddy in this track */}
            <div className="flex flex-wrap gap-2">
              {config.buddyIds.map((buddyId) => {
                const meta = BUDDY_META[buddyId];
                if (!meta) return null;
                return (
                  <button
                    key={buddyId}
                    onClick={() => openTutorWithBuddy(buddyId)}
                    className={`px-3 py-1.5 rounded-full bg-gradient-to-br ${meta.accent} text-white text-xs font-semibold flex items-center gap-1 hover:brightness-95 transition`}
                  >
                    {meta.emoji} {meta.name}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Recent projects */}
        <section className="mt-5">
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
                Ask your AI Tutor to build something — then save it as a project.
              </p>
              <button
                onClick={() => openTutorWithBuddy(config.buddyIds[0])}
                className="mt-3 px-4 h-9 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                Open AI Tutor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {recentProjects.map((p) => {
                const meta = BUDDY_META[p.buddyId] ?? BUDDY_META.dev;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      (useApp as any).getState().setActiveProjectId?.(p.id);
                      const screenMap: Record<string, string> = {
                        dev: "devBuddy", data: "notebook", ml: "mlPlayground", web: "webBuilder",
                        backend: "backendBuddy", server: "serverBuddy", tvet: "tvetBuddy",
                      };
                      setScreen((screenMap[p.buddyId] ?? "projects") as any);
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

        {/* Explore link */}
        <section className="mt-5">
          <button
            onClick={() => setScreen("explore")}
            className="w-full rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 p-4 text-white text-left hover:brightness-95 transition flex items-center gap-3"
          >
            <Globe className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold">Explore the community</p>
              <p className="text-xs opacity-90">Browse, star, and fork public projects from other learners</p>
            </div>
            <ArrowRight className="w-5 h-5 flex-shrink-0" />
          </button>
        </section>
      </div>

      {/* Track Switch Modal */}
      <TrackSwitchModal
        open={showTrackModal}
        onClose={() => setShowTrackModal(false)}
        currentTrack={track}
      />
    </div>
  );
}
