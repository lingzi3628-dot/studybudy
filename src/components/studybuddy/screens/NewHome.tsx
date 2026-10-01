"use client";

/**
 * NewHome — Phase F0 (Dashboard redesign)
 *
 * A clear starting point for learning — not a menu of everything StudyBuddy can do.
 *
 * Three questions this dashboard answers:
 *   1. What am I learning?       → Greeting + grade/track + subjects chips
 *   2. Where should I continue?  → "Continue Learning" primary card (last topic or "Choose a subject")
 *   3. How am I progressing?     → Cards due + weak topics summary + study materials
 *
 * SCOPE: K-12 + Secondary only (track === "k12" || "secondary").
 * University/College/TVET/Dev tracks keep their existing dashboards (HigherEdHome, TrackHome).
 *
 * DATA SOURCES (all existing — no new API endpoints):
 *   - api.getProgress()        → user info, xp, level, streak, dueCount, weakAreas, mastery
 *   - api.listStudySets()      → saved study sets (top 3 shown)
 *
 * HONESTY RULES:
 *   - If no saved lesson state (new user), "Continue Learning" shows "Choose a subject"
 *     instead of inventing a recommendation.
 *   - If no mastery data, weak-topics count shows 0 (not "0% progress" which looks broken).
 *   - Streak + XP are secondary — shown small in the greeting, not as big stat cards.
 *
 * FEATURE FLAG:
 *   NEXT_PUBLIC_NEW_DASHBOARD="true" enables this dashboard.
 *   Default: off (old Home.tsx renders). Rollback = set flag to false.
 *
 * WHAT'S REMOVED vs old Home.tsx:
 *   - 8-buddy grid (moved to Tutor screen)
 *   - "Today's Challenge" card (was hardcoded "Photosynthesis" — not data-driven)
 *   - 6-button Quick Actions grid (moved to Create + modal which already exists)
 *   - Billing & Usage entry (moved to Profile screen)
 *   - "Browse Topics" carousel (was hardcoded list — not personalized)
 *
 * WHAT'S KEPT:
 *   - "Continue Learning" card (made it the primary focus)
 *   - Saved study sets (limited to 3, list not carousel)
 *   - BottomNav + TopBar unchanged
 */

import { useEffect, useState } from "react";
import {
  Flame,
  Play,
  ChevronRight,
  Loader2,
  FileText,
  AlertCircle,
  BookOpen,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Progress as ProgressData, type StudySetSummary } from "../api";
import { useI18n } from "@/lib/useI18n";

// Subject chip color mapping — uses existing Tailwind palette, no new deps
const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: "bg-indigo-50 text-indigo-700 border-indigo-200",
  English: "bg-sky-50 text-sky-700 border-sky-200",
  Kiswahili: "bg-amber-50 text-amber-700 border-amber-200",
  Science: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Social Studies": "bg-rose-50 text-rose-700 border-rose-200",
  "Science & Technology": "bg-emerald-50 text-emerald-700 border-emerald-200",
  CRE: "bg-violet-50 text-violet-700 border-violet-200",
  "Creative Arts": "bg-pink-50 text-pink-700 border-pink-200",
  Coding: "bg-gray-50 text-gray-700 border-gray-200",
  default: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffDay = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDay === 0) return "today";
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) === 1 ? "" : "s"} ago`;
  return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) === 1 ? "" : "s"} ago`;
}

