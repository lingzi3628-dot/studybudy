"use client";

import { useEffect, useState } from "react";
import {
  Flame,
  Play,
  UploadCloud,
  Bot,
  LineChart,
  Layers,
  ChevronRight,
  Clock,
  Sparkles,
  Loader2,
  FileText,
  AlertCircle,
  BookOpen,
  Coins,
  Receipt,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Progress as ProgressData, type StudySetSummary } from "../api";
import { useI18n } from "@/lib/useI18n";

const quickActions = [
  { label: "Upload Notes", icon: UploadCloud, color: "bg-indigo-50 text-indigo-600", screen: null },
  { label: "Ask AI Tutor", icon: Bot, color: "bg-violet-50 text-violet-600", screen: "tutor" as const },
  { label: "Draw Graph", icon: LineChart, color: "bg-emerald-50 text-emerald-600", screen: null },
  { label: "Generate Flashcards", icon: Layers, color: "bg-amber-50 text-amber-600", screen: null },
  // Phase 46 — Python code runner
  { label: "Python Runner", icon: Sparkles, color: "bg-gray-50 text-emerald-600", screen: "codeRunner" as const },
  // Phase 46 — Lab simulator (PhET embeds)
  { label: "Lab Simulator", icon: BookOpen, color: "bg-rose-50 text-rose-600", screen: "lab" as const },
  // Phase 46 — Scientific calculator
  { label: "Calculator", icon: LineChart, color: "bg-violet-50 text-violet-700", screen: "calculator" as const },
];

const subjectGradients: Record<string, string> = {
  Mathematics: "from-indigo-500 to-violet-500",
  Science: "from-emerald-500 to-teal-500",
  English: "from-sky-500 to-cyan-500",
  Kiswahili: "from-amber-500 to-orange-500",
  Chinese: "from-rose-500 to-pink-500",
  default: "from-indigo-500 to-violet-500",
};

// Phase 47 — the 8 buddies shown in the "Choose your buddy" grid on Home.
// Each card taps to open AI Tutor with that buddy pre-selected.
const BUDDY_GRID = [
  { id: "study",   emoji: "📚", name: "StudyBuddy",    tagline: "K-12 tutor (Kenya CBC / KCSE)",  accent: "from-indigo-500 to-violet-500" },
  { id: "dev",     emoji: "💻", name: "DevBuddy",      tagline: "Code, debug, refactor, ship",    accent: "from-emerald-500 to-teal-500" },
  { id: "data",    emoji: "📊", name: "DataBuddy",     tagline: "Notebooks, pandas, SQL, EDA",     accent: "from-sky-500 to-cyan-500" },
  { id: "ml",      emoji: "🧠", name: "MLBuddy",       tagline: "Train, visualize, evaluate models", accent: "from-violet-500 to-fuchsia-500" },
  { id: "web",     emoji: "🌐", name: "WebBuddy",      tagline: "Prompt → website → deploy",      accent: "from-amber-500 to-orange-500" },
  { id: "backend", emoji: "⚙️", name: "BackendBuddy", tagline: "APIs, SQL, databases, servers",  accent: "from-rose-500 to-pink-500" },
  { id: "server",  emoji: "🖥️", name: "ServerBuddy",  tagline: "Linux, Docker, Nginx, deploy",   accent: "from-gray-700 to-gray-900" },
  { id: "tvet",    emoji: "🔧", name: "TVETBuddy",    tagline: "Technical & vocational training", accent: "from-amber-600 to-red-600" },
] as const;

