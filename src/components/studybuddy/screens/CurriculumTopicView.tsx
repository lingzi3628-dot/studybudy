"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Layers,
  Brain,
  Check,
  X,
  ChevronRight,
  RotateCw,
  Trophy,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../store";

type TopicData = {
  topic: {
    id: string;
    name: string;
    summary: string | null;
    contentMarkdown: string | null;
    estimatedMin: number;
    orderIndex: number;
    subject: {
      id: string;
      name: string;
      icon: string;
      color: string;
      gradeName: string;
    };
    flashcards: Array<{ id: string; front: string; back: string }>;
    quizQuestions: Array<{
      id: string;
      questionText: string;
      options: string[];
      correctIndex: number;
      explanation: string | null;
      difficulty: string;
    }>;
  };
};

/**
 * CurriculumTopicView — Phase 22
 *
 * Shows a single curriculum topic with:
 *   1. The lesson content (rendered as markdown)
 *   2. Flashcards (flip to reveal the answer)
 *   3. A quiz (multiple choice, auto-graded with explanations)
 *
 * After completing the quiz, the user can go back to the subject view
 * to pick the next topic.
 */
export function CurriculumTopicView() {
  const {
    setScreen,
    activeCurriculumTopicId,
    setActiveCurriculumSubjectId,
  } = useApp();
  const [data, setData] = useState<TopicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"lesson" | "flashcards" | "quiz">("lesson");

  useEffect(() => {
    if (!activeCurriculumTopicId) {
      setError("No topic selected");
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/curriculum/topic/${activeCurriculumTopicId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        setData(d);
        // Set the active subject ID so the back button works
        if (d.topic?.subject?.id) {
          setActiveCurriculumSubjectId(d.topic.subject.id);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCurriculumTopicId, setActiveCurriculumSubjectId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 max-w-sm w-full text-center">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="mt-2 text-sm text-rose-700">
            {error ?? "Could not load topic"}
          </p>
          <button
            onClick={() => setScreen("curriculumSubject")}
            className="mt-3 text-xs font-bold text-rose-700 hover:underline"
          >
            ← Back to subject
          </button>
        </div>
      </div>
    );
  }

  const { topic } = data;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => setScreen("curriculumSubject")}
            className="text-gray-500 hover:text-gray-900"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
            style={{ backgroundColor: topic.subject.color + "20" }}
          >
            {topic.subject.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {topic.name}
            </p>
            <p className="text-[10px] text-gray-500">
              {topic.subject.gradeName} · {topic.subject.name}
            </p>
          </div>
        </div>
        {/* Tab bar */}
        <div className="max-w-3xl mx-auto px-4 pb-2 flex gap-1 bg-gray-100 rounded-xl mx-4 mb-2">
          {[
            { key: "lesson" as const, label: "📖 Lesson" },
            { key: "flashcards" as const, label: `🎴 Cards (${topic.flashcards.length})` },
            { key: "quiz" as const, label: `❓ Quiz (${topic.quizQuestions.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                tab === t.key ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {tab === "lesson" && (
          <LessonView contentMarkdown={topic.contentMarkdown} summary={topic.summary} />
        )}
        {tab === "flashcards" && <FlashcardsView flashcards={topic.flashcards} />}
        {tab === "quiz" && <QuizView questions={topic.quizQuestions} topicId={topic.id} />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
// Lesson view — renders markdown content
// ---------------------------------------------------------------------

function LessonView({
  contentMarkdown,
  summary,
}: {
  contentMarkdown: string | null;
  summary: string | null;
}) {
  if (!contentMarkdown) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
        <BookOpen className="w-8 h-8 text-gray-400 mx-auto" />
        <p className="mt-2 text-sm text-gray-600">No lesson content yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-5">
      {summary && (
        <div className="mb-4 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 mb-0.5">
            Summary
          </p>
          <p className="text-sm text-gray-700">{summary}</p>
        </div>
      )}
      <div className="prose prose-sm max-w-none">
        <MarkdownRenderer content={contentMarkdown} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Simple markdown renderer (headings, bold, lists, paragraphs)
// ---------------------------------------------------------------------

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="my-2 text-sm leading-relaxed text-gray-800">
          {paragraph.join(" ")}
        </p>
      );
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-2 ml-5 list-disc space-y-1 text-sm text-gray-800">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="text-base font-bold text-gray-900 mt-4 mb-1">
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="text-lg font-bold text-gray-900 mt-4 mb-1">
          {trimmed.slice(2)}
        </h1>
      );
    } else if (trimmed.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="text-sm font-bold text-gray-900 mt-3 mb-1">
          {trimmed.slice(4)}
        </h3>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushParagraph();
      listItems.push(trimmed.replace(/^\d+\.\s/, ""));
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushParagraph();
      listItems.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  }
  flushParagraph();
  flushList();

  return <>{blocks}</>;
}

function renderInline(text: string): React.ReactNode {
  // Simple **bold** parser
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-gray-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

// ---------------------------------------------------------------------
// Flashcards view — flip cards
// ---------------------------------------------------------------------

function FlashcardsView({
  flashcards,
}: {
  flashcards: Array<{ id: string; front: string; back: string }>;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (flashcards.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
        <Layers className="w-8 h-8 text-gray-400 mx-auto" />
        <p className="mt-2 text-sm text-gray-600">No flashcards for this topic.</p>
      </div>
    );
  }

  const card = flashcards[idx];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Card {idx + 1} of {flashcards.length}
        </span>
        <button
          onClick={() => {
            setIdx(0);
            setFlipped(false);
          }}
          className="flex items-center gap-1 hover:text-indigo-600"
        >
          <RotateCw className="w-3 h-3" /> Restart
        </button>
      </div>

      {/* Flip card */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="w-full min-h-[200px] rounded-2xl bg-white border-2 border-indigo-200 shadow-md hover:shadow-lg transition-all p-6 flex flex-col items-center justify-center text-center"
      >
        {!flipped ? (
          <>
            <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 mb-2">
              Question
            </span>
            <p className="text-base font-semibold text-gray-900">{card.front}</p>
            <span className="mt-4 text-[10px] text-gray-400">Tap to flip</span>
          </>
        ) : (
          <>
            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-500 mb-2">
              Answer
            </span>
            <p className="text-base text-gray-800">{card.back}</p>
            <span className="mt-4 text-[10px] text-gray-400">Tap to flip back</span>
          </>
        )}
      </button>

      {/* Nav buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (idx > 0) {
              setIdx(idx - 1);
              setFlipped(false);
            }
          }}
          disabled={idx === 0}
          className="flex-1 h-10 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold disabled:opacity-40 hover:bg-gray-200 transition"
        >
          ← Previous
        </button>
        <button
          onClick={() => {
            if (idx < flashcards.length - 1) {
              setIdx(idx + 1);
              setFlipped(false);
            }
          }}
          disabled={idx === flashcards.length - 1}
          className="flex-1 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-indigo-700 transition"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Quiz view — multiple choice with auto-grading
// ---------------------------------------------------------------------

function QuizView({
  questions,
  topicId,
}: {
  questions: Array<{
    id: string;
    questionText: string;
    options: string[];
    correctIndex: number;
    explanation: string | null;
    difficulty: string;
  }>;
  topicId: string;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
        <Brain className="w-8 h-8 text-gray-400 mx-auto" />
        <p className="mt-2 text-sm text-gray-600">No quiz questions for this topic.</p>
      </div>
    );
  }

  const correctCount = questions.filter(
    (q) => answers[q.id] === q.correctIndex
  ).length;
  const scorePct = Math.round((correctCount / questions.length) * 100);

  const submit = () => {
    setSubmitted(true);
    // Scroll to top so the user sees their score
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Phase 22d — record the quiz attempt to the capacity engine
    // (best-effort — don't block the UI on this)
    const score = questions.length > 0 ? correctCount / questions.length : 0;
    fetch("/api/curriculum/quiz-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId,
        score,
        timeSpentSec: 0, // we don't track this client-side yet
      }),
    }).catch(() => {});
  };

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="space-y-4">
      {/* Score banner after submit */}
      {submitted && (
        <div
          className={`rounded-2xl p-4 border ${
            scorePct >= 70
              ? "bg-emerald-50 border-emerald-200"
              : scorePct >= 40
              ? "bg-amber-50 border-amber-200"
              : "bg-rose-50 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <Trophy
              className={`w-8 h-8 ${
                scorePct >= 70 ? "text-emerald-600" : scorePct >= 40 ? "text-amber-600" : "text-rose-600"
              }`}
            />
            <div>
              <p className="text-sm font-bold text-gray-900">
                You scored {correctCount}/{questions.length} ({scorePct}%)
              </p>
              <p className="text-xs text-gray-600">
                {scorePct >= 70
                  ? "Great job! You've mastered this topic. 🎉"
                  : scorePct >= 40
                  ? "Good effort! Review the explanations below and try again."
                  : "Keep practicing! Read the lesson again and try the quiz."}
              </p>
            </div>
          </div>
          <button
            onClick={reset}
            className="mt-3 w-full h-9 rounded-full bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-1"
          >
            <RotateCw className="w-3 h-3" /> Try again
          </button>
        </div>
      )}

      {/* Questions */}
      {questions.map((q, qi) => {
        const userAnswer = answers[q.id];
        const isCorrect = userAnswer === q.correctIndex;
        return (
          <div
            key={q.id}
            className="rounded-2xl bg-white border border-gray-200 p-4"
          >
            <div className="flex items-start gap-2 mb-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold flex items-center justify-center">
                {qi + 1}
              </span>
              <p className="text-sm font-semibold text-gray-900 flex-1">
                {q.questionText}
              </p>
              {submitted && (
                <span className="flex-shrink-0">
                  {isCorrect ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <X className="w-4 h-4 text-rose-600" />
                  )}
                </span>
              )}
            </div>

            {/* Options */}
            <div className="space-y-1.5 ml-8">
              {q.options.map((opt, oi) => {
                const selected = userAnswer === oi;
                const isThisCorrect = oi === q.correctIndex;
                let cls = "border-gray-200 bg-white hover:border-indigo-300";
                if (submitted) {
                  if (isThisCorrect) cls = "border-emerald-300 bg-emerald-50";
                  else if (selected) cls = "border-rose-300 bg-rose-50";
                  else cls = "border-gray-200 bg-white opacity-60";
                } else if (selected) {
                  cls = "border-indigo-400 bg-indigo-50";
                }
                return (
                  <button
                    key={oi}
                    onClick={() => !submitted && setAnswers({ ...answers, [q.id]: oi })}
                    disabled={submitted}
                    className={`w-full text-left px-3 py-2 rounded-xl border-2 text-sm transition ${cls}`}
                  >
                    <span className="font-mono font-bold mr-2 text-xs">
                      {String.fromCharCode(65 + oi)}.
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* Explanation after submit */}
            {submitted && q.explanation && (
              <div className="mt-3 ml-8 p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">
                  Explanation
                </p>
                <p className="text-xs text-gray-700">{q.explanation}</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Submit button */}
      {!submitted && (
        <button
          onClick={submit}
          disabled={Object.keys(answers).length < questions.length}
          className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-40 transition flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 className="w-4 h-4" />
          Submit quiz ({Object.keys(answers).length}/{questions.length} answered)
        </button>
      )}

      {submitted && (
        <button
          onClick={() => setSubmitted(false)}
          className="w-full h-10 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition"
        >
          ← Back to questions
        </button>
      )}
    </div>
  );
}
