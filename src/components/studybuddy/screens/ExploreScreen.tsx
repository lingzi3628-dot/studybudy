"use client";

/**
 * ExploreScreen — Phase 60
 *
 * Public project marketplace. Browse, search, star, and fork projects
 * shared by other users across all buddies.
 *
 * Features:
 *   - Filter by buddy type (All / Code / Data / ML / Web / Backend / Server / TVET)
 *   - Search by title, description, or tags
 *   - Sort by stars (default) / recent / trending
 *   - Star a project (increments starCount)
 *   - Fork a project (copies all files to your account)
 *   - Tap to open (if it's yours) or view details (if it's someone else's)
 */

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, Search, Star, GitFork, Loader2, Globe, Sparkles, TrendingUp, Clock,
} from "lucide-react";
import { useApp } from "../store";

type ExploreProject = {
  id: string;
  buddyId: string;
  title: string;
  description: string | null;
  tags: string[];
  starCount: number;
  fileCount: number;
  entryFile: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
  isOwn: boolean;
};

const BUDDY_FILTERS = [
  { id: "",        label: "All",      emoji: "🌐" },
  { id: "dev",     label: "Code",     emoji: "💻" },
  { id: "data",    label: "Data",     emoji: "📊" },
  { id: "ml",      label: "ML",       emoji: "🧠" },
  { id: "web",     label: "Web",      emoji: "🌐" },
  { id: "backend", label: "Backend",  emoji: "⚙️" },
  { id: "server",  label: "Server",   emoji: "🖥️" },
  { id: "tvet",    label: "TVET",     emoji: "🔧" },
];

const SORT_OPTIONS = [
  { id: "stars",    label: "Top Stars",   icon: Star },
  { id: "recent",   label: "Most Recent", icon: Clock },
  { id: "trending", label: "Trending",    icon: TrendingUp },
];

const BUDDY_META: Record<string, { emoji: string; name: string; accent: string }> = {
  study:   { emoji: "📚", name: "StudyBuddy",    accent: "from-indigo-500 to-violet-500" },
  dev:     { emoji: "💻", name: "DevBuddy",      accent: "from-emerald-500 to-teal-500" },
  data:    { emoji: "📊", name: "DataBuddy",     accent: "from-sky-500 to-cyan-500" },
  ml:      { emoji: "🧠", name: "MLBuddy",       accent: "from-violet-500 to-fuchsia-500" },
  web:     { emoji: "🌐", name: "WebBuddy",      accent: "from-amber-500 to-orange-500" },
  backend: { emoji: "⚙️", name: "BackendBuddy", accent: "from-rose-500 to-pink-500" },
  server:  { emoji: "🖥️", name: "ServerBuddy",  accent: "from-gray-700 to-gray-900" },
  tvet:    { emoji: "🔧", name: "TVETBuddy",    accent: "from-amber-600 to-red-600" },
};

