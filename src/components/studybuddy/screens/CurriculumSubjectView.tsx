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
  Bot,
  X,
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
  const [showChatbot, setShowChatbot] = useState(false);
  const [capacity, setCapacity] = useState<any>(null);

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

        // Fetch subject info via the first topic's data
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

        // Fetch subject-level capacity (Phase 22d)
        try {
          const capRes = await fetch(
            `/api/curriculum/capacity?subjectId=${activeCurriculumSubjectId}`
          );
          if (capRes.ok) {
            const capData = await capRes.json();
            setCapacity(capData.capacity ?? null);
          }
        } catch {
          // best-effort
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
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 flex-1">
              Learning Path
            </p>
            <button
              onClick={() => setShowChatbot(true)}
              className="px-3 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 transition flex items-center gap-1"
            >
              <Bot className="w-3 h-3" /> Plan with AI
            </button>
          </div>
          <p className="text-sm text-gray-700">
            Work through each topic in order. Each topic has a lesson, flashcards,
            and a short quiz to test your understanding.
          </p>

          {/* Capacity indicator (Phase 22d) */}
          {capacity && (
            <div className="mt-3 pt-3 border-t border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-gray-500 mb-1">
                    <span>Your capacity</span>
                    <span>{capacity.capacityScore ?? 0}/100</span>
                  </div>
                  <div className="h-2 bg-white rounded-full overflow-hidden border border-indigo-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (capacity.capacityScore ?? 0) >= 85
                          ? "bg-emerald-500"
                          : (capacity.capacityScore ?? 0) >= 60
                          ? "bg-indigo-500"
                          : (capacity.capacityScore ?? 0) >= 30
                          ? "bg-amber-500"
                          : "bg-rose-400"
                      }`}
                      style={{ width: `${capacity.capacityScore ?? 0}%` }}
                    />
                  </div>
                </div>
                {capacity.totalTopics !== undefined && (
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {capacity.completedTopics ?? 0}/{capacity.totalTopics} done
                  </span>
                )}
              </div>
              {capacity.recommendationText && (
                <p className="mt-2 text-[11px] text-indigo-700">
                  💡 {capacity.recommendationText}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Chatbot modal */}
        {showChatbot && subject && (
          <ChatbotPathModal
            subjectId={subject.id}
            subjectName={subject.name}
            onClose={() => setShowChatbot(false)}
          />
        )}

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

// ---------------------------------------------------------------------
// ChatbotPathModal — AI-powered learning path creator
// ---------------------------------------------------------------------

function ChatbotPathModal({
  subjectId,
  subjectName,
  onClose,
}: {
  subjectId: string;
  subjectName: string;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load questions on mount
  useEffect(() => {
    fetch("/api/curriculum/chatbot-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.questions) setQuestions(d.questions);
        else if (d.error) setError(d.error);
      })
      .catch((e) => setError(e?.message ?? "Failed"))
      .finally(() => setLoading(false));
  }, [subjectId]);

  const generatePlan = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch("/api/curriculum/chatbot-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, answers }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setPlan(d.plan);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setGenerating(false);
    }
  };

  const currentQuestion = questions[currentQ];
  const isLastQ = currentQ === questions.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <p className="text-sm font-bold">AI Path Planner</p>
          </div>
          <p className="text-[11px] opacity-90 mt-0.5">
            Personalized {subjectName} plan for you
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Interview mode */}
          {!loading && !plan && currentQuestion && (
            <div>
              {/* Progress dots */}
              <div className="flex items-center gap-1 mb-4">
                {questions.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition ${
                      i <= currentQ ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>

              <p className="text-sm font-bold text-gray-900 mb-3">
                {currentQuestion.question}
              </p>
              <div className="space-y-2">
                {currentQuestion.options.map((opt: string) => {
                  const isSelected = answers[currentQuestion.key] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const newAnswers = { ...answers, [currentQuestion.key]: opt };
                        setAnswers(newAnswers);
                        // Auto-advance after a short delay
                        setTimeout(() => {
                          if (!isLastQ) {
                            setCurrentQ((q) => q + 1);
                          }
                        }, 200);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-sm transition ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold"
                          : "border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Nav buttons */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
                  disabled={currentQ === 0}
                  className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 disabled:opacity-40"
                >
                  ← Back
                </button>
                {isLastQ ? (
                  <button
                    onClick={generatePlan}
                    disabled={generating || Object.keys(answers).length < questions.length}
                    className="flex-1 h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {generating ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                    ) : (
                      <><Bot className="w-3.5 h-3.5" /> Generate my plan</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentQ((q) => q + 1)}
                    disabled={!answers[currentQuestion.key]}
                    className="flex-1 h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Plan display */}
          {!loading && plan && (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Your {plan.totalMonths}-month plan is ready!
                </p>
                <p className="text-[11px] text-emerald-700/80 mt-1">{plan.summary}</p>
              </div>

              {/* Month-by-month plan */}
              <div className="space-y-2">
                {plan.months?.map((m: any) => (
                  <div key={m.month} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                        {m.month}
                      </span>
                      <p className="text-sm font-bold text-gray-900">{m.title}</p>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-1.5">{m.goal}</p>
                    <div className="flex flex-wrap gap-1">
                      {m.topics?.map((t: string, i: number) => (
                        <span
                          key={i}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {plan.fallback && (
                <p className="text-[10px] text-amber-600 text-center">
                  ⚠️ Generated without AI (fallback mode). {plan.aiError ? `AI error: ${plan.aiError}` : ""}
                </p>
              )}

              <button
                onClick={onClose}
                className="w-full h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                Start studying →
              </button>

              {/* Auto-start topic 1 button */}
              {plan?.months?.[0]?.topics?.[0] && (
                <button
                  onClick={() => {
                    // Find the topic matching the first recommended topic
                    const firstTopicName = plan.months[0].topics[0];
                    // Try to find it in the topics list
                    // (We need access to the topics — pass via prop or fetch)
                    // For now, just close the modal — the student can click the topic
                    onClose();
                  }}
                  className="w-full h-10 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 flex items-center justify-center gap-1"
                >
                  <Play className="w-4 h-4" /> Start Topic 1 now
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
