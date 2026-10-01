"use client";

/**
 * NewHigherEdHome — Phase F2
 *
 * Clear-starting-point dashboard for university/college/TVET students.
 * Uses the same layout primitives as NewHome (K-12) but pulls course-aware
 * data from /api/progress + the course catalog.
 *
 * Layout:
 *   1. Greeting + course name + track badge
 *   2. Continue Learning (last topic from mastery, or "Choose a subject")
 *   3. Course subjects chips (from getCourseByName)
 *   4. Practice and progress (due cards + weak topics)
 *   5. Recent projects (max 3)
 *
 * Feature-flagged: NEXT_PUBLIC_NEW_DASHBOARD=true
 * Falls back to HigherEdHome.tsx when flag is off.
 */

import { useEffect, useState, useCallback } from "react";
import { useApp } from "../store";
import { api, type Progress as ProgressData } from "../api";
import { getCourseByName } from "@/lib/education/catalog";
import { useI18n } from "@/lib/useI18n";
import {
  DashboardSkeleton,
  DashboardError,
  DashboardHeader,
  ContinueLearningCard,
  SubjectChips,
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
  university: { label: "University", emoji: "🎓" },
  college: { label: "College", emoji: "🏛️" },
  tvet: { label: "TVET", emoji: "🔧" },
};

export function NewHigherEdHome() {
  // Selectors — not whole-store destructure
  const setScreen = useApp((state) => state.setScreen);
  const setActiveProjectId = useApp((state) => state.setActiveProjectId);
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
      console.warn("NewHigherEdHome fetch failed", e);
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
  const track = progress?.user.track ?? "university";
  const course = progress?.user.course ?? null;
  const streak = progress?.streak ?? 0;
  const dueCount = progress?.dueCount ?? 0;
  const weakAreas = progress?.weakAreas ?? [];

  const trackMeta = TRACK_LABELS[track] ?? TRACK_LABELS.university;
  const courseData = course ? getCourseByName(course) : null;
  const subjects = courseData?.subjects ?? progress?.user.subjects ?? [];

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
          badgeLabel={course ?? trackMeta.label}
          badgeSubtext={course ? `${trackMeta.emoji} ${trackMeta.label}` : undefined}
          streak={streak}
        />

        {/* Continue Learning */}
        <ContinueLearningCard
          lastTopic={lastTopic?.topic ?? null}
          lastSubject={lastTopic?.subject ?? null}
          masteryPct={lastTopic ? Math.round(lastTopic.mastery * 100) : null}
          onContinue={() => setScreen("tutor")}
          emptyStateLabel="Choose a subject to start"
          emptyStateSubtext="Pick a subject below, or ask the AI tutor anything about your course."
        />

        {/* Course subjects */}
        {subjects.length > 0 && (
          <SubjectChips
            subjects={subjects}
            onChipClick={() => setScreen("tutor")}
            onViewAll={() => setScreen("explore")}
          />
        )}

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
            body="Upload your course outline in the AI Tutor (📎 button) for course-specific answers, or explore community projects."
            primaryCtaLabel="Ask AI tutor"
            onPrimaryCta={() => setScreen("tutor")}
            secondaryCtaLabel="Explore"
            onSecondaryCta={() => setScreen("explore")}
          />
        )}
      </div>
    </div>
  );
}
