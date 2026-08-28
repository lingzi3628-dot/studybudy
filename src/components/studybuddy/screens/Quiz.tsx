"use client";

import { useEffect, useState } from "react";
import { X, Check, ChevronRight, Info, Loader2, AlertCircle, Trophy } from "lucide-react";
import { useApp } from "../store";
import { api, type Card } from "../api";
import { useI18n } from "@/lib/useI18n";

type Q = {
  cardId: string;
  question: string;
  options: string[];
  correct: number;
  explanation?: string | null;
  subject?: string | null;
  topic?: string | null;
};

export function Quiz() {
  const { setScreen, activeStudySetId } = useApp();
  const { t } = useI18n();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [startTime, setStartTime] = useState<number>(Date.now());

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let mcqCards: Card[] = [];
        if (activeStudySetId) {
          const r = await api.getStudySet(activeStudySetId);
          mcqCards = (r.studySet.cards ?? []).filter((c) => c.cardType === "mcq");
        }
        if (mcqCards.length === 0) {
          // fallback to due queue
          const q = await api.getReviewQueue();
          mcqCards = q.cards.filter((c) => c.cardType === "mcq");
        }
        if (!mounted) return;
        const qs: Q[] = mcqCards.map((c) => ({
          cardId: c.id,
          question: c.question ?? "(no question)",
          options: c.options ?? [],
          correct: c.correctIndex ?? 0,
          explanation: c.explanation,
          subject: c.subject,
          topic: c.topic,
        }));
        setQuestions(qs);
        setStartTime(Date.now());
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load quiz");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeStudySetId]);

  const handleSelect = (i: number) => {
    if (selected !== null || submitting) return;
    setSelected(i);
    setShowNext(true);
    const correct = i === questions[qIdx].correct;
    if (correct) setCorrectCount((c) => c + 1);
    setSubmitting(true);
    api
      .recordAttempt({
        cardId: questions[qIdx].cardId,
        selectedIndex: i,
        isCorrect: correct,
        responseTimeMs: Date.now() - startTime,
      })
      .catch(() => {})
      .finally(() => setSubmitting(false));
  };

  const handleNext = () => {
    if (qIdx + 1 < questions.length) {
      setQIdx(qIdx + 1);
      setSelected(null);
      setShowNext(false);
      setStartTime(Date.now());
    } else {
      setScreen("progress");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen max-w-2xl mx-auto flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2 text-sm">{t("common.loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen max-w-2xl mx-auto px-4 flex flex-col items-center justify-center text-center">
        <AlertCircle className="w-8 h-8 text-rose-500" />
        <p className="mt-3 text-sm text-rose-600">{error}</p>
        <button onClick={() => setScreen("home")} className="mt-4 px-4 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold">
          {t("study.backHome")}
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen max-w-2xl mx-auto px-4 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
          <Trophy className="w-7 h-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">No MCQs to quiz yet</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a study set first — AI will generate quiz questions automatically.
        </p>
        <button
          onClick={() => setScreen("home")}
          className="mt-6 px-6 h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
        >
          {t("study.backHome")}
        </button>
      </div>
    );
  }

  const q = questions[qIdx];
  const isCorrect = selected === q.correct;

  return (
    <div className="min-h-screen bg-gray-50 max-w-2xl mx-auto flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => setScreen("home")}
          aria-label="Exit quiz"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">{q.subject ?? "Quiz"}</h1>
        <span className="text-sm font-medium text-gray-500">
          {qIdx + 1}/{questions.length}
        </span>
      </header>

      <div className="px-4 pt-3">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all"
            style={{ width: `${((qIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 px-4 py-6 flex flex-col">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          {t("study.question")} {qIdx + 1} {q.topic ? `· ${q.topic}` : ""}
        </p>
        <h2 className="mt-2 text-xl font-bold text-gray-900 leading-snug">{q.question}</h2>

        <div className="mt-6 space-y-3">
          {q.options.map((opt, i) => {
            const isSel = selected === i;
            const isAns = i === q.correct;
            let cls = "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 text-gray-900";
            if (selected !== null) {
              if (isAns) cls = "border-emerald-500 bg-emerald-50 text-emerald-700";
              else if (isSel) cls = "border-rose-500 bg-rose-50 text-rose-700";
              else cls = "border-gray-200 bg-white opacity-60 text-gray-700";
            }
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={selected !== null}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 text-sm font-medium transition ${cls}`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </span>
                {selected !== null && isAns && <Check className="w-4 h-4" />}
                {selected !== null && isSel && !isAns && <X className="w-4 h-4" />}
              </button>
            );
          })}
        </div>

        {selected !== null && (
          <div className={`mt-5 p-4 rounded-2xl border-2 animate-in slide-in-from-bottom-2 ${isCorrect ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Info className={`w-4 h-4 ${isCorrect ? "text-emerald-600" : "text-rose-600"}`} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                {isCorrect ? "Correct!" : "Not quite"}
              </span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {q.explanation ?? "Correct answer shown above."}
            </p>
          </div>
        )}

        {showNext && (
          <button
            onClick={handleNext}
            className="mt-6 w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-1.5"
          >
            {qIdx + 1 < questions.length ? "Next Question" : "Finish Quiz"}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
