"use client";

import { useState } from "react";
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
} from "lucide-react";
import { useApp } from "../store";
import { api, type LearningPath } from "../api";

type Week = {
  week: number;
  title: string;
  objectives: string[];
  resources: string[];
  assessment: string;
};

export function LearningPathScreen() {
  const { setScreen } = useApp();
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("beginner");
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<LearningPath | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());

  const generate = async () => {
    if (!skill.trim()) {
      setError("Please enter a skill to learn.");
      return;
    }
    setLoading(true);
    setError(null);
    setPath(null);
    try {
      const r = await api.generateLearningPath({
        skill: skill.slice(0, 80),
        level,
        goal: goal || undefined,
      });
      setPath(r.learningPath);
      setCompletedLessons(new Set());
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate path");
    } finally {
      setLoading(false);
    }
  };

  const toggleLesson = (lessonId: string) => {
    setCompletedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

  const weeks: Week[] = (path?.roadmap?.weeks as Week[]) ?? [];

  return (
    <div className="min-h-screen bg-gray-50 max-w-3xl mx-auto flex flex-col">
      {/* top bar */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => setScreen("home")}
          aria-label="Exit"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex items-center gap-1.5">
          <Route className="w-4 h-4 text-teal-600" /> Learning Path
        </h1>
        <span className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* input form */}
        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Plan your learning journey</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                What do you want to learn?
              </label>
              <input
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder="e.g. Algebra, Swahili, Python, Photosynthesis"
                className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Current level
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Goal (optional)
                </label>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Pass my exam"
                  className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={generate}
              disabled={loading || !skill.trim()}
              className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {path ? "Regenerate Path" : "Generate 4-week Path"}
            </button>
          </div>
        </div>

        {/* generated roadmap */}
        {loading && !path && (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm text-center text-gray-400">
            <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            <p className="mt-3 text-sm">Designing your 4-week roadmap…</p>
          </div>
        )}

        {path && weeks.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white p-4 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    Learning Path
                  </p>
                  <h2 className="text-lg font-bold mt-0.5">{skill}</h2>
                  <p className="text-xs opacity-90 mt-0.5 capitalize">{level} · {weeks.length} weeks</p>
                </div>
                <Route className="w-8 h-8 opacity-80" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: `${(completedLessons.size / weeks.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-semibold">
                  {completedLessons.size}/{weeks.length}
                </span>
              </div>
            </div>

            {weeks.map((w, idx) => {
              const lesson = path.lessons[idx];
              const isComplete = lesson ? completedLessons.has(lesson.id) : false;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border-2 p-4 shadow-sm transition ${
                    isComplete
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-white border-gray-200"
                  }`}
                >
                  {/* timeline dot + line */}
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                          isComplete
                            ? "bg-emerald-500 text-white"
                            : idx === 0
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {isComplete ? <Check className="w-4 h-4" /> : w.week}
                      </span>
                      {idx < weeks.length - 1 && (
                        <span className="w-px h-full bg-gray-200 flex-1 mt-1 min-h-[24px]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-gray-900">{w.title || `Week ${w.week}`}</h3>
                        {lesson && (
                          <button
                            onClick={() => toggleLesson(lesson.id)}
                            className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full flex-shrink-0 ${
                              isComplete
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
                            }`}
                          >
                            {isComplete ? "Completed" : "Mark done"}
                          </button>
                        )}
                      </div>

                      {w.objectives?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1 mb-1">
                            <Target className="w-3 h-3" /> Objectives
                          </p>
                          <ul className="space-y-0.5">
                            {w.objectives.map((o, i) => (
                              <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                                <span className="text-indigo-500">•</span>
                                {o}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {w.resources?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1 mb-1">
                            <BookOpen className="w-3 h-3" /> Resources
                          </p>
                          <ul className="space-y-0.5">
                            {w.resources.map((r, i) => (
                              <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                                <span className="text-violet-500">›</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {w.assessment && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-50 text-amber-800 text-xs flex items-start gap-1.5">
                          <Trophy className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span><strong>Assessment:</strong> {w.assessment}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => {
                setSavedToast(true);
                setTimeout(() => setSavedToast(false), 2500);
              }}
              className="w-full h-11 rounded-full bg-teal-500 text-white font-semibold text-sm shadow-md hover:bg-teal-600 flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Path saved to your account
            </button>
          </div>
        )}

        {/* empty state when no path yet */}
        {!path && !loading && (
          <div className="rounded-2xl bg-white border-2 border-dashed border-gray-200 p-6 text-center">
            <Route className="w-8 h-8 mx-auto text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              Enter a skill above and tap <strong>Generate 4-week Path</strong>. The AI will
              design a structured roadmap with weekly objectives, resources, and assessments.
            </p>
          </div>
        )}
      </div>

      {savedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-1.5 animate-in slide-in-from-bottom-4">
          <Check className="w-4 h-4" /> Saved
        </div>
      )}
    </div>
  );
}
