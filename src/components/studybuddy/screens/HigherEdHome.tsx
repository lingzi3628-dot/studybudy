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
  Wrench, Code, Sparkles, FolderOpen, FlaskConical, Server,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Progress as ProgressData } from "../api";
import { getCourseByName } from "@/lib/education/catalog";

// Phase 51 — buddy metadata for the grid (mirrors src/lib/buddies/registry.ts but
// kept inline to avoid pulling the server-side registry into the client bundle)
const BUDDY_GRID = [
  { id: "study",   emoji: "📚", name: "StudyBuddy",    tagline: "K-12 tutor (Kenya CBC / KCSE)",     accent: "from-indigo-500 to-violet-500",  track: "k12" },
  { id: "dev",     emoji: "💻", name: "DevBuddy",      tagline: "Code, debug, refactor, ship",      accent: "from-emerald-500 to-teal-500",   track: "dev" },
  { id: "data",    emoji: "📊", name: "DataBuddy",     tagline: "Notebooks, pandas, SQL, EDA",       accent: "from-sky-500 to-cyan-500",       track: "data" },
  { id: "ml",      emoji: "🧠", name: "MLBuddy",       tagline: "Train, visualize, evaluate models", accent: "from-violet-500 to-fuchsia-500", track: "ml" },
  { id: "ai",      emoji: "🤖", name: "AIBuddy",       tagline: "Build AI apps: prompts, RAG, agents", accent: "from-fuchsia-500 to-purple-600", track: "aiapp" },
  { id: "web",     emoji: "🌐", name: "WebBuddy",      tagline: "Prompt → website → deploy",         accent: "from-amber-500 to-orange-500",  track: "web" },
  { id: "backend", emoji: "⚙️", name: "BackendBuddy", tagline: "APIs, SQL, databases, servers",     accent: "from-rose-500 to-pink-500",       track: "backend" },
  { id: "server",  emoji: "🖥️", name: "ServerBuddy",  tagline: "Linux, Docker, Nginx, deploy",      accent: "from-gray-700 to-gray-900",      track: "server" },
  { id: "tvet",    emoji: "🔧", name: "TVETBuddy",    tagline: "Technical & vocational training",   accent: "from-amber-600 to-red-600",      track: "tvet" },
] as const;

const TRACK_LABELS: Record<string, { label: string; emoji: string }> = {
  k12:        { label: "K-12",              emoji: "📚" },
  secondary:  { label: "Secondary",         emoji: "🏫" },
  university: { label: "University",        emoji: "🎓" },
  college:    { label: "College",            emoji: "🏛️" },
  tvet:       { label: "TVET",              emoji: "🔧" },
  dev:   { label: "Coding",        emoji: "💻" },
  data:  { label: "Data Science",  emoji: "📊" },
  ml:    { label: "Machine Learning", emoji: "🧠" },
  aiapp: { label: "AI App Dev",    emoji: "🤖" },
  mixed: { label: "Multiple Interests", emoji: "🎯" },
};

// ============================================================
// Phase 85 — Course-specific dashboard configuration
// For university/college/tvet users, the dashboard is tailored to
// their specific course. Each course has:
//   - A relevant emoji + tagline
//   - Tools that make sense for that course (NOT DevBuddy/MLBuddy
//     for a Law student!)
//   - Customized quick actions
//
// The "study" buddy is always available (it's the AI Tutor that
// knows about their course via the CourseKnowledge base).
// ============================================================

type CourseDashboard = {
  emoji: string;
  tagline: string;
  // Tool buttons to show (filtered subset of the existing quick tools)
  tools: ("tutor" | "documents" | "calendar" | "explore" | "notes" | "webBuilder" | "codeEditor" | "notebook" | "mlPlayground" | "sqlSandbox")[];
  // The course's subjects (from the catalog) — shown as chips
  subjects: string[];
};

// ============================================================
// Phase 85.1 — Per-category dashboard config
// Every course in the catalog has a `category` field. We map each
// category to a dashboard config (emoji + tagline + relevant tools).
// This covers ALL 110+ courses in the catalog automatically.
// ============================================================