export function NewHome() {
  // Selectors — NOT whole-store destructure (avoids unnecessary re-renders)
  const setScreen = useApp((state) => state.setScreen);
  const setActiveStudySetId = useApp((state) => state.setActiveStudySetId);
  const setActiveTopicId = useApp((state) => state.setActiveTopicId);
  const openCreate = useApp((state) => state.openCreate);
  const { t } = useI18n();

  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(false);
    try {
      const [p, s] = await Promise.all([
        api.getProgress(),
        api.listStudySets(),
      ]);
      setProgress(p);
      setSets(s.sets);
    } catch (e) {
      console.warn("NewHome fetch failed", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchData();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, []);

  // ---- Derived data ----
  const name = progress?.user.name?.split(" ")[0] ?? progress?.user.email?.split("@")[0] ?? "there";
  const grade = progress?.user.grade ?? "Grade 1";
  const track = progress?.user.track ?? "k12";
  const trackLabel = track === "secondary" ? "8-4-4" : "CBC";
  const streak = progress?.streak ?? 0;
  const dueCount = progress?.dueCount ?? 0;
  const weakAreas = progress?.weakAreas ?? [];
  const subjects = progress?.user.subjects ?? [];

  // "Continue Learning" — find the most recently studied topic from mastery data.
  // mastery[] is already sorted by lastUpdated DESC (from /api/progress line 19).
  // We pick the first topic across all subjects that has at least 1 attempt.
  const lastTopic = (() => {
    for (const subj of progress?.mastery ?? []) {
      for (const topic of subj.topics) {
        if (topic.totalAttempts > 0) {
          return { subject: subj.subject, topic: topic.topic, mastery: topic.mastery };
        }
      }
    }
    return null;
  })();

  // ---- Loading state (skeleton — no layout jump) ----
  if (loading) {
    return (
      <div className="md:px-8 md:py-6">
        <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
          {/* Greeting skeleton */}
          <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
          {/* Continue Learning skeleton */}
          <div className="mt-5 h-32 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 animate-pulse" />
          {/* Subjects skeleton */}
          <div className="mt-6">
            <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-3" />
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 w-24 rounded-full bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
          {/* Progress skeleton */}
          <div className="mt-6 h-24 rounded-2xl bg-gray-100 animate-pulse" />
          {/* Study sets skeleton */}
          <div className="mt-6">
            <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-3" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Error state (retry button, not "0% progress") ----
  if (error) {
    return (
      <div className="md:px-8 md:py-6">
        <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
          <div className="mt-10 flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
            <p className="text-sm font-semibold text-gray-900">Couldn't load your dashboard</p>
            <p className="text-xs text-gray-500 mt-1">Check your internet connection and try again.</p>
            <button
              onClick={fetchData}
              className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-indigo-700 transition"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">

        {/* ---- Greeting (answer to "What am I learning?") ---- */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              {t(`dash.greeting.${greeting()}`)}, {name}! 👋
            </p>
            <h1 className="text-2xl font-bold text-gray-900">{grade} · {trackLabel}</h1>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full">
              <Flame className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold">{streak}</span>
              <span className="text-xs text-amber-600/80">{t("dash.streak")}</span>
            </div>
          )}
        </div>

        {/* ---- Continue Learning (answer to "Where should I continue?") ---- */}
        <section className="mt-5">
          {lastTopic ? (
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-5 text-white shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  {t("dash.continueLearning")}
                </span>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  {Math.round(lastTopic.mastery * 100)}% mastery
                </span>
              </div>
              <h2 className="text-lg font-bold mt-2">{lastTopic.topic}</h2>
              <p className="text-sm opacity-90 mt-0.5">{lastTopic.subject}</p>
              <p className="text-xs opacity-70 mt-1">Your last saved topic</p>
              <button
                onClick={() => setScreen("tutor")}
                className="mt-4 inline-flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-sm px-4 py-2 rounded-full shadow hover:bg-indigo-50 transition"
              >
                <Play className="w-4 h-4" /> Continue with AI tutor
              </button>
            </div>
          ) : (
            // Honest fallback — new user, no saved lesson state
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-5 text-white shadow-md">
              <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                {t("dash.continueLearning")}
              </span>
              <h2 className="text-lg font-bold mt-2">Choose a subject to start</h2>
              <p className="text-sm opacity-90 mt-1">
                Pick a subject below, or ask the AI tutor anything you'd like to learn.
              </p>
              <button
                onClick={() => setScreen("tutor")}
                className="mt-4 inline-flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-sm px-4 py-2 rounded-full shadow hover:bg-indigo-50 transition"
              >
                <Play className="w-4 h-4" /> Ask AI tutor
              </button>
            </div>
          )}
        </section>

        {/* ---- Your subjects (also part of "What am I learning?") ---- */}
        {subjects.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Your subjects</h3>
              <button
                onClick={() => setScreen("search")}
                className="text-xs text-indigo-600 font-medium flex items-center"
              >
                View all subjects <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {subjects.slice(0, 6).map((subject) => {
                const color = SUBJECT_COLORS[subject] ?? SUBJECT_COLORS.default;
                return (
                  <button
                    key={subject}
                    onClick={() => {
                      // Open curriculum subject view for this subject
                      setScreen("curriculumSubject" as any);
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold hover:shadow-sm transition ${color}`}
                  >
                    {subject}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ---- Practice and progress (answer to "How am I progressing?") ---- */}
        <section className="mt-6">
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Practice and progress</h3>
              <button
                onClick={() => setScreen("progress")}
                className="text-xs text-indigo-600 font-medium flex items-center"
              >
                View progress <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm">
              {dueCount > 0 ? (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <span className="font-semibold text-gray-900">{dueCount}</span>
                  <span className="text-gray-500">cards due</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">No cards due today 🎉</span>
                </div>
              )}
              {weakAreas.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-gray-900">{weakAreas.length}</span>
                  <span className="text-gray-500">topics to review</span>
                </div>
              )}
            </div>
            {/* Quick-start review button */}
            {dueCount > 0 && (
              <button
                onClick={() => setScreen("flashcards")}
                className="mt-3 w-full h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition flex items-center justify-center gap-1.5"
              >
                <Play className="w-4 h-4" /> Start review
              </button>
            )}
          </div>
        </section>

        {/* ---- Your study materials ---- */}
        {sets.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Your study materials</h3>
              <button
                onClick={() => setScreen("flashcards")}
                className="text-xs text-indigo-600 font-medium flex items-center"
              >
                See all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {sets.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveStudySetId(s.id);
                    setScreen("flashcards");
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition text-left"
                >
                  <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.title}</p>
                    <p className="text-xs text-gray-500">
                      {s.subject ?? "General"} · {s.cardCount} cards
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---- New user nudge (only shows if no study sets + no mastery) ---- */}
        {sets.length === 0 && !lastTopic && (
          <section className="mt-6">
            <div className="rounded-2xl bg-violet-50 border border-violet-200 p-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-lg flex-shrink-0">
                  📚
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-violet-900">Get started</p>
                  <p className="text-xs text-violet-700 mt-0.5">
                    Create your first study set or ask the AI tutor a question to begin learning.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => openCreate("flashcards")}
                      className="text-xs font-semibold text-white bg-violet-600 px-3 py-1.5 rounded-full hover:bg-violet-700 transition"
                    >
                      Create study set
                    </button>
                    <button
                      onClick={() => setScreen("tutor")}
                      className="text-xs font-semibold text-violet-700 bg-violet-100 px-3 py-1.5 rounded-full hover:bg-violet-200 transition"
                    >
                      Ask AI tutor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
