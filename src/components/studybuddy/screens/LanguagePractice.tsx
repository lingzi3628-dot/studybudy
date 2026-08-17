"use client";

import { useEffect, useState } from "react";
import { X, Volume2, Layers, Headphones, Shuffle, Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useApp } from "../store";
import { api, type Translation } from "../api";

type Mode = "flashcards" | "listening" | "matching";

const modes: { key: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "flashcards", label: "Flashcards", icon: Layers },
  { key: "listening", label: "Listening", icon: Headphones },
  { key: "matching", label: "Matching", icon: Shuffle },
];

const samplePairs = [
  { swahili: "Habari", english: "Hello" },
  { swahili: "Asante", english: "Thank you" },
  { swahili: "Tafadhali", english: "Please" },
  { swahili: "Karibu", english: "Welcome" },
];

const languages = ["Swahili", "Chinese", "French", "Spanish", "Arabic"];

export function LanguagePractice() {
  const { setScreen } = useApp();
  const [mode, setMode] = useState<Mode>("flashcards");
  const [language, setLanguage] = useState("Swahili");
  const [pairs, setPairs] = useState(samplePairs);
  const [flipped, setFlipped] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // regenerate translations when language changes
  const regenerate = async () => {
    setTranslating(true);
    setError(null);
    try {
      const newPairs = await Promise.all(
        samplePairs.map(async (p) => {
          try {
            const r = await api.translate(p.english, language);
            return { swahili: r.translation || p.swahili, english: p.english, pronunciation: r.pronunciation };
          } catch {
            return { ...p, pronunciation: "" };
          }
        })
      );
      setPairs(newPairs.map((p) => ({ swahili: p.swahili, english: p.english })));
      // attach pronunciation data via state if needed
    } catch (e: any) {
      setError(e?.message ?? "Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      if (language === "Swahili") {
        setPairs(samplePairs);
        return;
      }
      await regenerate();
    })();
    return () => {
      mounted = false;
    };
  }, [language]);

  const current = pairs[cardIdx] ?? samplePairs[0];

  return (
    <div className="min-h-screen bg-gray-50 max-w-2xl mx-auto flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => setScreen("home")}
          aria-label="Exit"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-transparent text-base font-semibold text-gray-900 outline-none cursor-pointer"
        >
          {languages.map((l) => (
            <option key={l} value={l}>{l} Greetings</option>
          ))}
        </select>
        <button
          onClick={regenerate}
          disabled={translating}
          aria-label="Regenerate translations"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${translating ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* progress */}
      <div className="px-4 pt-3">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "30%" }} />
        </div>
      </div>

      {/* mode toggle */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-2xl">
          {modes.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition ${
                  active ? "bg-white shadow text-indigo-600" : "text-gray-500"
                }`}
              >
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 px-4 py-6">
        {translating && (
          <div className="flex items-center justify-center text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="ml-2">Translating…</span>
          </div>
        )}

        {!translating && mode === "flashcards" && (
          <div className="flex flex-col items-center">
            <button
              onClick={() => setFlipped((f) => !f)}
              className="flip-card w-full h-72 text-left"
              aria-label="Flip card"
            >
              <div className={`flip-card-inner ${flipped ? "is-flipped" : ""}`}>
                <div className="flip-card-face rounded-3xl bg-white shadow-md border border-gray-100 p-6 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">{language}</span>
                  <p className="mt-3 text-3xl font-bold text-gray-900">{current.swahili}</p>
                  <span className="mt-6 text-xs text-gray-400">Tap to flip</span>
                </div>
                <div className="flip-card-face flip-card-back rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md p-6 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">English</span>
                  <p className="mt-3 text-3xl font-bold">{current.english}</p>
                  <span className="mt-6 text-xs opacity-70">Tap to flip back</span>
                </div>
              </div>
            </button>
            <button
              onClick={() => {
                setFlipped(false);
                setCardIdx((i) => (i + 1) % pairs.length);
              }}
              className="mt-4 w-full h-12 rounded-full bg-emerald-500 text-white font-semibold shadow-md hover:bg-emerald-600"
            >
              Next card
            </button>
          </div>
        )}

        {!translating && mode === "listening" && (
          <div className="flex flex-col items-center">
            <button
              onClick={() => {
                // best-effort TTS — may not work in all browsers
                try {
                  const u = new SpeechSynthesisUtterance(current.swahili);
                  window.speechSynthesis.speak(u);
                } catch {}
              }}
              className="w-20 h-20 rounded-full bg-emerald-500 text-white shadow-lg flex items-center justify-center hover:bg-emerald-600"
            >
              <Volume2 className="w-8 h-8" />
            </button>
            <p className="mt-3 text-xs text-gray-500">Tap to hear the phrase</p>

            <div className="mt-5 w-full flex items-center justify-center gap-1 h-12">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1 bg-emerald-400 rounded-full"
                  style={{ height: `${8 + Math.abs(Math.sin(i * 0.5)) * 30}px` }}
                />
              ))}
            </div>

            <p className="mt-6 text-sm font-semibold text-gray-900">What does this mean?</p>
            <div className="mt-3 w-full grid grid-cols-1 gap-2">
              {pairs.map((p, i) => {
                const sel = selectedAnswer === i;
                const correct = p.english === current.english;
                let cls = "border-gray-200 bg-white hover:border-emerald-300";
                if (sel) {
                  cls = correct
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-rose-500 bg-rose-50 text-rose-700";
                }
                return (
                  <button
                    key={p.english}
                    onClick={() => setSelectedAnswer(i)}
                    className={`w-full p-3 rounded-2xl border-2 text-sm font-medium transition flex items-center justify-between ${cls}`}
                  >
                    {p.english}
                    {sel && correct && <Check className="w-4 h-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!translating && mode === "matching" && (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              Match the {language} words on the left with the English on the right.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-3">
                {pairs.map((p) => (
                  <div
                    key={p.swahili}
                    className="p-3 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-900 shadow-sm text-center"
                  >
                    {p.swahili}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {pairs.slice().reverse().map((p) => (
                  <div
                    key={p.english}
                    className="p-3 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-900 shadow-sm text-center"
                  >
                    {p.english}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 p-3 rounded-xl bg-indigo-50 text-indigo-700 text-xs text-center">
              Tap-to-connect matching is coming in a future phase.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
