"use client";

/**
 * Dashboard primitives — Phase F2
 *
 * Shared layout components used by NewHome (K-12), NewHigherEdHome
 * (university/college/tvet), and NewTrackHome (dev tracks).
 *
 * These keep the three dashboards visually consistent while allowing
 * each to pull data from its own sources. The components are:
 *
 *   - DashboardSkeleton     → loading state (no layout jump)
 *   - DashboardError        → error state with Retry button
 *   - DashboardHeader       → greeting + badge + streak
 *   - ContinueLearningCard  → primary CTA (last topic or "Choose a subject")
 *   - SubjectChips          → clickable subject pills
 *   - ProgressSummary       → due cards + weak topics count
 *   - StudyMaterialsList    → study sets OR projects (max 3)
 *   - NewUserNudge          → "Get started" card for empty state
 *
 * All components are presentational — they take props and render.
 * Data fetching is the parent dashboard's responsibility.
 */

import { ReactNode } from "react";
import {
  Flame, Play, ChevronRight, AlertCircle, Clock, FileText,
  RefreshCw, Sparkles, FolderOpen,
} from "lucide-react";

// ============================================================
// Loading skeleton (no layout jump)
// ============================================================

export function DashboardSkeleton() {
  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="mt-5 h-32 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 animate-pulse" />
        <div className="mt-6">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-3" />
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 rounded-full bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="mt-6 h-24 rounded-2xl bg-gray-100 animate-pulse" />
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

// ============================================================
// Error state (retry, not "0% progress")
// ============================================================

export function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        <div className="mt-10 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
          <p className="text-sm font-semibold text-gray-900">Couldn't load your dashboard</p>
          <p className="text-xs text-gray-500 mt-1">Check your internet connection and try again.</p>
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-indigo-700 transition"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Dashboard header (greeting + badge + streak)
// ============================================================

export function DashboardHeader({
  greetingText,
  name,
  badgeLabel,
  badgeSubtext,
  streak,
}: {
  greetingText: string;
  name: string;
  badgeLabel: string;
  badgeSubtext?: string;
  streak: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{greetingText}, {name}! 👋</p>
        <h1 className="text-2xl font-bold text-gray-900">{badgeLabel}</h1>
        {badgeSubtext && <p className="text-xs text-gray-500 mt-0.5">{badgeSubtext}</p>}
      </div>
      {streak > 0 && (
        <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full">
          <Flame className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-bold">{streak}</span>
          <span className="text-xs text-amber-600/80">day streak</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Continue Learning card (primary CTA)
// ============================================================

export function ContinueLearningCard({
  lastTopic,
  lastSubject,
  masteryPct,
  onContinue,
  emptyStateLabel = "Choose a subject to start",
  emptyStateSubtext = "Pick a subject below, or ask the AI tutor anything you'd like to learn.",
  continueLabel = "Continue with AI tutor",
  emptyCtaLabel = "Ask AI tutor",
}: {
  lastTopic: string | null;
  lastSubject?: string | null;
  masteryPct?: number | null;
  onContinue: () => void;
  emptyStateLabel?: string;
  emptyStateSubtext?: string;
  continueLabel?: string;
  emptyCtaLabel?: string;
}) {
  if (lastTopic) {
    return (
      <section className="mt-5">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-5 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Continue Learning</span>
            {masteryPct !== null && masteryPct !== undefined && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{masteryPct}% mastery</span>
            )}
          </div>
          <h2 className="text-lg font-bold mt-2">{lastTopic}</h2>
          {lastSubject && <p className="text-sm opacity-90 mt-0.5">{lastSubject}</p>}
          <p className="text-xs opacity-70 mt-1">Your last saved topic</p>
          <button
            onClick={onContinue}
            className="mt-4 inline-flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-sm px-4 py-2 rounded-full shadow hover:bg-indigo-50 transition"
          >
            <Play className="w-4 h-4" /> {continueLabel}
          </button>
        </div>
      </section>
    );
  }
  // Empty state — no false recommendation
  return (
    <section className="mt-5">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-5 text-white shadow-md">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Continue Learning</span>
        <h2 className="text-lg font-bold mt-2">{emptyStateLabel}</h2>
        <p className="text-sm opacity-90 mt-1">{emptyStateSubtext}</p>
        <button
          onClick={onContinue}
          className="mt-4 inline-flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-sm px-4 py-2 rounded-full shadow hover:bg-indigo-50 transition"
        >
          <Play className="w-4 h-4" /> {emptyCtaLabel}
        </button>
      </div>
    </section>
  );
}

// ============================================================
// Subject chips
// ============================================================

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
  // Higher-ed subjects
  Accounting: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Finance: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Marketing: "bg-rose-50 text-rose-700 border-rose-200",
  Management: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Economics: "bg-amber-50 text-amber-700 border-amber-200",
  "Business Law": "bg-violet-50 text-violet-700 border-violet-200",
  Programming: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Data Structures": "bg-sky-50 text-sky-700 border-sky-200",
  Algorithms: "bg-sky-50 text-sky-700 border-sky-200",
  "Web Development": "bg-amber-50 text-amber-700 border-amber-200",
  Anatomy: "bg-rose-50 text-rose-700 border-rose-200",
  Physiology: "bg-rose-50 text-rose-700 border-rose-200",
  Pathology: "bg-rose-50 text-rose-700 border-rose-200",
  "Constitutional Law": "bg-violet-50 text-violet-700 border-violet-200",
  "Criminal Law": "bg-violet-50 text-violet-700 border-violet-200",
  "Contract Law": "bg-violet-50 text-violet-700 border-violet-200",
  default: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

export function SubjectChips({
  subjects,
  onChipClick,
  onViewAll,
}: {
  subjects: string[];
  onChipClick: (subject: string) => void;
  onViewAll?: () => void;
}) {
  if (subjects.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Your subjects</h3>
        {onViewAll && (
          <button onClick={onViewAll} className="text-xs text-indigo-600 font-medium flex items-center">
            View all subjects <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {subjects.slice(0, 8).map((subject) => {
          const color = SUBJECT_COLORS[subject] ?? SUBJECT_COLORS.default;
          return (
            <button
              key={subject}
              onClick={() => onChipClick(subject)}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold hover:shadow-sm transition ${color}`}
            >
              {subject}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================
// Progress summary (due cards + weak topics)
// ============================================================

export function ProgressSummary({
  dueCount,
  weakTopicsCount,
  onStartReview,
  onViewProgress,
}: {
  dueCount: number;
  weakTopicsCount: number;
  onStartReview?: () => void;
  onViewProgress?: () => void;
}) {
  return (
    <section className="mt-6">
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Practice and progress</h3>
          {onViewProgress && (
            <button onClick={onViewProgress} className="text-xs text-indigo-600 font-medium flex items-center">
              View progress <ChevronRight className="w-3 h-3" />
            </button>
          )}
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
          {weakTopicsCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-gray-900">{weakTopicsCount}</span>
              <span className="text-gray-500">topics to review</span>
            </div>
          )}
        </div>
        {dueCount > 0 && onStartReview && (
          <button
            onClick={onStartReview}
            className="mt-3 w-full h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition flex items-center justify-center gap-1.5"
          >
            <Play className="w-4 h-4" /> Start review
          </button>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Study materials list (study sets OR projects — max 3)
// ============================================================

export function StudyMaterialsList({
  title = "Your study materials",
  items,
  onItemClick,
  onViewAll,
}: {
  title?: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    meta?: string;
  }>;
  onItemClick: (id: string) => void;
  onViewAll?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {onViewAll && (
          <button onClick={onViewAll} className="text-xs text-indigo-600 font-medium flex items-center">
            See all <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.slice(0, 3).map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick(item.id)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition text-left"
          >
            <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
              <p className="text-xs text-gray-500">{item.subtitle}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Projects list (for dev/higher-ed tracks — uses FolderOpen icon)
// ============================================================

export function ProjectsList({
  projects,
  onItemClick,
  onViewAll,
}: {
  projects: Array<{
    id: string;
    title: string;
    subtitle: string;
  }>;
  onItemClick: (id: string) => void;
  onViewAll?: () => void;
}) {
  if (projects.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Recent projects</h3>
        {onViewAll && (
          <button onClick={onViewAll} className="text-xs text-indigo-600 font-medium flex items-center">
            See all <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {projects.slice(0, 3).map((p) => (
          <button
            key={p.id}
            onClick={() => onItemClick(p.id)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition text-left"
          >
            <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
              <p className="text-xs text-gray-500">{p.subtitle}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// New user nudge (empty state)
// ============================================================

export function NewUserNudge({
  title = "Get started",
  body,
  primaryCtaLabel,
  onPrimaryCta,
  secondaryCtaLabel,
  onSecondaryCta,
}: {
  title?: string;
  body: string;
  primaryCtaLabel: string;
  onPrimaryCta: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCta?: () => void;
}) {
  return (
    <section className="mt-6">
      <div className="rounded-2xl bg-violet-50 border border-violet-200 p-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-lg flex-shrink-0">
            📚
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-violet-900">{title}</p>
            <p className="text-xs text-violet-700 mt-0.5">{body}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={onPrimaryCta}
                className="text-xs font-semibold text-white bg-violet-600 px-3 py-1.5 rounded-full hover:bg-violet-700 transition"
              >
                {primaryCtaLabel}
              </button>
              {secondaryCtaLabel && onSecondaryCta && (
                <button
                  onClick={onSecondaryCta}
                  className="text-xs font-semibold text-violet-700 bg-violet-100 px-3 py-1.5 rounded-full hover:bg-violet-200 transition"
                >
                  {secondaryCtaLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