export function ExploreScreen() {
  const { setScreen } = useApp();
  const [projects, setProjects] = useState<ExploreProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [buddyFilter, setBuddyFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState("stars");
  const [forking, setForking] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (buddyFilter) params.set("buddyId", buddyFilter);
      if (searchQuery) params.set("q", searchQuery);
      params.set("sort", sort);
      const r = await fetch(`/api/projects/explore?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProjects(d.projects ?? []);
    } catch (e) {
      console.warn("Explore fetch failed", e);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [buddyFilter, searchQuery, sort]);

  useEffect(() => { load(); }, [load]);

  const handleStar = async (id: string) => {
    if (starred.has(id)) return; // already starred
    setStarred((prev) => new Set(prev).add(id));
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, starCount: p.starCount + 1 } : p));
    try {
      await fetch(`/api/projects/${id}/star`, { method: "POST" });
    } catch { /* ignore */ }
  };

  const handleFork = async (id: string, title: string) => {
    if (!confirm(`Fork "${title}"? This copies all files to your account.`)) return;
    setForking(id);
    try {
      const r = await fetch(`/api/projects/${id}/fork`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      alert(`✓ Forked! Find it in My Projects as "${d.project.title}".`);
    } catch (e: any) {
      alert(`Fork failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setForking(null);
    }
  };

  const openProject = (p: ExploreProject) => {
    if (p.isOwn) {
      const state = (useApp as any).getState();
      state.setActiveProjectId?.(p.id);
      const screenMap: Record<string, string> = {
        dev: "devBuddy", data: "notebook", ml: "mlPlayground", web: "webBuilder",
        backend: "backendBuddy", server: "serverBuddy", tvet: "tvetBuddy",
      };
      setScreen((screenMap[p.buddyId] ?? "projects") as any);
    } else {
      // For other users' projects, fork first then open
      handleFork(p.id, p.title);
    }
  };

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Globe className="w-6 h-6 text-indigo-500" /> Explore
            </h1>
            <p className="text-xs text-gray-500">Browse public projects from the community. Star your favorites, fork to remix.</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects, tags, descriptions..."
            className="w-full h-10 rounded-full bg-white border border-gray-200 pl-9 pr-4 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        {/* Buddy filters */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
          {BUDDY_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setBuddyFilter(f.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                buddyFilter === f.id ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:border-indigo-300"
              }`}
            >
              {f.emoji} {f.label}
            </button>
          ))}
        </div>

        {/* Sort options */}
        <div className="flex gap-1.5 mb-4">
          {SORT_OPTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                  sort === s.id ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-3 h-3" /> {s.label}
              </button>
            );
          })}
        </div>

        {/* Project grid */}
        {loading ? (
          <div className="flex items-center justify-center text-gray-400 py-12">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="ml-2 text-sm">Loading projects…</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <Sparkles className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="mt-3 text-sm text-gray-600">No public projects yet</p>
            <p className="mt-1 text-xs text-gray-500">Be the first! Open one of your projects and toggle "Make public".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => {
              const meta = BUDDY_META[p.buddyId] ?? BUDDY_META.dev;
              const isStarred = starred.has(p.id);
              return (
                <div
                  key={p.id}
                  className="rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  <div className={`h-2 bg-gradient-to-br ${meta.accent}`} />
                  <div className="p-3">
                    {/* Author + buddy badge */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                        {(p.author.name?.[0] ?? "?").toUpperCase()}
                      </div>
                      <span className="text-[10px] text-gray-500 truncate">{p.author.name}</span>
                      {p.isOwn && <span className="text-[9px] font-bold text-indigo-600 ml-auto">Yours</span>}
                    </div>

                    {/* Title + description */}
                    <p className="text-sm font-semibold text-gray-900 line-clamp-1">{p.title}</p>
                    {p.description && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{p.description}</p>}

                    {/* Tags + stats */}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <span className="text-base">{meta.emoji}</span>
                      <span className="text-[10px] font-bold uppercase text-gray-400">{meta.name}</span>
                      {p.tags.filter(t => t !== "fork").slice(0, 2).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{t}</span>
                      ))}
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {p.fileCount} {p.fileCount === 1 ? "file" : "files"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 mt-2.5">
                      <button
                        onClick={() => openProject(p)}
                        className="flex-1 px-2.5 h-8 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition"
                      >
                        {p.isOwn ? "Open" : "Fork & Open"}
                      </button>
                      <button
                        onClick={() => handleStar(p.id)}
                        disabled={isStarred || p.isOwn}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                          isStarred ? "bg-amber-100 text-amber-500" : "bg-gray-50 text-gray-400 hover:bg-amber-50 hover:text-amber-500"
                        } disabled:opacity-40`}
                        title={isStarred ? "Starred!" : "Star this project"}
                      >
                        <Star className={`w-3.5 h-3.5 ${isStarred ? "fill-amber-400 text-amber-400" : ""}`} />
                      </button>
                      {!p.isOwn && (
                        <button
                          onClick={() => handleFork(p.id, p.title)}
                          disabled={forking === p.id}
                          className="w-8 h-8 rounded-lg bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 flex items-center justify-center transition disabled:opacity-50"
                          title="Fork this project"
                        >
                          {forking === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitFork className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    {/* Stars + date */}
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                      <span className="flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> {p.starCount}
                      </span>
                      <span>·</span>
                      <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
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