const CATEGORY_DASHBOARDS: Record<string, { emoji: string; tagline: string; tools: CourseDashboard["tools"] }> = {
  // University categories
  "Health Sciences": {
    emoji: "🩺",
    tagline: "Clinical knowledge, anatomy, and case-based learning",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Engineering": {
    emoji: "⚙️",
    tagline: "Engineering principles, calculations, and design",
    tools: ["tutor", "documents", "calendar", "explore", "notes", "codeEditor", "notebook"],
  },
  "Computing": {
    emoji: "💻",
    tagline: "Code, build, and deploy software projects",
    tools: ["tutor", "documents", "calendar", "explore", "codeEditor", "notebook", "webBuilder", "sqlSandbox"],
  },
  "Business": {
    emoji: "💼",
    tagline: "Business cases, financial models, and market analysis",
    tools: ["tutor", "documents", "calendar", "explore", "notes", "notebook"],
  },
  "Law": {
    emoji: "⚖️",
    tagline: "Legal research, case studies, and statutory analysis",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Education": {
    emoji: "👩‍🏫",
    tagline: "Lesson planning, pedagogy, and teaching practice",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Sciences": {
    emoji: "🔬",
    tagline: "Scientific principles, lab work, and analysis",
    tools: ["tutor", "documents", "calendar", "explore", "notes", "notebook"],
  },
  "Agriculture": {
    emoji: "🌾",
    tagline: "Crop science, animal husbandry, and agribusiness",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Arts & Social Sciences": {
    emoji: "🎨",
    tagline: "Critical thinking, research, and analysis",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Hospitality": {
    emoji: "🍽️",
    tagline: "Hospitality operations, service, and management",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Architecture & Design": {
    emoji: "🏛️",
    tagline: "Design principles, drafting, and urban planning",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Media": {
    emoji: "📰",
    tagline: "Reporting, editing, and media production",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  // College categories (some overlap with university)
  "Social Sciences": {
    emoji: "🤝",
    tagline: "Community development, counseling, and social welfare",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Beauty & Cosmetology": {
    emoji: "💄",
    tagline: "Skincare, makeup, and salon management",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  // TVET categories
  "Engineering Trades": {
    emoji: "🔧",
    tagline: "Hands-on technical training and practical skills",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Building & Construction": {
    emoji: "🏗️",
    tagline: "Building, finishing, and construction trades",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Information & Communication Tech": {
    emoji: "💻",
    tagline: "ICT technician, networking, and computer repair",
    tools: ["tutor", "documents", "calendar", "explore", "notes", "codeEditor"],
  },
  "Fashion & Beauty": {
    emoji: "👗",
    tagline: "Fashion design, garment making, and beauty therapy",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Leather & Tannery": {
    emoji: "👞",
    tagline: "Leather technology and shoe making",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
  "Business Studies": {
    emoji: "📊",
    tagline: "Business, entrepreneurship, and office administration",
    tools: ["tutor", "documents", "calendar", "explore", "notes"],
  },
};

// Fallback per-track defaults (when course is null or category not found)
const TRACK_DEFAULTS: Record<string, { emoji: string; tagline: string; tools: CourseDashboard["tools"] }> = {
  university: { emoji: "🎓", tagline: "Your personalized learning workspace", tools: ["tutor", "documents", "calendar", "explore", "notes"] },
  college:    { emoji: "🏛️", tagline: "Your personalized learning workspace", tools: ["tutor", "documents", "calendar", "explore", "notes"] },
  tvet:       { emoji: "🔧", tagline: "Hands-on technical training and practical skills", tools: ["tutor", "documents", "calendar", "explore", "notes"] },
};

// Helper: return the dashboard config for a course, falling back to a sensible default
function getCourseDashboard(course: string | null, track: string): CourseDashboard {
  const defaultConfig = TRACK_DEFAULTS[track] || TRACK_DEFAULTS.university;

  if (!course) {
    return { ...defaultConfig, subjects: [] };
  }

  // Look up the course in the catalog to get its category + subjects
  const courseData = getCourseByName(course);
  if (courseData) {
    const categoryConfig = CATEGORY_DASHBOARDS[courseData.category];
    if (categoryConfig) {
      return {
        emoji: categoryConfig.emoji,
        tagline: categoryConfig.tagline,
        tools: categoryConfig.tools,
        subjects: courseData.subjects,
      };
    }
  }

  // Fallback: try substring matching on the course name (for courses not in catalog)
  const c = course.toLowerCase();
  for (const [catName, cfg] of Object.entries(CATEGORY_DASHBOARDS)) {
    const catKey = catName.toLowerCase();
    // Simple keyword match against category name keywords
    if (c.includes(catKey.split(" ")[0]) || c.includes(catKey.split(" & ")[0])) {
      return { ...cfg, subjects: courseData?.subjects || [] };
    }
  }

  return { ...defaultConfig, subjects: courseData?.subjects || [] };
}

// Quick tool definitions — used by both the dev-track grid and the course dashboard
const QUICK_TOOLS: Record<string, { label: string; sublabel: string; emoji: string; bgColor: string; screen?: string }> = {
  tutor:      { label: "AI Tutor",         sublabel: "Ask anything about your course", emoji: "🤖", bgColor: "bg-indigo-50 text-indigo-600" },
  documents:  { label: "Documents",        sublabel: "Notes & uploads",                 emoji: "📄", bgColor: "bg-emerald-50 text-emerald-600" },
  calendar:   { label: "Calendar",          sublabel: "Schedule & timetable",            emoji: "📅", bgColor: "bg-rose-50 text-rose-600" },
  explore:    { label: "Explore",           sublabel: "Course projects",                 emoji: "🧭", bgColor: "bg-amber-50 text-amber-600" },
  notes:      { label: "Notebook",          sublabel: "Take notes",                      emoji: "📝", bgColor: "bg-violet-50 text-violet-600" },
  webBuilder: { label: "Website Builder",   sublabel: "Prompt → live site",              emoji: "🌐", bgColor: "bg-amber-50 text-amber-600", screen: "webBuilder" },
  codeEditor: { label: "Code Editor",       sublabel: "Multi-file projects",             emoji: "💻", bgColor: "bg-emerald-50 text-emerald-600", screen: "devBuddy" },
  notebook:   { label: "Jupyter Notebook",  sublabel: "Data analysis",                   emoji: "📊", bgColor: "bg-sky-50 text-sky-600", screen: "notebook" },
  mlPlayground:{ label: "ML Playground",    sublabel: "Train models",                    emoji: "🧠", bgColor: "bg-violet-50 text-violet-600", screen: "mlBuddy" },
  sqlSandbox: { label: "SQL & API Sandbox", sublabel: "Schema → test",                   emoji: "⚙️", bgColor: "bg-rose-50 text-rose-600", screen: "backendBuddy" },
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
  const [userCourse, setUserCourse] = useState<string | null>(null);
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
          if (me.user?.course) setUserCourse(me.user.course);
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

  // Phase 85 — Course-specific dashboard for university/college/tvet users
  // For these tracks, show a tailored dashboard (only relevant tools, NOT all 8 buddies)
  const isHigherEdCourse = userTrack === "university" || userTrack === "college" || userTrack === "tvet";
  const courseDashboard = isHigherEdCourse ? getCourseDashboard(userCourse, userTrack) : null;

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

  // === Phase 85 — Course-specific dashboard for university/college/tvet users ===
  // A Law student sees: ⚖️ Law dashboard with AI Tutor, Documents, Calendar, Explore, Notes
  // A Medicine student sees: 🩺 Medicine dashboard with the same set
  // A CS student sees: 💻 Computing dashboard WITH Code Editor, Notebook, etc.
  // NO DevBuddy/MLBuddy/WebBuddy/etc. for non-coding courses.
  if (courseDashboard) {
    return (
      <div className="md:px-8 md:py-6">
        <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
          {/* Greeting + course badge */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Welcome back, {userName || "there"}! 👋</p>
              <h1 className="text-2xl font-bold text-gray-900">{userCourse || trackMeta.label}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{courseDashboard.tagline}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 flex items-center gap-1">
                {courseDashboard.emoji} {trackMeta.label}
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

          {/* AI Tutor hero card — the primary entry point */}
          <section className="mt-6">
            <button
              onClick={() => openTutorWithBuddy("study")}
              className="w-full text-left rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-5 text-white shadow-md hover:shadow-lg transition"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold">Ask your AI Tutor</p>
                  <p className="text-xs text-white/80 mt-0.5">
                    About {userCourse || "your course"} — I learn from your uploads
                  </p>
                  <p className="text-[10px] text-white/60 mt-2">Open full chat →</p>
                </div>
              </div>
            </button>
          </section>

          {/* Course-specific tools */}
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Your tools</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {courseDashboard.tools.map((toolKey) => {
                const tool = QUICK_TOOLS[toolKey];
                if (!tool) return null;
                return (
                  <button
                    key={toolKey}
                    onClick={() => {
                      if (toolKey === "tutor") openTutorWithBuddy("study");
                      else if (tool.screen) setScreen(tool.screen as any);
                      else if (toolKey === "documents") setScreen("bookshelf" as any);
                      else if (toolKey === "calendar") setScreen("calendar" as any);
                      else if (toolKey === "explore") setScreen("explore" as any);
                      else if (toolKey === "notes") setScreen("bookshelf" as any);
                    }}
                    className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition text-left"
                  >
                    <span className={`w-9 h-9 rounded-lg ${tool.bgColor} flex items-center justify-center text-lg`}>
                      {tool.emoji}
                    </span>
                    <p className="text-xs font-semibold text-gray-900">{tool.label}</p>
                    <p className="text-[10px] text-gray-500">{tool.sublabel}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Course subjects chips — shows what the AI Tutor can help with */}
          {courseDashboard.subjects.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Your subjects</h2>
              <p className="text-xs text-gray-500 mb-3">The AI Tutor can help you with these topics in your course</p>
              <div className="flex flex-wrap gap-2">
                {courseDashboard.subjects.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => openTutorWithBuddy("study")}
                    className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition"
                  >
                    {subject}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Recent projects */}
          {recentProjects.length > 0 && (
            <section className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Recent projects</h2>
                <button onClick={() => setScreen("bookshelf" as any)} className="text-xs text-indigo-600 font-semibold">See all →</button>
              </div>
              <div className="space-y-2">
                {recentProjects.map((p) => (
                  <div key={p.id} className="rounded-xl bg-white border border-gray-200 p-3 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
                      {(p.title || "P").charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{p.title}</p>
                      <p className="text-[10px] text-gray-500">{p.fileCount} file{p.fileCount !== 1 ? "s" : ""} · {new Date(p.updatedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Course knowledge status banner */}
          <section className="mt-6 rounded-2xl bg-violet-50 border border-violet-200 p-4">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-lg">🎓</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-900">Make your AI Tutor smarter</p>
                <p className="text-xs text-violet-700 mt-0.5">
                  Upload your course outline or syllabus (PDF/DOCX) in the AI Tutor chat
                  (🎓 button). The AI will parse it and give you course-specific answers.
                  Future students on the same course benefit too!
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // === Existing dashboard for dev tracks (dev/data/ml/web/backend/server/mixed) ===
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
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2.5">
            <button
              onClick={() => setScreen("webBuilder")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-amber-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-gray-900">Website Builder</p>
              <p className="text-[10px] text-gray-500">Prompt → live site</p>
            </button>
            {/* Phase 55 — SQL playground + API designer */}
            <button
              onClick={() => setScreen("backendBuddy")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-rose-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-gray-900">SQL &amp; API Sandbox</p>
              <p className="text-[10px] text-gray-500">Schema → spec → test</p>
            </button>
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
            {/* Phase 58 — ServerBuddy simulated DevOps lab */}
            <button
              onClick={() => setScreen("serverBuddy")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-emerald-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Server className="w-4 h-4" />
              </span>
              <p className="text-xs font-semibold text-gray-900">Server Lab</p>
              <p className="text-[10px] text-gray-500">Shell · Docker · Nginx</p>
            </button>
            <button
              onClick={() => setScreen("lab")}
              className="flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border border-gray-200 hover:border-rose-300 hover:shadow-sm transition text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <FlaskConical className="w-4 h-4" />
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
                      else if (p.buddyId === "server") setScreen("serverBuddy");
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
