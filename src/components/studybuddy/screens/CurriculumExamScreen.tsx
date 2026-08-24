"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Clock,
  Check,
  X,
  Trophy,
  RotateCw,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useApp } from "../store";

type Exam = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  passThreshold: number;
  subject: { name: string; icon: string; color: string };
  grade: { name: string };
  questions: Array<{
    id: string;
    questionText: string;
    options: string[];
    correctIndex: number;
    explanation: string | null;
    marks: number;
  }>;
};

type SubmitResult = {
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  passed: boolean;
  earnedMarks: number;
  totalMarks: number;
  results: Array<{
    questionId: string;
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string | null;
    marks: number;
  }>;
};

/**
 * CurriculumExamScreen — Phase 22
 *
 * Student exam-taking flow:
 *   1. List view: shows all published exams for the user's grade
 *   2. Exam view: timed multiple-choice exam
 *   3. Results view: score + per-question review with explanations
 *
 * Uses activeExamId from the store to know which exam to show.
 * If no activeExamId, shows the exam list.
 */
export function CurriculumExamScreen() {
  const { setScreen, activeExamId, setActiveExamId } = useApp();

  if (!activeExamId) {
    return <ExamList onBack={() => setScreen("home")} onPick={(id) => setActiveExamId(id)} />;
  }

  return (
    <ExamTaker
      examId={activeExamId}
      onExit={() => {
        setActiveExamId(null);
      }}
    />
  );
}

// ---------------------------------------------------------------------
// Exam list view
// ---------------------------------------------------------------------

