"use client";

/**
 * NewTrackHome — Phase F2
 *
 * Clear-starting-point dashboard for dev tracks (dev/data/ml/aiapp/web/
 * backend/server/tvet/mixed).
 *
 * Uses the same layout primitives as NewHome + NewHigherEdHome.
 * The difference: dev tracks show recent PROJECTS instead of study sets,
 * and track-specific quick actions are accessible via the Create modal.
 *
 * Feature-flagged: NEXT_PUBLIC_NEW_DASHBOARD=true
 * Falls back to TrackHome.tsx when flag is off.
 */

import { useEffect, useState, useCallback } from "react";
import { useApp } from "../store";
import { api, type Progress as ProgressData } from "../api";
import { useI18n } from "@/lib/useI18n";
import {
  DashboardSkeleton,
  DashboardError,
  DashboardHeader,
  ContinueLearningCard,
  ProgressSummary,
  ProjectsList,
  NewUserNudge,
} from "./dashboard-primitives";

type ProjectSummary = {
  id: string;
  buddyId: string;
  title: string;
  description: string | null;
  updatedAt: string;
  fileCount: number;
  entryFile: string | null;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const TRACK_LABELS: Record<string, { label: string; emoji: string }> = {
  dev: { label: "Coding", emoji: "💻" },
  data: { label: "Data Science", emoji: "📊" },
  ml: { label: "Machine Learning", emoji: "🧠" },
  aiapp: { label: "AI App Dev", emoji: "🤖" },
  web: { label: "Web Dev", emoji: "🌐" },
  backend: { label: "Backend", emoji: "⚙️" },
  server: { label: "DevOps", emoji: "🖥️" },
  tvet: { label: "TVET", emoji: "🔧" },
  mixed: { label: "All Tools", emoji: "🎯" },
};

export function NewTrackHome({ track }: { track: string }) {
  const setScreen = useApp((state) => state.setScreen);
  const setActiveProjectId = useApp((state) => state.setActiveProjectId);
  const openCreate = useApp((state) => state.openCreate);
  const { t } = useI18n();

  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [p, projectsRes] = await Promise.all([
        api.getProgress(),
        fetch("/api/projects").catch(() => null),
      ]);
      setProgress(p);
      if (projectsRes?.ok) {
        const d = await projectsRes.json();
        setRecentProjects((d.projects ?? []).slice(0, 4));
      }
    } catch (e) {
      console.warn("NewTrackHome fetch failed", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchData();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [fetchData]);

  // ---- Derived data ----
  const name = progress?.user.name?.split(" ")[0] ?? progress?.user.email?.split("@")[0] ?? "there";
  const streak = progress?.streak ?? 0;
  const dueCount = progress?.dueCount ?? 0;
  const weakAreas = progress?.weakAreas ?? [];

  const trackMeta = TRACK_LABELS[track] ?? TRACK_LABELS.mixed;

  // "Continue Learning" — find the most recently studied topic
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

  // ---- Render ----
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError onRetry={fetchData} />;

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        {/* Greeting */}
        <DashboardHeader
          greetingText={t(`dash.greeting.${greeting()}`)}
          name={name}
          badgeLabel={`${trackMeta.emoji} ${trackMeta.label}`}
          streak={streak}
        />

        {/* Continue Learning */}
        <ContinueLearningCard
          lastTopic={lastTopic?.topic ?? null}
          lastSubject={lastTopic?.subject ?? null}
          masteryPct={lastTopic ? Math.round(lastTopic.mastery * 100) : null}
          onContinue={() => setScreen("tutor")}
          emptyStateLabel="Start a project"
          emptyStateSubtext="Open the code editor, create a study set, or ask the AI tutor for help."
          continueLabel="Continue with AI tutor"
          emptyCtaLabel="Ask AI tutor"
        />

        {/* Practice and progress */}
        <ProgressSummary
          dueCount={dueCount}
          weakTopicsCount={weakAreas.length}
          onStartReview={dueCount > 0 ? () => setScreen("flashcards") : undefined}
          onViewProgress={() => setScreen("progress")}
        />

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <ProjectsList
            projects={recentProjects.map((p) => ({
              id: p.id,
              title: p.title,
              subtitle: `${p.fileCount} file${p.fileCount !== 1 ? "s" : ""} · ${new Date(p.updatedAt).toLocaleDateString()}`,
            }))}
            onItemClick={(id) => {
              setActiveProjectId(id);
              setScreen("projects");
            }}
            onViewAll={() => setScreen("projects")}
          />
        )}

        {/* New user nudge (no projects + no mastery) */}
        {recentProjects.length === 0 && !lastTopic && (
          <NewUserNudge
            title="Get started"
            body="Create your first project, or ask the AI tutor anything you'd like to learn."
            primaryCtaLabel="Create project"
            onPrimaryCta={() => openCreate()}
            secondaryCtaLabel="Ask AI tutor"
            onSecondaryCta={() => setScreen("tutor")}
          />
        )}
      </div>
    </div>
  );
}
