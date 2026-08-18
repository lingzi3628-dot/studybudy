"use client";

import { useState } from "react";
import {
  Search as SearchIcon,
  X,
  Clock,
  BookOpen,
  ListChecks,
  Layers,
  BookText,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useApp } from "../store";
import { api, type SearchResult } from "../api";

const filters = ["All", "Math", "English", "Kiswahili", "Chinese", "Science"];
const recent = ["photosynthesis", "quadratic equations", "swahili greetings", "world war 2"];

/** Heuristic subject detection from a search query — used when opening Study Room from a search. */
function autoDetectSubject(q: string): string {
  const s = q.toLowerCase();
  if (/algebra|equation|quadratic|geometry|calculus|trigonometry|slope|graph|polynomial|derivative|integral|theorem|math/.test(s)) return "Mathematics";
  if (/photosynth|cell|atom|biology|chemistry|physics|organelle|plant|animal|ecosystem|science/.test(s)) return "Science";
  if (/swahili|habari|asante|tanzania|kenya/.test(s)) return "Kiswahili";
  if (/spanish|french|arabic|chinese|german|hola|bonjour|你好|مرحبا/.test(s)) return "Language";
  if (/world war|history|revolution|civilization|empire/.test(s)) return "Social Studies";
  if (/python|javascript|coding|programming|algorithm|function|variable/.test(s)) return "Coding";
  if (/business|finance|market|entrepreneur|economic/.test(s)) return "Business";
  return "General";
}

export function Search() {
  const { setScreen, setActiveTopicId } = useApp();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.search(trimmed);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 md:pb-8">
        {/* search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSearch(query);
          }}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 h-11 shadow-sm"
        >
          <SearchIcon className="w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics, questions, or skills..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSubmitted(null);
                setResult(null);
              }}
              aria-label="Clear"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </form>

        {/* filter chips */}
        <div className="mt-3 -mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                activeFilter === f ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* recent searches when no query and no result */}
        {!submitted && !result && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent searches</h3>
            <div className="space-y-1.5">
              {recent.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setQuery(r);
                    doSearch(r);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 text-left"
                >
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{r}</span>
                </button>
              ))}
            </div>
            <p className="mt-6 text-xs text-gray-400">
              Try a query like <button onClick={() => { setQuery("photosynthesis"); doSearch("photosynthesis"); }} className="text-indigo-600 underline">photosynthesis</button> or <button onClick={() => { setQuery("What is a quadratic equation?"); doSearch("What is a quadratic equation?"); }} className="text-indigo-600 underline">What is a quadratic equation?</button>
            </p>
          </section>
        )}

        {/* loading */}
        {loading && (
          <div className="mt-10 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="mt-3 text-sm">Asking the AI tutor…</p>
          </div>
        )}

        {/* error */}
        {error && !loading && (
          <div className="mt-6 p-4 rounded-2xl border-2 border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Search failed</p>
              <p className="text-xs opacity-90 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* results */}
        {result && !loading && (
          <div className="mt-5 space-y-4">
            {/* summary card */}
            <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">AI Summary</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">{activeFilter === "All" ? "All" : activeFilter}</span>
              </div>
              <h2 className="text-base font-bold text-gray-900 capitalize">{result.query}</h2>
              <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{result.summary}</p>

              {result.keyPoints.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Key points</p>
                  <ul className="space-y-1">
                    {result.keyPoints.map((kp, i) => (
                      <li key={i} className="text-sm text-gray-600 flex gap-2">
                        <span className="text-indigo-500 font-bold flex-shrink-0">•</span>
                        <span>{kp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.relatedTopics.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Related topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.relatedTopics.map((t) => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    // Open Study Room for this topic — upsert topic then navigate
                    try {
                      const subject = autoDetectSubject(result.query);
                      const r = await api.upsertTopic({ name: result.query, subject });
                      setActiveTopicId(r.topic.id);
                      setScreen("study");
                    } catch (e: any) {
                      setError(e?.message ?? "Could not open Study Room");
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold shadow-sm"
                >
                  <BookOpen className="w-4 h-4" /> Open Study Room
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setScreen("quiz")}
                    className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  >
                    <ListChecks className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">Quiz</span>
                  </button>
                  <button
                    onClick={() => setScreen("flashcards")}
                    className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">Cards</span>
                  </button>
                </div>
              </div>
            </div>

            {/* sample question */}
            {result.sampleQuestion && (
              <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-2">Sample question</p>
                <p className="text-sm font-medium text-gray-900">{result.sampleQuestion.question}</p>
                <ul className="mt-2 space-y-1">
                  {result.sampleQuestion.options.map((opt, i) => (
                    <li
                      key={i}
                      className={`text-sm p-2 rounded-lg flex items-center gap-2 ${
                        i === result.sampleQuestion!.correct_index
                          ? "bg-emerald-50 text-emerald-700 font-medium"
                          : "text-gray-600"
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[10px] font-bold">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500 italic">{result.sampleQuestion.explanation}</p>
              </div>
            )}

            {/* follow up */}
            <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-200 shadow-sm hover:border-indigo-300">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <BookText className="w-4 h-4 text-indigo-600" />
                Ask follow-up question
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
