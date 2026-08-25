"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X, Loader2, AlertCircle, Flame, Coins, Zap, Trophy,
  ChevronRight, Lock, Check, Play, Plus, Route,
  Sparkles, Bot, BookOpen,
} from "lucide-react";
import { useApp } from "../store";

type PathNode = {
  id: string;
  title: string;
  status: "completed" | "current" | "locked" | "unlocked";
  itemCount: number;
  completedItems: number;
};

/**
 * PathDashboard — Phase 17: Duolingo-style vertical path map.
 *
 * Replaces the Home screen. Shows the active Learning Path as a
 * scrollable node map with connectors, status indicators, and a
 * "Start" button on the current node.
 */
export function PathDashboard() {
  const { setScreen, setActiveTopicId, setActiveConceptMapId, setActiveStudySetId } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [tokens, setTokens] = useState<number | null>(null);
  const [coins, setCoins] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [showCreatePath, setShowCreatePath] = useState(false);
  const [pathForm, setPathForm] = useState({ skill: "", level: "beginner", goal: "" });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pathRes, xpRes, balRes] = await Promise.all([
        fetch("/api/dashboard/path"),
        fetch("/api/user/xp"),
        fetch("/api/user/balances"),
      ]);
      if (pathRes.ok) {
        const d = await pathRes.json();
        setData(d);
      }
      if (xpRes.ok) {
        const d = await xpRes.json();
        setStreak(d.streak ?? 0);
        setLevel(d.level ?? 1);
      }
      if (balRes.ok) {
        const d = await balRes.json();
        setTokens(d.tokens ?? 0);
        setCoins(d.coins ?? 0);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refetch on window focus (when user returns from Study Room/Classroom)
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const createPath = async () => {
    if (!pathForm.skill.trim()) {
      setError("Enter a skill/topic");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/paths/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill: pathForm.skill.trim(),
          level: pathForm.level,
          goal: pathForm.goal.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setError(d.error);
          return;
        }
        throw new Error(d.error ?? "Failed");
      }
      setToast("Learning path created! 🚀");
      setTimeout(() => setToast(null), 2500);
      setShowCreatePath(false);
      setPathForm({ skill: "", level: "beginner", goal: "" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    }
    setBusy(false);
  };

  const [startingNode, setStartingNode] = useState<string | null>(null);

  const startNode = async (node: PathNode) => {
    if (node.status === "locked" || startingNode) return;
    setStartingNode(node.id);
    try {
      const topicId = data?.path?.topicId;
      const skill = data?.path?.skill;
      if (topicId) {
        // Have topicId — go to Study Room
        (useApp.getState() as any).setActiveTopicId(topicId);
        setScreen("study");
      } else if (skill) {
        // No topicId — find or create a topic from the skill name
        // Use the /api/classroom/start endpoint which now accepts { skill }
        // and will find/create a topic, but we still go to Study Room (not classroom)
        const r = await fetch("/api/classroom/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill }),
        });
        const d = await r.json();
        if (r.ok && d.session) {
          const sessionTopicId = d.session?.topicId;
          if (sessionTopicId) {
            // Set topicId and go to Study Room (NOT classroom)
            // The user can start the classroom from the Study Room's Tools Workbench
            (useApp.getState() as any).setActiveTopicId(sessionTopicId);
            setScreen("study");
          } else {
            setToast("Could not find topic. Try refreshing.");
            setTimeout(() => setToast(null), 3000);
          }
        } else if (r.status === 402 && d.needsUpgrade) {
          setToast(d.error ?? "Need more tokens");
          setTimeout(() => setToast(null), 4000);
        } else {
          setToast(d.error ?? "Failed to start. Please try again.");
          setTimeout(() => setToast(null), 3000);
        }
      } else {
        setToast("No topic found. Create a path first.");
        setTimeout(() => setToast(null), 3000);
      }
    } catch (e: any) {
      setToast("Failed to start. Please try again.");
      setTimeout(() => setToast(null), 3000);
    }
    setStartingNode(null);
  };

  // Continue Learning card (for classroom sessions)
  const [classroomSession, setClassroomSession] = useState<any>(null);
  useEffect(() => {
    // Check for active classroom sessions
    fetch("/api/user/rental-status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { /* not relevant */ })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-violet-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const hasPath = data?.hasPath ?? false;
  const path = data?.path;
  const nodes: PathNode[] = data?.nodes ?? [];
  // Handle progress being a number OR an object {total, completed, percent}
  const progressPct = typeof path?.progress === "number"
    ? path.progress
    : path?.progress?.percent ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-violet-50">
      <div className="max-w-md mx-auto px-4 py-4 pb-24 animate-slide-up">
        {/* Greeting */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500">
            {(() => {
              const h = new Date().getHours();
              if (h < 12) return "Good morning";
              if (h < 18) return "Good afternoon";
              return "Good evening";
            })()}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">
            {data?.userName?.split(" ")[0] ?? data?.userEmail?.split("@")[0] ?? "there"} 👋
          </h1>
        </div>

        {/* Phase 22e — Continue where you left off banner */}
        <ResumeSessionBanner />

        {/* Phase 22 — Netflix-style subject cards (main focus) */}
        <CurriculumSubjectsBanner />

        {/* Quick links row */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setScreen("calendar")}
            className="rounded-2xl bg-white border border-gray-200 p-3 hover:border-indigo-300 transition flex items-center gap-2 text-left"
          >
            <span className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Flame className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900">Calendar</p>
              <p className="text-[10px] text-gray-500">Streak + progress</p>
            </div>
          </button>
          <button
            onClick={() => setScreen("exam")}
            className="rounded-2xl bg-white border border-gray-200 p-3 hover:border-indigo-300 transition flex items-center gap-2 text-left"
          >
            <span className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Trophy className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900">Exams</p>
              <p className="text-[10px] text-gray-500">Test yourself</p>
            </div>
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span>{error}</span>
              {/upgrade|premium/i.test(error) && (
                <button onClick={() => setScreen("premium")} className="ml-1 text-indigo-600 font-semibold underline">Upgrade →</button>
              )}
            </div>
          </div>
        )}

        {/* Stats row */}
        {(streak > 0 || tokens !== null || coins !== null) && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs">
            {streak > 0 && (
              <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-semibold">
                <Flame className="w-3.5 h-3.5" /> {streak} day streak
              </span>
            )}
            {tokens !== null && (
              <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full font-semibold">
                <Zap className="w-3.5 h-3.5" /> {tokens}
              </span>
            )}
            {coins !== null && (
              <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full font-semibold">
                <Coins className="w-3.5 h-3.5" /> {coins}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Phase 22 — Curriculum subjects banner
// ---------------------------------------------------------------------
// Shows the user's curriculum subjects (from the admin-curated DB) at the
// top of the dashboard. Each subject card shows the topic count and links
// to a subject detail page (TODO: build the subject detail screen).
//
// Falls back to nothing if the user's grade isn't in the curriculum DB yet
// (e.g. a Grade 5 user when only Grade 1 is ready).

function CurriculumSubjectsBanner() {
  const { setScreen, setActiveCurriculumSubjectId } = useApp();
  const [subjects, setSubjects] = useState<Array<{
    id: string;
    name: string;
    icon: string;
    imageUrl: string | null;
    color: string;
    description: string | null;
    status: string; // 'locked' | 'unlocked'
    topicCount: number;
  }>>([]);
  const [gradeName, setGradeName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) return;
        const me = await meRes.json();
        if (!mounted || !me.authed) return;
        const userGrade = me.user?.grade;
        if (!userGrade) return;
        setGradeName(userGrade);

        const gradesRes = await fetch("/api/curriculum/grades");
        if (!gradesRes.ok) return;
        const gradesData = await gradesRes.json();
        const matchingGrade = (gradesData.grades ?? []).find(
          (g: any) => g.name.toLowerCase() === String(userGrade).toLowerCase() && g.status === "ready"
        );
        if (!matchingGrade) return;

        const subjectsRes = await fetch(`/api/curriculum/subjects?gradeId=${matchingGrade.id}`);
        if (!subjectsRes.ok) return;
        const subjectsData = await subjectsRes.json();
        if (mounted) {
          setSubjects(subjectsData.subjects ?? []);
        }
      } catch {
        // best-effort — fail silently
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (subjects.length === 0) return null;

  return (
    <div className="mb-4">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">
            {gradeName ? `${gradeName} subjects` : "Your subjects"}
          </h2>
          <p className="text-[11px] text-gray-500">Tap a subject to start learning</p>
        </div>
        <button
          onClick={() => setScreen("exam")}
          className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100 transition flex items-center gap-1"
        >
          📝 Exams
        </button>
      </div>

      {/* Netflix-style cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {subjects.map((s) => {
          const isLocked = s.status === "locked";
          return (
            <button
              key={s.id}
              onClick={() => {
                if (isLocked) return;
                setActiveCurriculumSubjectId(s.id);
                setScreen("curriculumSubject");
              }}
              disabled={isLocked}
              className={`relative rounded-2xl overflow-hidden shadow-sm transition-all text-left ${
                isLocked
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
              }`}
              style={{ backgroundColor: s.color }}
            >
              {/* Card content — image or gradient background */}
              <div className="aspect-[4/3] relative">
                {s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt={s.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-5xl opacity-90">{s.icon}</span>
                  </div>
                )}
                {/* Dark gradient overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Lock badge */}
                {isLocked && (
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                    <Lock className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                {/* Topic count badge */}
                {!isLocked && s.topicCount > 0 && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur text-white text-[10px] font-bold">
                    {s.topicCount} topics
                  </div>
                )}

                {/* Subject name + status at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-bold text-sm leading-tight drop-shadow-lg">
                    {s.name}
                  </p>
                  <p className="text-white/80 text-[10px] mt-0.5">
                    {isLocked ? "🔒 Coming soon" : s.description ?? "Tap to start"}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Phase 22e — Resume session banner
// ---------------------------------------------------------------------

function ResumeSessionBanner() {
  const { setScreen, setActiveCurriculumSubjectId, setActiveCurriculumTopicId } = useApp();
  const [session, setSession] = useState<any>(null);
  const [resumeText, setResumeText] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/curriculum/session")
      .then((r) => r.json())
      .then((d) => {
        if (d.hasIncomplete && d.session) {
          setSession(d.session);
          setResumeText(d.resumeText ?? "Continue where you left off.");
        }
      })
      .catch(() => {});
  }, []);

  if (!session) return null;

  const minutesAgo = Math.round(
    (Date.now() - new Date(session.startedAt).getTime()) / (1000 * 60)
  );

  return (
    <div className="mb-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
          <Play className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-800">{resumeText}</p>
          <p className="text-[11px] text-emerald-700/80">
            {session.subject?.name ?? "Your subject"} · {minutesAgo < 60 ? `${minutesAgo} min ago` : `${Math.round(minutesAgo / 60)} hr ago`}
          </p>
        </div>
        <button
          onClick={() => {
            if (session.subjectId) setActiveCurriculumSubjectId(session.subjectId);
            if (session.topicId) {
              setActiveCurriculumTopicId(session.topicId);
              setScreen("curriculumTopic");
            } else {
              setScreen("curriculumSubject");
            }
          }}
          className="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1"
        >
          <Play className="w-3.5 h-3.5" /> Resume
        </button>
      </div>
    </div>
  );
}
