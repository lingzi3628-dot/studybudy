"use client";

/**
 * QuizLab — Phase G5 (Interactive Quiz Workspace)
 *
 * Turns the quiz from a simple MCQ renderer into an interactive learning
 * activity with 3 tabs, following the same pattern as Graph Lab:
 *
 *   1. Answer — take the quiz (same MCQ UI as before, but in the workspace)
 *   2. Review — see which answers were right/wrong + explanations
 *   3. Retry — re-answer ONLY the questions you got wrong
 *
 * The advisor's pattern: AI creates → learner explores → code checks →
 * AI helps only when asked → state saves safely.
 *
 * State is LOCAL — quiz answers don't affect mastery scores (clearly labeled).
 */

import { useState, useMemo, useCallback } from "react";
import {
  CheckCircle2, XCircle, RotateCcw, Bot, Target, HelpCircle, ListChecks,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

type QuizQuestion = {
  id: string;
  type: "mcq";
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
};

type QuizSpec = {
  title: string;
  questions: QuizQuestion[];
};

type QuizLabProps = {
  spec: QuizSpec;
  onAskTutor?: (context: string) => void;
  onSave?: (spec: QuizSpec) => void;
};

type Tab = "answer" | "review" | "retry";

// ============================================================
// Component
// ============================================================

export function QuizLab({ spec: initialSpec, onAskTutor, onSave }: QuizLabProps) {
  const [tab, setTab] = useState<Tab>("answer");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [retryAnswers, setRetryAnswers] = useState<Record<string, number>>({});
  const [retrySubmitted, setRetrySubmitted] = useState(false);

  const questions = initialSpec.questions || [];
  const totalQ = questions.length;

  // Which questions were wrong on first attempt?
  const wrongQuestionIds = useMemo(() => {
    if (!submitted) return [];
    return questions
      .filter((q) => answers[q.id] !== q.correctIndex)
      .map((q) => q.id);
  }, [submitted, answers, questions]);

  const wrongQuestions = useMemo(() => {
    return questions.filter((q) => wrongQuestionIds.includes(q.id));
  }, [questions, wrongQuestionIds]);

  // Score calculations
  const firstScore = useMemo(() => {
    if (!submitted) return 0;
    return questions.reduce((acc, q) => acc + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
  }, [submitted, answers, questions]);

  const retryScore = useMemo(() => {
    if (!retrySubmitted) return 0;
    return wrongQuestions.reduce((acc, q) => acc + (retryAnswers[q.id] === q.correctIndex ? 1 : 0), 0);
  }, [retrySubmitted, retryAnswers, wrongQuestions]);

  const totalCorrect = firstScore + retryScore;
  const allCorrect = totalCorrect === totalQ;

  // ---- Handlers ----
  const selectAnswer = useCallback((qId: string, idx: number) => {
    setAnswers((prev) => ({ ...prev, [qId]: idx }));
  }, []);

  const selectRetryAnswer = useCallback((qId: string, idx: number) => {
    setRetryAnswers((prev) => ({ ...prev, [qId]: idx }));
  }, []);

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    setTab("review");
  }, []);

  const handleRetry = useCallback(() => {
    setRetryAnswers({});
    setRetrySubmitted(false);
    setTab("retry");
  }, []);

  const handleRetrySubmit = useCallback(() => {
    setRetrySubmitted(true);
    setTab("review");
  }, []);

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);
  const allRetryAnswered = wrongQuestions.every((q) => retryAnswers[q.id] !== undefined);

  // ---- Ask Tutor ----
  const askTutor = useCallback((action: string, questionId?: string) => {
    const qText = questionId
      ? questions.find((q) => q.id === questionId)?.question ?? ""
      : "";
    const ctxStr = `[Looking at quiz "${initialSpec.title}" in my workspace. ${totalQ} questions. Score: ${firstScore}/${totalQ}${wrongQuestionIds.length > 0 ? `. Wrong: ${wrongQuestionIds.length}` : ""}.${questionId ? ` Question: "${qText}"` : ""}]\n\n`;
    onAskTutor?.(ctxStr + (questionId ? `Please ${action} for this question.` : `Please ${action}.`));
  }, [initialSpec, totalQ, firstScore, wrongQuestionIds, questions, onAskTutor]);

  // ---- Objective ----
  const objective = `Answer ${totalQ} question${totalQ !== 1 ? "s" : ""} about this topic. Check your answers, then review the explanations.`;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Activity objective */}
      <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
        <div className="flex items-start gap-2">
          <Target className="w-3.5 h-3.5 text-indigo-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase text-indigo-600">Activity</p>
            <p className="text-xs text-gray-700 leading-snug">{objective}</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0" role="tablist">
        <button
          onClick={() => setTab("answer")}
          role="tab"
          aria-selected={tab === "answer"}
          disabled={submitted}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "answer" ? "text-indigo-600 border-b-2 border-indigo-600 bg-white" : "text-gray-500 hover:text-gray-700"
          } ${submitted ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <HelpCircle className="w-3 h-3" /> Answer
        </button>
        <button
          onClick={() => setTab("review")}
          role="tab"
          aria-selected={tab === "review"}
          disabled={!submitted}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "review" ? "text-indigo-600 border-b-2 border-indigo-600 bg-white" : "text-gray-500 hover:text-gray-700"
          } ${!submitted ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <ListChecks className="w-3 h-3" /> Review
          {submitted && (
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
              allCorrect ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
            }`}>
              {totalCorrect}/{totalQ}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("retry")}
          role="tab"
          aria-selected={tab === "retry"}
          disabled={!submitted || wrongQuestionIds.length === 0}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "retry" ? "text-indigo-600 border-b-2 border-indigo-600 bg-white" : "text-gray-500 hover:text-gray-700"
          } ${!submitted || wrongQuestionIds.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <RotateCcw className="w-3 h-3" /> Retry
          {wrongQuestionIds.length > 0 && submitted && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500 text-white">
              {wrongQuestionIds.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4 min-h-0" role="tabpanel">

        {/* ---- Answer tab ---- */}
        {tab === "answer" && (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={q.id} className="rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-900 mb-2">
                  {idx + 1}. {q.question}
                </p>
                <div className="space-y-1.5">
                  {q.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => selectAnswer(q.id, i)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition ${
                        answers[q.id] === i
                          ? "bg-indigo-600 text-white font-semibold"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="w-full h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" /> {allAnswered ? "Submit Answers" : `Answer all ${totalQ} questions first`}
            </button>
          </div>
        )}

        {/* ---- Review tab ---- */}
        {tab === "review" && submitted && (
          <div className="space-y-4">
            {/* Score summary */}
            <div className={`rounded-xl p-4 text-center ${allCorrect ? "bg-emerald-50 border border-emerald-300" : "bg-amber-50 border border-amber-300"}`}>
              <p className={`text-2xl font-bold ${allCorrect ? "text-emerald-600" : "text-amber-600"}`}>
                {totalCorrect} / {totalQ}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {allCorrect
                  ? "🎉 Perfect! You got all questions right!"
                  : `${totalQ - totalCorrect} question${totalQ - totalCorrect !== 1 ? "s" : ""} need${totalQ - totalCorrect === 1 ? "s" : ""} another look.`}
              </p>
              {wrongQuestionIds.length > 0 && (
                <button
                  onClick={handleRetry}
                  className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700"
                >
                  <RotateCcw className="w-3 h-3" /> Retry wrong answers
                </button>
              )}
            </div>

            {/* Per-question review */}
            {questions.map((q, idx) => {
              const userAnswer = answers[q.id];
              const retryAnswer = retryAnswers[q.id];
              const wasWrong = userAnswer !== q.correctIndex;
              const retryCorrect = retryAnswer === q.correctIndex;
              const isCorrect = wasWrong ? retrySubmitted && retryCorrect : true;

              return (
                <div key={q.id} className={`rounded-xl border p-3 ${
                  isCorrect ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"
                }`}>
                  <div className="flex items-start gap-2 mb-2">
                    {isCorrect
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      : <XCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                    }
                    <p className="text-xs font-semibold text-gray-900 flex-1">
                      {idx + 1}. {q.question}
                    </p>
                  </div>
                  <div className="space-y-1 ml-6">
                    {q.options.map((opt, i) => {
                      const isCorrectOpt = i === q.correctIndex;
                      const isUserOpt = i === userAnswer;
                      const isRetryOpt = wasWrong && i === retryAnswer;
                      return (
                        <div key={i} className={`text-xs px-2 py-1 rounded ${
                          isCorrectOpt ? "bg-emerald-100 text-emerald-800 font-semibold"
                          : isUserOpt || isRetryOpt ? "bg-rose-100 text-rose-800 line-through"
                          : "text-gray-600"
                        }`}>
                          {String.fromCharCode(65 + i)}. {opt}
                          {isCorrectOpt && " ✓"}
                          {(isUserOpt && wasWrong) && " ← your answer"}
                          {isRetryOpt && !isCorrectOpt && " ← retry answer"}
                          {isRetryOpt && isCorrectOpt && " ← corrected!"}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div className="mt-2 ml-6 p-2 rounded-lg bg-blue-50 border border-blue-100">
                      <p className="text-[10px] font-bold uppercase text-blue-600 mb-0.5">Explanation</p>
                      <p className="text-[11px] text-gray-700 leading-relaxed">{q.explanation}</p>
                    </div>
                  )}
                  {/* Ask tutor about this question */}
                  {onAskTutor && (
                    <button
                      onClick={() => askTutor("explain why my answer is wrong and the correct answer is right", q.id)}
                      className="mt-2 ml-6 flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800"
                    >
                      <Bot className="w-3 h-3" /> Ask tutor about this question
                    </button>
                  )}
                </div>
              );
            })}

            <p className="text-[9px] text-gray-400 text-center">
              These are practice questions. Your answers don't affect your progress score.
            </p>
          </div>
        )}

        {/* ---- Retry tab ---- */}
        {tab === "retry" && submitted && wrongQuestions.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-800">
                Retry {wrongQuestions.length} question{wrongQuestions.length !== 1 ? "s" : ""} you got wrong.
              </p>
              <p className="text-[10px] text-amber-600 mt-0.5">
                Take your time. You can review explanations after submitting.
              </p>
            </div>

            {wrongQuestions.map((q, idx) => (
              <div key={q.id} className="rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-900 mb-2">
                  {questions.indexOf(q) + 1}. {q.question}
                </p>
                <div className="space-y-1.5">
                  {q.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => selectRetryAnswer(q.id, i)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition ${
                        retryAnswers[q.id] === i
                          ? "bg-indigo-600 text-white font-semibold"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={handleRetrySubmit}
              disabled={!allRetryAnswered}
              className="w-full h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" /> {allRetryAnswered ? "Check retry answers" : `Answer all ${wrongQuestions.length} first`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
