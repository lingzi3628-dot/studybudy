"use client";

import { useEffect, useState } from "react";
import {
  Flame,
  Play,
  UploadCloud,
  Bot,
  LineChart,
  Layers,
  ChevronRight,
  Clock,
  Sparkles,
  Loader2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Progress as ProgressData, type StudySetSummary } from "../api";

const quickActions = [
  { label: "Upload Notes", icon: UploadCloud, color: "bg-indigo-50 text-indigo-600" },
  { label: "Ask AI Tutor", icon: Bot, color: "bg-violet-50 text-violet-600" },
  { label: "Draw Graph", icon: LineChart, color: "bg-emerald-50 text-emerald-600" },
  { label: "Generate Flashcards", icon: Layers, color: "bg-amber-50 text-amber-600" },
];

const subjectGradients: Record<string, string> = {
  Mathematics: "from-indigo-500 to-violet-500",
  Science: "from-emerald-500 to-teal-500",
  English: "from-sky-500 to-cyan-500",
  Kiswahili: "from-amber-500 to-orange-500",
  Chinese: "from-rose-500 to-pink-500",
  default: "from-indigo-500 to-violet-500",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  const { setScreen, openCreate, setActiveStudySetId } = useApp();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [p, s] = await Promise.all([api.getProgress(), api.listStudySets()]);
        if (!mounted) return;
        setProgress(p);
        setSets(s.sets);
      } catch (e) {
        console.warn("home fetch failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const name = progress?.user.name?.split(" ")[0] ?? "Alex";
  const streak = progress?.streak ?? 0;
  const dueCount = progress?.dueCount ?? 0;
  const weakAreas = progress?.weakAreas ?? [];

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        {/* greeting — full width on desktop */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{greeting()}, {name}! 👋</p>
            <h1 className="text-2xl font-bold text-gray-900">Let&apos;s learn today</h1>
          </div>
          <div className="hidden md:flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full">
            <Flame className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold">{streak}</span>
            <span className="text-xs text-amber-600/80">day streak</span>
          </div>
        </div>

        {loading ? (
          <div className="mt-10 flex items-center justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> <span className="ml-2 text-sm">Loading…</span>
          </div>
        ) : (
          <>
            {/* Bento grid on desktop */}
            <div className="mt-5 md:grid md:grid-cols-3 md:gap-4 space-y-4 md:space-y-0">
              {/* Continue Learning — spans 2 cols on desktop */}
              <section className="md:col-span-2">
                <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-5 text-white shadow-md h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Continue Learning</span>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Smart Review</span>
                  </div>
                  <h2 className="text-lg font-bold mt-2">{dueCount > 0 ? `${dueCount} cards due now` : "No reviews due today 🎉"}</h2>
                  <p className="text-sm opacity-90 mt-1">
                    {dueCount > 0
                      ? "Tap below to start your spaced-repetition review session."
                      : "Create a new study set or come back tomorrow for fresh reviews."}
                  </p>
                  <button
                    onClick={() => setScreen("flashcards")}
                    disabled={dueCount === 0}
                    className="mt-4 inline-flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-sm px-4 py-2 rounded-full shadow hover:bg-indigo-50 transition disabled:opacity-40"
                  >
                    <Play className="w-4 h-4" /> {dueCount > 0 ? "Start Review" : "All caught up"}
                  </button>
                </div>
              </section>

              {/* Daily Challenge */}
              <section>
                <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm h-full">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Today&apos;s Challenge</p>
                      <h3 className="text-sm font-semibold text-gray-900 mt-0.5">
                        5 questions on Photosynthesis
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> ~5 min · Earn +20 XP
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setScreen("quiz")}
                    className="mt-3 w-full h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition"
                  >
                    Start Challenge
                  </button>
                </div>
              </section>
            </div>

            {/* Quick actions */}
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {quickActions.map((q) => {
                  const Icon = q.icon;
                  return (
                    <button
                      key={q.label}
                      onClick={() => openCreate()}
                      className="flex flex-col items-start gap-2 p-3.5 rounded-2xl bg-white border border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition text-left"
                    >
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${q.color}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-medium text-gray-900">{q.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Saved study sets */}
            {sets.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Your study sets</h3>
                  <button className="text-xs text-indigo-600 font-medium flex items-center">
                    See all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto no-scrollbar md:grid md:grid-cols-3 md:gap-4 md:overflow-visible">
                  {sets.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveStudySetId(s.id);
                        setScreen("quiz");
                      }}
                      className="flex-shrink-0 w-44 md:w-auto text-left group"
                    >
                      <div className={`h-24 rounded-2xl bg-gradient-to-br ${subjectGradients[s.subject ?? "default"] ?? subjectGradients.default} p-3 flex items-end text-white shadow-md group-hover:scale-[1.02] transition`}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-500">
                        {s.subject ?? "General"} · {s.cardCount} cards
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Weak areas / recommended */}
            {weakAreas.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-500" /> Recommended for you
                  </h3>
                </div>
                <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto no-scrollbar md:grid md:grid-cols-3 md:gap-4 md:overflow-visible">
                  {weakAreas.map((w) => (
                    <button
                      key={`${w.subject}-${w.topic}`}
                      onClick={() => openCreate()}
                      className="flex-shrink-0 w-44 md:w-auto text-left"
                    >
                      <div className="h-24 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 p-3 flex flex-col justify-between text-white shadow-md">
                        <span className="text-xs opacity-80">Needs practice</span>
                        <div>
                          <p className="text-sm font-semibold">{w.topic}</p>
                          <p className="text-xs opacity-80">{w.subject} · {Math.round(w.mastery * 100)}%</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
