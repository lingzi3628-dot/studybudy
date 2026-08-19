"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  Route,
  Sparkles,
  Loader2,
  AlertCircle,
  Check,
  BookOpen,
  Target,
  Trophy,
  ChevronRight,
  ChevronDown,
  Lock,
  Play,
  Coins,
  Crown,
  Flame,
  Zap,
  Map as MapIcon,
  Bot,
  FileText,
  ListChecks,
  Layers,
  Video,
  Lightbulb,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../api";

type ItemType = "lesson" | "flashcards" | "quiz" | "concept_map" | "video" | "project" | "study_room_start";

type PathItem = {
  id: string;
  type: ItemType;
  title: string;
  orderIndex: number;
  difficulty: string;
  isRequired: boolean;
  contentId: string | null;
  userProgress?: { status: string; score: number | null; completedAt: string | null; attempts: number }[];
};

type PathModule = {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  status: "locked" | "unlocked" | "completed";
  items: PathItem[];
};

type Path = {
  id: string;
  skill: string;
  level: string;
  goal: string | null;
  subject: string | null;
  coverImageUrl: string | null;
  status: string;
  isTemplate: boolean;
  modules: PathModule[];
};

type View = "list" | "create" | "detail";

const ITEM_ICONS: Record<string, any> = {
  lesson: BookOpen,
  flashcards: Layers,
  quiz: ListChecks,
  concept_map: MapIcon,
  video: Video,
  project: Lightbulb,
  study_room_start: Trophy,
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  hard: "bg-rose-50 text-rose-700",
};

