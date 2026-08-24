"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  BookOpen,
  ChevronRight,
  Clock,
  Layers,
  CheckCircle2,
  Lock,
  Play,
  FileText,
  Brain,
  Trophy,
} from "lucide-react";
import { useApp } from "../store";

type Topic = {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  orderIndex: number;
  estimatedMin: number;
  flashcardCount: number;
  quizQuestionCount: number;
};

type Subject = {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  gradeName: string;
};

/**
 * CurriculumSubjectView — Phase 22
 *
 * Shows the list of topics for a curriculum subject as an ordered learning
 * path. Each topic card shows:
 *   - Topic name + summary
 *   - Estimated study time
 *   - Flashcard + quiz question counts
 *   - A "Start" button that opens the topic study view
 *
 * The first topic is always available. Subsequent topics are gated by
 * completing the previous topic's quiz (TODO — for now all topics are open).
 */
export function CurriculumSubjectView() {
  const {
    setScreen,
    activeCurriculumSubjectId,
    setActiveCurriculumTopicId,
  } = useApp();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCurriculumSubjectId) {
      setError("No subject selected");
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        // Fetch topics for this subject
        const r = await fetch(
          `/api/curriculum/topics?subjectId=${activeCurriculumSubjectId}`
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        setTopics(d.topics ?? []);

        // Fetch subject info via the grades+subjects chain — for now we
        // reconstruct from the first topic's data. A dedicated /api/curriculum/subject/[id]
        // endpoint would be cleaner, but this works.
        if (d.topics?.length > 0) {
          const firstTopicRes = await fetch(
            `/api/curriculum/topic/${d.topics[0].id}`
          );
          if (firstTopicRes.ok) {
            const ft = await firstTopicRes.json();
            setSubject({
              id: activeCurriculumSubjectId,
              name: ft.topic?.subject?.name ?? "Subject",
              icon: ft.topic?.subject?.icon ?? "📚",
              color: ft.topic?.subject?.color ?? "#6366F1",
              description: null,
              gradeName: ft.topic?.subject?.gradeName ?? "",
            });
          }
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCurriculumSubjectId]);

  const openTopic = (topicId: string) => {
    setActiveCurriculumTopicId(topicId);
    setScreen("curriculumTopic");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 max-w-sm w-full text-center">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="mt-2 text-sm text-rose-700">
            {error ?? "Could not load subject"}
          </p>
          <button
            onClick={() => setScreen("home")}
            className="mt-3 text-xs font-bold text-rose-700 hover:underline"
          >
            Go to home →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => setScreen("home")}
            className="text-gray-500 hover:text-gray-900"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
            style={{ backgroundColor: subject.color + "20" }}
          >
            {subject.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {subject.name}
            </p>
            <p className="text-[10px] text-gray-500">
              {subject.gradeName} · {topics.length} topics
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {/* Subject description / path header */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-indigo-600" />
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
              Learning Path
            </p>
          </div>
          <p className="text-sm text-gray-700">
            Work through each topic in order. Each topic has a lesson, flashcards,
            and a short quiz to test your understanding.
          </p>
        </div>

        {/* Topics list */}
        {topics.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <BookOpen className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">
              No topics yet for this subject.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              An admin needs to upload content for this subject.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {topics.map((t, i) => (
              <li key={t.id}>
                <button
                  onClick={() => openTopic(t.id)}
                  className="w-full text-left rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all p-4 flex items-center gap-3"
                >
                  {/* Step number */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                    {i + 1}
                  </div>

                  {/* Topic info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {t.name}
                    </p>
                    {t.summary && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {t.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {t.estimatedMin} min
                      </span>
                      {t.flashcardCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Layers className="w-3 h-3" />
                          {t.flashcardCount} cards
                        </span>
                      )}
                      {t.quizQuestionCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Brain className="w-3 h-3" />
                          {t.quizQuestionCount} questions
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Start button */}
                  <span className="flex-shrink-0 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold flex items-center gap-1">
                    <Play className="w-3 h-3" /> Start
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {/* Footer hint */}
        <p className="text-center text-[11px] text-gray-400 mt-6">
          {topics.length} {topics.length === 1 ? "topic" : "topics"} ·
          StudyBuddy AI Curriculum
        </p>
      </main>
    </div>
  );
}
