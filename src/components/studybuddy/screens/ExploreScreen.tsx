"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, Search, Star, Loader2, Sparkles, TrendingUp, Clock,
  Compass, GraduationCap, BookOpen, Filter, X, Play, GitFork,
} from "lucide-react";
import { useApp } from "../store";

type Project = {
  id: string;
  title: string;
  description: string | null;
  track: string;
  gradeLevel: string | null;
  subject: string;
  category: string;
  tags: string[];
  projectUrl: string;
  thumbnailUrl: string | null;
  fileSize: number;
  viewCount: number;
  forkCount: number;
  starCount: number;
  isFeatured: boolean;
  createdAt: string;
};

type User = {
  track?: string | null;
  grade?: string | null;
  name?: string | null;
};

const TRACK_LABELS: Record<string, string> = {
  k12: "K-12 (CBC)",
  secondary: "Secondary (8-4-4)",
  university: "University",
  college: "College",
  tvet: "TVET (CDACC)",
  dev: "Developer",
};

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  interactive: { label: "Interactive Demo", emoji: "🎮" },
  tutorial:    { label: "Tutorial",        emoji: "📚" },
  game:        { label: "Educational Game", emoji: "🎯" },
  quiz:        { label: "Quiz",            emoji: "✅" },
  reference:   { label: "Reference",        emoji: "📖" },
  project:     { label: "Starter Project", emoji: "🚀" },
  demo:        { label: "Demo",            emoji: "🔬" },
};

const SORT_OPTIONS = [
  { id: "featured", label: "Featured", icon: Sparkles },
  { id: "recent",   label: "Most Recent", icon: Clock },
  { id: "trending", label: "Trending",    icon: TrendingUp },
];

