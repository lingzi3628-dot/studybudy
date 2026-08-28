"use client";

import { useEffect, useState } from "react";
import { X, Check, RotateCcw, Loader2, AlertCircle, Trophy } from "lucide-react";
import { useApp } from "../store";
import { api, type Card } from "../api";
import { useI18n } from "@/lib/useI18n";

export function Flashcards() {
  const { setScreen } = useApp();
  const { t } = useI18n();
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [knownCount, setKnownCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await api.getReviewQueue();
        if (!mounted) return;
        setCards(r.cards);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load review queue");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const submit = async (quality: 0 | 5) => {
    if (!cards[idx] || submitting) return;
    setSubmitting(true);
    try {
      await api.submitReview({ cardId: cards[idx].id, quality });
      if (quality === 5) setKnownCount((c) => c + 1);
      if (idx + 1 < cards.length) {
        setIdx((i) => i + 1);
        setFlipped(false);
      } else {
        setDone(true);
      }
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
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

  if (cards.length === 0 || done) {
    return (
      <div className="min-h-screen max-w-2xl mx-auto flex flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <Trophy className="w-7 h-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">
          {done ? t("study.allCaughtUp") : t("study.noCardsDue")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {done
            ? t("study.youReviewed", { n: cards.length, k: knownCount })
            : t("study.comeBackLater")}
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

  const card = cards[idx];

  return (
    <div className="min-h-screen bg-gray-50 max-w-2xl mx-auto flex flex-col">
      {/* top bar */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => setScreen("home")}
          aria-label="Exit"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">
          {card.subject ?? "Flashcards"}
        </h1>
        <div className="text-sm text-gray-500 font-medium">
          {idx + 1}/{cards.length}
        </div>
      </header>

      {/* progress bar */}
      <div className="px-4 pt-3">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all"
            style={{ width: `${((idx + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* flashcard */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <button
          onClick={() => setFlipped((f) => !f)}
          className="flip-card w-full h-72 md:h-80 text-left"
          aria-label="Flip card"
        >
          <div className={`flip-card-inner ${flipped ? "is-flipped" : ""}`}>
            <div className="flip-card-face rounded-3xl bg-white shadow-md border border-gray-100 p-6 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase tracking-wider text-indigo-600 font-semibold">
                {t("study.question")} · {card.topic ?? "General"}
              </span>
              <p className="mt-3 text-xl font-semibold text-gray-900 leading-snug">
                {card.front ?? card.question ?? "No question"}
              </p>
              <span className="mt-6 text-xs text-gray-400">{t("study.flip")}</span>
            </div>
            <div className="flip-card-face flip-card-back rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-500 text-white shadow-md p-6 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">{t("study.answer")}</span>
              <p className="mt-3 text-xl font-bold leading-snug">{card.back ?? "No answer"}</p>
              <span className="mt-6 text-xs opacity-70">{t("study.flipBack")}</span>
            </div>
          </div>
        </button>
      </div>

      {/* action buttons */}
      <div className="px-4 pb-6 space-y-3">
        {flipped ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => submit(0)}
              disabled={submitting}
              className="h-12 rounded-full bg-amber-500 text-white font-semibold shadow-md hover:bg-amber-600 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> {t("study.stillLearning")}
            </button>
            <button
              onClick={() => submit(5)}
              disabled={submitting}
              className="h-12 rounded-full bg-emerald-500 text-white font-semibold shadow-md hover:bg-emerald-600 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> {t("study.iKnewIt")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setFlipped(true)}
            className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition"
          >
            {t("study.showAnswer")}
          </button>
        )}
      </div>
    </div>
  );
}