export function LearningPathScreen() {
  const { setScreen, activeTopicId, setActiveTopicId, setActiveConceptMapId, setActiveStudySetId } = useApp() as any;
  const [view, setView] = useState<View>("list");
  const [paths, setPaths] = useState<Path[]>([]);
  const [templates, setTemplates] = useState<Path[]>([]);
  const [activePath, setActivePath] = useState<Path | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  // Create form
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("beginner");
  const [goal, setGoal] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/learning-paths");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to load");
      setPaths(d.paths ?? []);
      setTemplates(d.templates ?? []);
      if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const generate = async () => {
    if (!skill.trim()) {
      setError("Enter a skill/topic first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/learning-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: skill.trim(), level, goal: goal.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setError(d.error);
          return;
        }
        throw new Error(d.error ?? "Generate failed");
      }
      setActivePath(d.learningPath);
      setView("detail");
      setSkill("");
      setGoal("");
      if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
      showToast("Learning path created 🚀");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Generate failed");
    } finally {
      setBusy(false);
    }
  };

  const cloneTemplate = async (templateId: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/learning-paths/${templateId}/clone`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) { setError(d.error); return; }
        throw new Error(d.error ?? "Clone failed");
      }
      setActivePath(d.learningPath);
      setView("detail");
      showToast(d.message ?? "Template cloned ✓");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Clone failed");
    } finally {
      setBusy(false);
    }
  };

  const openPath = async (id: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/learning-paths/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to load");
      setActivePath(d.learningPath);
      setView("detail");
      if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  };

  const startItem = async (pathId: string, item: PathItem) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/learning-paths/${pathId}/start-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) { setError(d.error); return; }
        throw new Error(d.error ?? "Start failed");
      }
      if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);

      // Route based on item type + content
      if (item.type === "study_room_start" && d.content?.payload?.topicId) {
        setActiveTopicId(d.content.payload.topicId);
        setScreen("study");
        return;
      }
      if (item.type === "concept_map" && d.content?.payload?.conceptMapId) {
        setActiveConceptMapId(d.content.payload.conceptMapId);
        setScreen("conceptMap");
        return;
      }
      if ((item.type === "flashcards" || item.type === "quiz") && d.content?.payload?.studySetId) {
        setActiveStudySetId(d.content.payload.studySetId);
        setScreen(item.type === "flashcards" ? "flashcards" : "quiz");
        return;
      }
      if (item.type === "video" && d.content?.payload?.videos?.length) {
        // For MVP: just show a toast with video count, real player can be added
        showToast(`Found ${d.content.payload.videos.length} videos for "${item.title}"`);
      }
      if (item.type === "lesson" && d.content?.payload?.content) {
        showToast("Lesson loaded ✓");
      }
      if (item.type === "project" && d.content?.payload?.prompt) {
        showToast("Project prompt: " + d.content.payload.prompt.slice(0, 80) + "…");
      }
      // Reload path to reflect in_progress
      await openPath(pathId);
    } catch (e: any) {
      setError(e?.message ?? "Start failed");
    } finally {
      setBusy(false);
    }
  };

  const completeItem = async (pathId: string, item: PathItem, status: "completed" | "failed" = "completed", score?: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/learning-paths/${pathId}/complete-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, status, score }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Complete failed");
      if (d.xpGained) showToast(`+${d.xpGained} XP earned ${d.leveledUp ? "— Level up! 🎉" : ""}`);
      if (d.pathCompleted) showToast("🎉 Path completed! You've mastered the journey.");
      // Reload path
      await openPath(pathId);
    } catch (e: any) {
      setError(e?.message ?? "Complete failed");
    } finally {
      setBusy(false);
    }
  };

  // ============ LIST VIEW ============
  if (view === "list") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
              <Route className="w-4 h-4 text-indigo-600" />
              <h1 className="text-base font-bold text-gray-900">Learning Paths</h1>
            </div>
            {tokenBalance !== null && (
              <button onClick={() => setScreen("billing")} className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-semibold">
                <Coins className="w-3 h-3" /> {tokenBalance.toLocaleString()}
              </button>
            )}
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                {/upgrade|premium|limit|plan/i.test(error) && (
                  <button onClick={() => setScreen("premium")} className="mt-1 text-indigo-600 font-semibold underline">Upgrade →</button>
                )}
              </div>
            </div>
          )}

          {/* Your paths */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900">Your Active Paths</h2>
              <button
                onClick={() => { setView("create"); setError(null); }}
                className="px-3 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" /> New Path
              </button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="ml-2 text-xs">Loading…</span>
              </div>
            ) : paths.length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center">
                <Route className="w-8 h-8 mx-auto text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No active paths yet.</p>
                <button
                  onClick={() => { setView("create"); setError(null); }}
                  className="mt-3 px-4 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                >
                  Generate your first path →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {paths.map((p) => {
                  const totalItems = (p.modules ?? []).reduce((sum, m) => sum + (m.items?.length ?? 0), 0);
                  return (
                    <button
                      key={p.id}
                      onClick={() => openPath(p.id)}
                      className="w-full rounded-2xl bg-white border border-gray-200 p-3 text-left hover:border-indigo-300 hover:shadow-md transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center flex-shrink-0">
                          <Route className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{p.skill}</p>
                          <p className="text-[11px] text-gray-500 truncate">
                            {p.level} · {p.modules?.length ?? 0} modules · {totalItems} items
                            {p.subject ? ` · ${p.subject}` : ""}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Templates */}
          {templates.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-500" /> Public Templates
              </h2>
              <div className="space-y-2">
                {templates.map((t) => {
                  const totalItems = (t.modules ?? []).reduce((sum, m) => sum + (m.items?.length ?? 0), 0);
                  return (
                    <button
                      key={t.id}
                      onClick={() => cloneTemplate(t.id)}
                      disabled={busy}
                      className="w-full rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3 text-left hover:border-amber-300 transition disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center flex-shrink-0">
                          <Crown className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.skill}</p>
                          <p className="text-[11px] text-gray-500 truncate">
                            Template · {t.modules?.length ?? 0} modules · {totalItems} items · {t.level}
                          </p>
                        </div>
                        <button className="px-3 h-7 rounded-full bg-amber-600 text-white text-[10px] font-semibold">
                          Clone
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
        {toast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ============ CREATE VIEW ============
  if (view === "create") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="px-4 h-14 flex items-center gap-2">
            <button onClick={() => { setView("list"); setError(null); }} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-900">Generate Learning Path</h1>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 p-5">
            <p className="text-xs text-gray-600 mb-4">
              The AI will generate a 4-week structured learning path with modules and items
              (lessons, flashcards, quizzes, concept maps, videos, projects).
              Each item's content is generated on-demand when you start it.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Skill / Topic</label>
                <input
                  type="text"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  placeholder="e.g. Learn Calculus, Master Spanish, World History"
                  className="mt-1.5 w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Level</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {["beginner", "intermediate", "advanced"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={`p-2 rounded-xl text-xs font-semibold capitalize transition ${level === l ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Goal <span className="text-gray-400 normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Pass the AP exam, have a 10-min conversation in Spanish…"
                  rows={3}
                  className="mt-1.5 w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-500" />
                  Cost: <span className="font-semibold text-gray-700">500 tokens</span>
                </span>
                {tokenBalance !== null && (
                  <span>You have: <span className="font-semibold text-gray-700">{tokenBalance.toLocaleString()}</span></span>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{error}</p>
                    {/upgrade|premium|limit|plan/i.test(error) && (
                      <button onClick={() => setScreen("premium")} className="mt-1 text-indigo-600 font-semibold underline">Upgrade →</button>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={generate}
                disabled={busy || !skill.trim()}
                className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate Path</>}
              </button>
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] text-gray-400">
            Free users: 1 active path. Premium: unlimited + template cloning.
          </p>
        </div>
      </div>
    );
  }

  // ============ DETAIL VIEW ============
  if (view === "detail" && activePath) {
    const totalItems = (activePath.modules ?? []).reduce((sum, m) => sum + (m.items?.length ?? 0), 0);
    const completedItems = (activePath.modules ?? []).flatMap((m) => m.items ?? []).filter((i) => i.userProgress?.[0]?.status === "completed").length;
    const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="px-4 h-14 flex items-center gap-2">
            <button onClick={() => { setView("list"); setActivePath(null); }} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
            <Route className="w-4 h-4 text-indigo-600" />
            <h1 className="text-sm font-bold text-gray-900 truncate flex-1">{activePath.skill}</h1>
            {tokenBalance !== null && (
              <button onClick={() => setScreen("billing")} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-semibold flex items-center gap-1">
                <Coins className="w-3 h-3" /> {tokenBalance.toLocaleString()}
              </button>
            )}
          </div>
          {/* Progress bar */}
          <div className="px-4 pb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500 font-semibold">{completedItems} / {totalItems} items</span>
              <span className="text-[10px] text-indigo-600 font-bold">{percent}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                {/upgrade|premium|limit|plan/i.test(error) && (
                  <button onClick={() => setScreen("premium")} className="mt-1 text-indigo-600 font-semibold underline">Upgrade →</button>
                )}
              </div>
            </div>
          )}

          {activePath.modules?.map((module, mIdx) => (
            <ModuleCard
              key={module.id}
              module={module}
              pathId={activePath.id}
              onStartItem={startItem}
              onCompleteItem={completeItem}
              busy={busy}
            />
          ))}
        </div>

        {toast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ============ Module card ============
function ModuleCard({ module, pathId, onStartItem, onCompleteItem, busy }: {
  module: PathModule;
  pathId: string;
  onStartItem: (pathId: string, item: PathItem) => void;
  onCompleteItem: (pathId: string, item: PathItem, status?: "completed" | "failed", score?: number) => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(module.status !== "completed");
  const isLocked = module.status === "locked";

  return (
    <section className={`rounded-2xl bg-white border overflow-hidden ${isLocked ? "border-gray-200 opacity-60" : module.status === "completed" ? "border-emerald-200" : "border-indigo-200"}`}>
      <button
        onClick={() => !isLocked && setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 text-left"
        disabled={isLocked}
      >
        <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          module.status === "completed" ? "bg-emerald-100 text-emerald-600"
          : isLocked ? "bg-gray-100 text-gray-400"
          : "bg-indigo-100 text-indigo-600"
        }`}>
          {module.status === "completed" ? <Check className="w-4 h-4" />
            : isLocked ? <Lock className="w-4 h-4" />
            : <span className="text-xs font-bold">{module.orderIndex + 1}</span>}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{module.title}</p>
          <p className="text-[10px] text-gray-500 capitalize">
            {module.items?.length ?? 0} items · {module.status}
          </p>
        </div>
        {!isLocked && (
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {expanded && !isLocked && module.items && (
        <div className="border-t border-gray-100">
          {module.items.map((item, iIdx) => {
            const Icon = ITEM_ICONS[item.type] ?? BookOpen;
            const prog = item.userProgress?.[0];
            const status = prog?.status ?? "not_started";
            const isComplete = status === "completed";
            const isInProgress = status === "in_progress";
            const isItemLocked = false; // module already unlocked, items inherit
            return (
              <div
                key={item.id}
                className={`px-4 py-3 flex items-center gap-3 ${iIdx > 0 ? "border-t border-gray-50" : ""}`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isComplete ? "bg-emerald-100 text-emerald-600"
                  : isItemLocked ? "bg-gray-100 text-gray-400"
                  : "bg-indigo-50 text-indigo-600"
                }`}>
                  {isComplete ? <Check className="w-4 h-4" />
                    : isItemLocked ? <Lock className="w-3.5 h-3.5" />
                    : <Icon className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{item.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-400 capitalize">{item.type.replace("_", " ")}</span>
                    {item.difficulty && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize ${DIFFICULTY_COLORS[item.difficulty] ?? DIFFICULTY_COLORS.medium}`}>
                        {item.difficulty}
                      </span>
                    )}
                    {item.isRequired === false && <span className="text-[9px] text-gray-400">(optional)</span>}
                    {isInProgress && <span className="text-[9px] text-amber-600 font-semibold">In progress</span>}
                  </div>
                </div>
                {!isComplete && (
                  <button
                    onClick={() => onStartItem(pathId, item)}
                    disabled={busy}
                    className="flex-shrink-0 px-3 h-7 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Play className="w-2.5 h-2.5" /> {isInProgress ? "Resume" : "Start"}
                  </button>
                )}
                {isComplete && (
                  <span className="flex-shrink-0 text-[10px] text-emerald-600 font-semibold">✓ Done</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