function ExamList({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (id: string) => void;
}) {
  const [exams, setExams] = useState<Array<{
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    passThreshold: number;
    subject: { name: string; icon: string; color: string };
    grade: { name: string };
    questionCount: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/curriculum/exams")
      .then((r) => r.json())
      .then((d) => setExams(d.exams ?? []))
      .catch((e) => setError(e?.message ?? "Failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 max-w-sm w-full text-center">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="mt-2 text-sm text-rose-700">{error}</p>
          <button onClick={onBack} className="mt-3 text-xs font-bold text-rose-700 hover:underline">
            Go to home →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-sm font-bold text-gray-900">Exams</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {exams.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <FileText className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">No exams available yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Exams will appear here once your teacher publishes them.
            </p>
          </div>
        ) : (
          exams.map((e) => (
            <button
              key={e.id}
              onClick={() => onPick(e.id)}
              className="w-full text-left rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all p-4 flex items-center gap-3"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ backgroundColor: e.subject.color + "20" }}
              >
                {e.subject.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{e.title}</p>
                <p className="text-[11px] text-gray-500">
                  {e.grade.name} · {e.subject.name} · {e.questionCount} questions
                </p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> {e.durationMinutes} min
                  </span>
                  <span>Pass: {Math.round(e.passThreshold * 100)}%</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
          ))
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
// Exam taker view — timed, multiple choice
// ---------------------------------------------------------------------

function ExamTaker({ examId, onExit }: { examId: string; onExit: () => void }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0); // seconds

  // Load exam
  useEffect(() => {
    fetch(`/api/curriculum/exams/${examId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setExam(d.exam);
        setTimeLeft(d.exam.durationMinutes * 60);
      })
      .catch((e) => setError(e?.message ?? "Failed"))
      .finally(() => setLoading(false));
  }, [examId]);

  // Timer countdown
  useEffect(() => {
    if (!exam || submitted) return;
    if (timeLeft <= 0) {
      // Auto-submit when time runs out
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, exam, submitted]);

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/curriculum/exams/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Submit failed");
      setResult(d);
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }, [answers, examId, submitting, submitted]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 max-w-sm w-full text-center">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="mt-2 text-sm text-rose-700">{error ?? "Could not load exam"}</p>
          <button onClick={onExit} className="mt-3 text-xs font-bold text-rose-700 hover:underline">
            ← Back to exam list
          </button>
        </div>
      </div>
    );
  }

  // Results screen
  if (submitted && result) {
    return (
      <ExamResults
        exam={exam}
        result={result}
        answers={answers}
        onRetake={() => {
          setAnswers({});
          setSubmitted(false);
          setResult(null);
          setTimeLeft(exam.durationMinutes * 60);
        }}
        onExit={onExit}
      />
    );
  }

  // Exam-taking screen
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = exam.questions.length;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const timeWarning = timeLeft < 60;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header with timer */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => {
              if (confirm("Leave the exam? Your answers will be lost.")) onExit();
            }}
            className="text-gray-500 hover:text-gray-900"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{exam.title}</p>
            <p className="text-[10px] text-gray-500">
              {answeredCount}/{totalQuestions} answered
            </p>
          </div>
          <div
            className={`px-3 py-1.5 rounded-full text-sm font-bold ${
              timeWarning
                ? "bg-rose-50 text-rose-700 animate-pulse"
                : "bg-indigo-50 text-indigo-700"
            }`}
          >
            <Clock className="w-3.5 h-3.5 inline mr-1" />
            {timeStr}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {/* Questions */}
        {exam.questions.map((q, qi) => {
          const selected = answers[q.id];
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
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {q.marks} {q.marks === 1 ? "mark" : "marks"}
                </span>
              </div>
              <div className="space-y-1.5 ml-8">
                {q.options.map((opt, oi) => {
                  const isSelected = selected === oi;
                  return (
                    <button
                      key={oi}
                      onClick={() => setAnswers({ ...answers, [q.id]: oi })}
                      className={`w-full text-left px-3 py-2 rounded-xl border-2 text-sm transition ${
                        isSelected
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-gray-200 bg-white hover:border-indigo-300"
                      }`}
                    >
                      <span className="font-mono font-bold mr-2 text-xs">
                        {String.fromCharCode(65 + oi)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Submit button */}
        <button
          onClick={() => {
            if (answeredCount < totalQuestions) {
              if (!confirm(`You've only answered ${answeredCount} of ${totalQuestions} questions. Submit anyway?`)) return;
            }
            handleSubmit();
          }}
          disabled={submitting || answeredCount === 0}
          className="w-full h-12 rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-md hover:bg-emerald-700 disabled:opacity-40 transition flex items-center justify-center gap-1.5"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Grading…</>
          ) : (
            <><Check className="w-4 h-4" /> Submit exam ({answeredCount}/{totalQuestions})</>
          )}
        </button>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
// Results view
// ---------------------------------------------------------------------

function ExamResults({
  exam,
  result,
  answers,
  onRetake,
  onExit,
}: {
  exam: Exam;
  result: SubmitResult;
  answers: Record<string, number>;
  onRetake: () => void;
  onExit: () => void;
}) {
  const { passed, scorePercent, correctCount, totalQuestions } = result;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={onExit} className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-sm font-bold text-gray-900">Exam Results</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Score banner */}
        <div
          className={`rounded-2xl p-5 border ${
            passed
              ? "bg-emerald-50 border-emerald-200"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center ${
                passed ? "bg-emerald-100" : "bg-amber-100"
              }`}
            >
              <Trophy
                className={`w-8 h-8 ${
                  passed ? "text-emerald-600" : "text-amber-600"
                }`}
              />
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold text-gray-900">{scorePercent}%</p>
              <p className="text-sm text-gray-600">
                {correctCount} / {totalQuestions} correct
              </p>
              <p
                className={`text-xs font-bold uppercase mt-1 ${
                  passed ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {passed ? "✓ Passed" : "✗ Did not pass"}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={onRetake}
              className="flex-1 h-10 rounded-full bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-1"
            >
              <RotateCw className="w-3.5 h-3.5" /> Retake exam
            </button>
            <button
              onClick={onExit}
              className="flex-1 h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
            >
              Back to exams
            </button>
          </div>
        </div>

        {/* Per-question review */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
            Review answers
          </p>
          <div className="space-y-2">
            {exam.questions.map((q, qi) => {
              const r = result.results.find((rr) => rr.questionId === q.id);
              const userAnswer = answers[q.id];
              const isCorrect = r?.isCorrect ?? false;
              return (
                <div
                  key={q.id}
                  className={`rounded-2xl bg-white border p-3 ${
                    isCorrect ? "border-emerald-200" : "border-rose-200"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        isCorrect
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {isCorrect ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 flex-1">
                      {qi + 1}. {q.questionText}
                    </p>
                  </div>
                  <div className="ml-7 space-y-1 text-xs">
                    {q.options.map((opt, oi) => {
                      const isCorrectOpt = oi === q.correctIndex;
                      const isUserOpt = oi === userAnswer;
                      let cls = "text-gray-600";
                      if (isCorrectOpt) cls = "text-emerald-700 font-bold";
                      else if (isUserOpt) cls = "text-rose-700 font-bold line-through";
                      return (
                        <p key={oi} className={cls}>
                          <span className="font-mono mr-1">{String.fromCharCode(65 + oi)}.</span>
                          {opt}
                          {isCorrectOpt && " ✓"}
                          {isUserOpt && !isCorrectOpt && " (your answer)"}
                        </p>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div className="mt-2 ml-7 p-2 rounded-lg bg-gray-50 border border-gray-200">
                      <p className="text-[10px] font-bold uppercase text-gray-500 mb-0.5">
                        Explanation
                      </p>
                      <p className="text-xs text-gray-700">{q.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