export function ExploreScreen() {
  const { setScreen } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeSubject, setActiveSubject] = useState("All");
  const [activeCategory, setActiveCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const [playing, setPlaying] = useState<Project | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Load current user to know their track + grade
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me");
        if (r.ok) {
          const d = await r.json();
          setUser(d.user || d);
        }
      } catch {}
    })();
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/explore");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProjects(d.projects || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Compute unique subjects from the loaded projects
  const subjects = ["All", ...Array.from(new Set(projects.map(p => p.subject)))];

  // Filter by search + activeSubject + activeCategory
  let filtered = projects;
  if (activeSubject !== "All") filtered = filtered.filter(p => p.subject === activeSubject);
  if (activeCategory !== "All") filtered = filtered.filter(p => p.category === activeCategory);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  // Sort
  if (sort === "recent") {
    filtered = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === "trending") {
    filtered = [...filtered].sort((a, b) => b.viewCount - a.viewCount);
  } else {
    // featured: featured first, then by stars
    filtered = [...filtered].sort((a, b) =>
      (Number(b.isFeatured) - Number(a.isFeatured)) || (b.starCount - a.starCount)
    );
  }

  const featuredProjects = filtered.filter(p => p.isFeatured).slice(0, 5);

  // === Playing mode (iframe) ===
  if (playing) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="bg-gray-900 px-4 py-2 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <button onClick={() => setPlaying(null)} className="flex items-center gap-1 text-sm hover:text-indigo-400">
              <ChevronLeft className="w-4 h-4" /> Exit
            </button>
            <span className="font-bold text-sm truncate max-w-[40vw]">{playing.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={playing.projectUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-semibold">
              Open in new tab ↗
            </a>
            <button onClick={() => forkProject(playing)} className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-1">
              <GitFork className="w-3 h-3" /> Fork
            </button>
          </div>
        </div>
        <iframe src={playing.projectUrl} className="flex-1 w-full border-0" title={playing.title} allow="autoplay; fullscreen" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => setScreen("home")} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
          <Compass className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-sm font-bold text-gray-900 flex-1">Explore</h1>
        {/* User's track + grade badge */}
        {user && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{TRACK_LABELS[user.track || "k12"] || user.track || "K-12"}</span>
            {user.grade && <span className="opacity-70">· {user.grade}</span>}
          </div>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Empty state: no user (preview) OR projects for this user's track+grade */}
        {!loading && projects.length === 0 && (
          <div className="text-center py-20">
            <Compass className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-bold text-gray-900">No projects yet for your level</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {user
                ? `Projects uploaded by admins for ${TRACK_LABELS[user.track || "k12"] || "your track"}${user.grade ? " / " + user.grade : ""} will appear here. Ask your teacher or admin to upload some!`
                : "Sign in to see projects matched to your grade and subjects."}
            </p>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <>
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects, tags…"
                className="w-full h-10 rounded-full bg-white border border-gray-200 pl-10 pr-3 text-sm outline-none focus:border-indigo-400"
              />
            </div>

            {/* Subjects row */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
              {subjects.map((s) => (
                <button key={s} onClick={() => setActiveSubject(s)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeSubject === s ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                  {s}
                </button>
              ))}
            </div>

            {/* Categories + sort */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                <button onClick={() => setActiveCategory("All")}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === "All" ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                  All types
                </button>
                {Object.entries(CATEGORY_LABELS).map(([id, c]) => (
                  <button key={id} onClick={() => setActiveCategory(id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === id ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-full bg-white border border-gray-200 px-3 text-xs font-semibold flex-shrink-0">
                {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>

            {/* Featured */}
            {activeCategory === "All" && activeSubject === "All" && !search && featuredProjects.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Featured
                </h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {featuredProjects.map(p => <ProjectCard key={p.id} project={p} onPlay={() => setPlaying(p)} featured />)}
                </div>
              </section>
            )}

            {/* All projects grid */}
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-2">
                {search ? "Search Results" : activeSubject !== "All" || activeCategory !== "All" ? "Filtered" : "All Projects"}
                {" ("}{filtered.length}{")"}
              </h2>
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Filter className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-xs">No projects match your filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filtered.map(p => <ProjectCard key={p.id} project={p} onPlay={() => setPlaying(p)} />)}
                </div>
              )}
            </section>
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );

  function forkProject(p: Project) {
    // Phase 11 — in-app fork: copy project files to user's project list
    if (!confirm(`Fork "${p.title}"?\n\nThis copies all files to your projects. You can then edit them in the Web Builder.`)) return;

    fetch(`/api/explore/${p.id}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buddyId: "web" }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          alert(`✅ Forked "${p.title}"!\n\nThe project is now in your projects list.${d.githubRepoUrl ? `\n\nGitHub repo created: ${d.githubRepoUrl}` : ""}`);
          // Navigate to the Web Builder with the new project
          const { setActiveProjectId, setScreen } = useApp.getState();
          setActiveProjectId(d.project.id);
          setScreen("webBuilder");
        } else {
          alert(`❌ Fork failed: ${d.error || "Unknown error"}`);
        }
      })
      .catch(e => alert(`❌ Network error: ${e?.message ?? e}`));
  }
}

function ProjectCard({ project, onPlay, featured }: { project: Project; onPlay: () => void; featured?: boolean }) {
  const cat = CATEGORY_LABELS[project.category] || CATEGORY_LABELS.demo;
  return (
    <button onClick={onPlay} className={`group relative ${featured ? "w-44 flex-shrink-0" : ""} text-left`}>
      <div className={`relative ${featured ? "w-44 h-24" : "aspect-square"} rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 overflow-hidden border border-gray-200 group-hover:border-indigo-400 transition`}>
        {project.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover" />
        ) : project.projectUrl ? (
          // Phase 10 — When no thumbnail image was uploaded, render a live
          // mini-preview of the actual site using an iframe. This shows the
          // site's own code as the thumbnail instead of a generic emoji.
          // The iframe is scaled down to fit the card + pointer-events-none
          // so clicks pass through to the button.
          <div className="w-full h-full relative overflow-hidden">
            <iframe
              src={project.projectUrl}
              className="absolute top-0 left-0 border-0 pointer-events-none"
              style={{
                width: "800px",
                height: featured ? "450px" : "800px",
                transform: featured ? "scale(0.18)" : "scale(0.5)",
                transformOrigin: "top left",
              }}
              sandbox="allow-scripts"
              loading="lazy"
              title={project.title}
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <span className="text-3xl">{cat.emoji}</span>
            <GraduationCap className="w-5 h-5 text-indigo-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <Play className="w-6 h-6 text-white fill-white" />
        </div>
        {project.isFeatured && (
          <div className="absolute top-1 left-1 px-1 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[8px] font-bold flex items-center gap-0.5">
            <Star className="w-2 h-2 fill-amber-900 text-amber-900" /> FEATURED
          </div>
        )}
        {project.viewCount > 0 && (
          <div className="absolute top-1 right-1 px-1 py-0.5 rounded-full bg-black/60 text-white text-[8px] font-bold">
            {project.viewCount} views
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-900 mt-1.5 truncate">{project.title}</p>
      <p className="text-[10px] text-gray-400 truncate">
        {cat.emoji} {project.subject} · {project.gradeLevel || "All levels"}
      </p>
    </button>
  );
}