// popular topics carousel
const popularTopics: { name: string; subject: string; emoji: string }[] = [
  { name: "Quadratic Equations", subject: "Mathematics", emoji: "📈" },
  { name: "Photosynthesis", subject: "Science", emoji: "🌱" },
  { name: "Swahili Greetings", subject: "Kiswahili", emoji: "🗣️" },
  { name: "World War II", subject: "Social Studies", emoji: "🌍" },
  { name: "Python Basics", subject: "Coding", emoji: "🐍" },
  { name: "Linear Functions", subject: "Mathematics", emoji: "📐" },
  { name: "Human Heart", subject: "Science", emoji: "❤️" },
  { name: "Chinese Greetings", subject: "Chinese", emoji: "你好" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function Home() {
  const { setScreen, openCreate, setActiveStudySetId, setActiveTopicId } = useApp();
  const { t } = useI18n();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 45: recommended cards (due cards biased toward weak topics)
  const [recommendedCards, setRecommendedCards] = useState<Array<{ id: string; front?: string | null; question?: string | null; subject?: string | null; topic?: string | null; cardType?: string }>>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Phase 45: fire getRecommended() in parallel with the existing two calls.
        // It returns due cards + weak topics in one trip — saves a round-trip vs
        // the old "weakAreas only" approach.
        const [p, s, rec] = await Promise.all([
          api.getProgress(),
          api.listStudySets(),
          api.getRecommended().catch(() => ({ cards: [], weakTopics: [] })),
        ]);
        if (!mounted) return;
        setProgress(p);
        setSets(s.sets);
        setRecommendedCards(rec.cards ?? []);
      } catch (e) {
        console.warn("home fetch failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const name = progress?.user.name?.split(" ")[0] ?? progress?.user.email?.split("@")[0] ?? "there";
  const streak = progress?.streak ?? 0;
  const dueCount = progress?.dueCount ?? 0;
  const weakAreas = progress?.weakAreas ?? [];

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        {/* greeting — full width on desktop */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{t(`dash.greeting.${greeting()}`)}, {name}! 👋</p>
            <h1 className="text-2xl font-bold text-gray-900">{t("dash.tapToStart")}</h1>
          </div>
          <div className="hidden md:flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full">
            <Flame className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold">{streak}</span>
            <span className="text-xs text-amber-600/80">{t("dash.streak")}</span>
          </div>
        </div>

        {loading ? (
          <div className="mt-10 flex items-center justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> <span className="ml-2 text-sm">{t("common.loading")}</span>
          </div>
        ) : (
          <>
            {/* Phase 47 — Choose your buddy grid (8 specialized AI personas) */}
            <section className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Choose your buddy</h3>
                <button
                  onClick={() => setScreen("projects")}
                  className="text-xs text-indigo-600 font-medium flex items-center"
                >
                  My Projects <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {BUDDY_GRID.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      // Persist the buddy choice + open AI Tutor
                      try {
                        localStorage.setItem("studybuddy_active_buddy", b.id);
                      } catch { /* ignore */ }
                      setScreen("tutor");
                    }}
                    className="text-left rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition p-3 flex flex-col gap-1.5"
                  >
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${b.accent} text-white flex items-center justify-center text-lg`}>
                      {b.emoji}
                    </div>
                    <p className="text-xs font-bold text-gray-900">{b.name}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-2">{b.tagline}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* Bento grid on desktop */}
            <div className="mt-5 md:grid md:grid-cols-3 md:gap-4 space-y-4 md:space-y-0">
              {/* Continue Learning — spans 2 cols on desktop */}
              <section className="md:col-span-2">
                <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-5 text-white shadow-md h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{t("dash.continueLearning")}</span>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Smart Review</span>
                  </div>
                  <h2 className="text-lg font-bold mt-2">{dueCount > 0 ? `${dueCount} cards due now` : "No reviews due today 🎉"}</h2>
                  <p className="text-sm opacity-90 mt-1">
                    {dueCount > 0
                      ? "Tap below to start your spaced-repetition review session."
                      : "Create a new study set or come back tomorrow for fresh reviews."}
                  </p>
                  <button
                    onClick={() => setScreen("flashcards")}
                    disabled={dueCount === 0}
                    className="mt-4 inline-flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-sm px-4 py-2 rounded-full shadow hover:bg-indigo-50 transition disabled:opacity-40"
                  >
                    <Play className="w-4 h-4" /> {dueCount > 0 ? t("dash.startReview") : t("study.allCaughtUp")}
                  </button>
                </div>
              </section>

              {/* Daily Challenge */}
              <section>
                <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm h-full">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">{t("dash.todaysChallenge")}</p>
                      <h3 className="text-sm font-semibold text-gray-900 mt-0.5">
                        5 questions on Photosynthesis
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> ~5 min · Earn +20 XP
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setScreen("quiz")}
                    className="mt-3 w-full h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition"
                  >
                    Start Challenge
                  </button>
                </div>
              </section>
            </div>

            {/* Quick actions */}
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("dash.quickActions")}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {quickActions.map((q) => {
                  const Icon = q.icon;
                  return (
                    <button
                      key={q.label}
                      onClick={() => q.screen ? setScreen(q.screen) : openCreate()}
                      className="flex flex-col items-start gap-2 p-3.5 rounded-2xl bg-white border border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition text-left"
                    >
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${q.color}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-medium text-gray-900">{q.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Billing & Usage entry */}
            <section className="mt-4">
              <button
                onClick={() => setScreen("billing")}
                className="w-full rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 p-3.5 flex items-center gap-3 hover:border-indigo-300 transition text-left"
              >
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                    Billing & Usage
                  </p>
                  <p className="text-[11px] text-gray-500">View token balance, usage history, and payment transactions</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            </section>

            {/* Saved study sets */}
            {sets.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">{t("dash.yourStudySets")}</h3>
                  <button className="text-xs text-indigo-600 font-medium flex items-center">
                    {t("dash.seeAll")} <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto no-scrollbar md:grid md:grid-cols-3 md:gap-4 md:overflow-visible">
                  {sets.slice(0, 6).map((s) => (
                    <div
                      key={s.id}
                      className="flex-shrink-0 w-44 md:w-auto text-left group relative"
                    >
                      <button
                        onClick={() => {
                          setActiveStudySetId(s.id);
                          setScreen("quiz");
                        }}
                        className="block w-full"
                      >
                        <div className={`h-24 rounded-2xl bg-gradient-to-br ${subjectGradients[s.subject ?? "default"] ?? subjectGradients.default} p-3 flex items-end text-white shadow-md group-hover:scale-[1.02] transition`}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-gray-900 truncate">{s.title}</p>
                        <p className="text-xs text-gray-500">
                          {s.subject ?? "General"} · {s.cardCount} cards
                        </p>
                      </button>
                      {/* Phase 45: Export buttons — Anki + PDF */}
                      <div className="mt-2 flex gap-1.5">
                        <a
                          href={`/api/study-sets/${s.id}/export/anki`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 text-center text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 py-1 rounded-md transition"
                          title="Download as Anki-importable text file"
                        >
                          ⤓ Anki
                        </a>
                        <a
                          href={`/api/study-sets/${s.id}/export/pdf`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 text-center text-[10px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 py-1 rounded-md transition"
                          title="Download as printable PDF"
                        >
                          ⤓ PDF
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Weak areas / recommended — Phase 45 upgrade:
                • Per-topic due-card count badge
                • "Review now" CTA that pre-loads weak-topic cards into the queue
                • Second row: individual due cards (biased toward weak topics) */}
            {weakAreas.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-500" /> {t("dash.recommended")}
                  </h3>
                </div>
                <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto no-scrollbar md:grid md:grid-cols-3 md:gap-4 md:overflow-visible">
                  {weakAreas.map((w) => {
                    const dueForTopic = recommendedCards.filter(
                      (c) => c.subject === w.subject && c.topic === w.topic
                    ).length;
                    return (
                      <div
                        key={`${w.subject}-${w.topic}`}
                        className="flex-shrink-0 w-44 md:w-auto text-left"
                      >
                        <button
                          onClick={async () => {
                            try {
                              const r = await api.upsertTopic({ name: w.topic, subject: w.subject });
                              setActiveTopicId(r.topic.id);
                              setScreen("study");
                            } catch {
                              openCreate();
                            }
                          }}
                          className="block w-full"
                        >
                          <div className="h-28 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 p-3 flex flex-col justify-between text-white shadow-md hover:shadow-lg transition">
                            <div className="flex items-center justify-between">
                              <span className="text-xs opacity-80">Needs practice</span>
                              {dueForTopic > 0 && (
                                <span className="text-[10px] bg-white/30 px-1.5 py-0.5 rounded-full">
                                  {dueForTopic} due
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold line-clamp-1">{w.topic}</p>
                              <p className="text-xs opacity-80">{w.subject} · {Math.round(w.mastery * 100)}%</p>
                            </div>
                          </div>
                        </button>
                        {dueForTopic > 0 && (
                          <button
                            onClick={async () => {
                              try {
                                // Phase 45: fetch the user's due cards biased to THIS weak topic
                                // and route straight into the flashcards review screen.
                                const { cards } = await api.getReviewQueue({
                                  bias: "weak",
                                  subject: w.subject,
                                  topic: w.topic,
                                  limit: 10,
                                });
                                if (cards.length > 0 && cards[0]?.setId) {
                                  setActiveStudySetId(cards[0].setId);
                                  setScreen("flashcards");
                                } else {
                                  // No cards due for this topic — fall back to opening the study room
                                  const r = await api.upsertTopic({ name: w.topic, subject: w.subject });
                                  setActiveTopicId(r.topic.id);
                                  setScreen("study");
                                }
                              } catch {
                                openCreate();
                              }
                            }}
                            className="mt-2 w-full text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 py-1.5 rounded-lg transition flex items-center justify-center gap-1"
                          >
                            <Sparkles className="w-3 h-3" /> Review {dueForTopic} {dueForTopic === 1 ? "card" : "cards"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Second row: individual due cards (biased toward weak topics) */}
                {recommendedCards.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Cards due now — weak topics shown first
                    </p>
                    <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2.5 overflow-x-auto no-scrollbar">
                      {recommendedCards.slice(0, 12).map((c) => {
                        const preview = (c.question || c.front || "Review card").slice(0, 70);
                        const subject = c.subject ?? "General";
                        const stripeColor = (subjectGradients as any)[subject] ?? subjectGradients.default;
                        return (
                          <button
                            key={c.id}
                            onClick={async () => {
                              // The Card's setId is not in our type slice — but if the
                              // user has due cards, they have a study set, so we just
                              // route to the flashcards screen which will load the queue.
                              setScreen("flashcards");
                            }}
                            className="flex-shrink-0 w-56 h-20 rounded-xl bg-white border border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition overflow-hidden flex"
                          >
                            <div className={`w-1.5 bg-gradient-to-b ${stripeColor} flex-shrink-0`} />
                            <div className="flex-1 p-2.5 min-w-0">
                              <p className="text-[10px] text-gray-400 mb-0.5">
                                {subject}{c.topic ? ` · ${c.topic}` : ""}
                              </p>
                              <p className="text-xs font-medium text-gray-800 line-clamp-2">{preview}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* No weak areas but cards are due — keep the review loop alive */}
            {weakAreas.length === 0 && recommendedCards.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-500" /> {t("dash.staySharp")}
                  </h3>
                </div>
                <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2.5 overflow-x-auto no-scrollbar">
                  {recommendedCards.slice(0, 12).map((c) => {
                    const preview = (c.question || c.front || "Review card").slice(0, 70);
                    const subject = c.subject ?? "General";
                    const stripeColor = (subjectGradients as any)[subject] ?? subjectGradients.default;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setScreen("flashcards")}
                        className="flex-shrink-0 w-56 h-20 rounded-xl bg-white border border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition overflow-hidden flex"
                      >
                        <div className={`w-1.5 bg-gradient-to-b ${stripeColor} flex-shrink-0`} />
                        <div className="flex-1 p-2.5 min-w-0">
                          <p className="text-[10px] text-gray-400 mb-0.5">
                            {subject}{c.topic ? ` · ${c.topic}` : ""}
                          </p>
                          <p className="text-xs font-medium text-gray-800 line-clamp-2">{preview}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Browse Topics carousel */}
            <section className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600" /> {t("dash.browseTopics")}
                </h3>
                <button
                  onClick={() => setScreen("search")}
                  className="text-xs text-indigo-600 font-medium flex items-center"
                >
                  Search <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="-mx-4 px-4 md:mx-0 md:px-0 grid grid-cols-2 md:grid-cols-4 gap-3">
                {popularTopics.map((t) => (
                  <button
                    key={`${t.subject}-${t.name}`}
                    onClick={async () => {
                      try {
                        const r = await api.upsertTopic({ name: t.name, subject: t.subject });
                        setActiveTopicId(r.topic.id);
                        setScreen("study");
                      } catch (e) {
                        console.warn("Failed to open topic", e);
                      }
                    }}
                    className="text-left rounded-2xl bg-white border border-gray-200 p-3 shadow-sm hover:border-indigo-300 hover:shadow-md transition"
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <p className="mt-2 text-xs font-semibold text-gray-900 line-clamp-2">{t.name}</p>
                    <p className="text-[11px] text-gray-500">{t.subject}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
