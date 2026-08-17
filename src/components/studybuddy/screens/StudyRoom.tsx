"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Heart,
  Loader2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Target,
  Lightbulb,
  Sigma,
  Pencil,
  Layers,
  ListChecks,
  Bot,
  Send,
  Plus,
  Sparkles,
  Check,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Card } from "../api";

type Lesson = {
  introduction?: string;
  keyConcepts?: { title: string; explanation: string }[];
  examples?: { title: string; problem: string; steps: string[]; answer: string }[];
  formulas?: string[];
  summary?: string;
};

type TopicDetail = Awaited<ReturnType<typeof api.getTopic>>;

type PracticeTab = "flashcards" | "quiz" | "solver";
type ChatMsg = { role: "user" | "assistant"; content: string };

const COLLAPSE_KEYS = ["intro", "concepts", "examples", "formulas", "summary"] as const;
type CollapseKey = (typeof COLLAPSE_KEYS)[number];

export function StudyRoom() {
  const { activeTopicId, setScreen, setActiveTopicId } = useApp();

  const [topicData, setTopicData] = useState<TopicDetail | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<CollapseKey>>(new Set(["concepts", "examples", "formulas"]));
  const [favorite, setFavorite] = useState(false);

  const [practiceTab, setPracticeTab] = useState<PracticeTab>("flashcards");
  const [practiceCards, setPracticeCards] = useState<Card[]>([]);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [genStatus, setGenStatus] = useState<string | null>(null);

  // flashcard practice state
  const [fcIdx, setFcIdx] = useState(0);
  const [fcFlipped, setFcFlipped] = useState(false);
  const [fcSubmitting, setFcSubmitting] = useState(false);

  // quiz state
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizDone, setQuizDone] = useState(false);

  // solver state
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState<Awaited<ReturnType<typeof api.solveStepByStep>> | null>(null);
  const [solving, setSolving] = useState(false);
  const [solverError, setSolverError] = useState<string | null>(null);

  // tutor chat state
  const [tutorOpen, setTutorOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ===== Load topic + lesson on mount =====
  useEffect(() => {
    if (!activeTopicId) {
      setScreen("home");
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const td = await api.getTopic(activeTopicId);
        if (!mounted) return;
        setTopicData(td);
      } catch (e: any) {
        if (!mounted) return;
        setLessonError(e?.message ?? "Failed to load topic");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTopicId, setScreen]);

  // Load lesson
  useEffect(() => {
    if (!activeTopicId) return;
    let mounted = true;
    (async () => {
      setLessonLoading(true);
      setLessonError(null);
      try {
        const r = await api.getTopicLesson(activeTopicId, { level: "beginner" });
        if (!mounted) return;
        setLesson(r.lesson);
      } catch (e: any) {
        if (!mounted) return;
        setLessonError(e?.message ?? "Failed to load lesson");
      } finally {
        if (mounted) setLessonLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTopicId]);

  // Load practice cards
  const loadPractice = async () => {
    if (!activeTopicId) return;
    setPracticeLoading(true);
    setPracticeError(null);
    try {
      const r = await api.getTopicPractice(activeTopicId, 20);
      setPracticeCards(r.cards);
      setFcIdx(0);
      setFcFlipped(false);
      setQuizIdx(0);
      setQuizSelected(null);
      setQuizCorrect(0);
      setQuizDone(false);
    } catch (e: any) {
      setPracticeError(e?.message ?? "Failed to load practice");
    } finally {
      setPracticeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTopicId) loadPractice();
  }, [activeTopicId]);

  // chat auto-scroll
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, chatBusy]);

  if (!activeTopicId) return null;

  const topic = topicData?.topic;
  const masteryPct = topicData ? Math.round(topicData.mastery.level * 100) : 0;
  const isMath = topic ? /math|algebra|geometry|calculus|trigonometry|statistics|graph|equation/i.test(topic.subject + " " + topic.name) : false;
  const isLanguage = topic ? /language|english|kiswahili|swahili|chinese|french|spanish|arabic|greeting|vocabulary/i.test(topic.subject + " " + topic.name) : false;

  const flashcards = practiceCards.filter((c) => c.cardType === "flashcard");
  const mcqs = practiceCards.filter((c) => c.cardType === "mcq");

  // ===== Handlers =====
  const toggleCollapse = (k: CollapseKey) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const regenerateLesson = async () => {
    if (!activeTopicId) return;
    setLessonLoading(true);
    setLessonError(null);
    try {
      const r = await api.getTopicLesson(activeTopicId, { level: "beginner", regenerate: true });
      setLesson(r.lesson);
    } catch (e: any) {
      setLessonError(e?.message ?? "Failed to regenerate");
    } finally {
      setLessonLoading(false);
    }
  };

  // Flashcard submit
  const submitFlashcard = async (quality: 0 | 5) => {
    if (!flashcards[fcIdx] || fcSubmitting) return;
    setFcSubmitting(true);
    try {
      await api.submitReview({ cardId: flashcards[fcIdx].id, quality });
      if (fcIdx + 1 < flashcards.length) {
        setFcIdx((i) => i + 1);
        setFcFlipped(false);
      } else {
        // restart loop for demo
        setFcIdx(0);
        setFcFlipped(false);
      }
    } catch (e: any) {
      setPracticeError(e?.message ?? "Submit failed");
    } finally {
      setFcSubmitting(false);
    }
  };

  // Quiz select
  const handleQuizSelect = (i: number) => {
    if (quizSelected !== null || quizSubmitting) return;
    setQuizSelected(i);
    const correct = i === mcqs[quizIdx].correctIndex;
    if (correct) setQuizCorrect((c) => c + 1);
    setQuizSubmitting(true);
    api
      .recordAttempt({
        cardId: mcqs[quizIdx].id,
        selectedIndex: i,
        isCorrect: correct,
      })
      .catch(() => {})
      .finally(() => setQuizSubmitting(false));
  };

  const nextQuiz = () => {
    if (quizIdx + 1 < mcqs.length) {
      setQuizIdx((i) => i + 1);
      setQuizSelected(null);
    } else {
      setQuizDone(true);
    }
  };

  // Solver
  const solve = async () => {
    if (!problem.trim() || solving) return;
    setSolving(true);
    setSolverError(null);
    setSolution(null);
    try {
      const r = await api.solveStepByStep(activeTopicId!, problem);
      setSolution(r);
    } catch (e: any) {
      setSolverError(e?.message ?? "Solver failed");
    } finally {
      setSolving(false);
    }
  };

  // Tutor chat
  const sendChat = async (text?: string) => {
    const q = (text ?? chatInput).trim();
    if (!q || chatBusy) return;
    setChatInput("");
    setChatBusy(true);
    setChatError(null);
    const next: ChatMsg[] = [...chatMessages, { role: "user", content: q }];
    setChatMessages(next);
    try {
      const r = await api.askTopicTutor(activeTopicId!, {
        message: q,
        chatHistory: next.slice(-10),
      });
      setChatMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e: any) {
      setChatError(e?.message ?? "Tutor failed");
    } finally {
      setChatBusy(false);
    }
  };

  // Generate practice cards on the fly when none exist
  const generatePracticeCards = async () => {
    if (!activeTopicId || !topic || generatingCards) return;
    setGeneratingCards(true);
    setGenStatus(null);
    try {
      // Step 1: Generate via AI (not saved yet)
      setGenStatus("Generating cards with AI…");
      const gen = await api.generateCards({
        text: `Topic: ${topic.name}. Subject: ${topic.subject}. Generate study cards covering the key concepts of ${topic.name}.`,
        numFlashcards: 5,
        numMCQs: 5,
        subject: topic.subject,
        topic: topic.name,
      });
      // Step 2: Save as a study set linked to this topic
      setGenStatus("Saving to database…");
      const cardsToSave = [
        ...gen.flashcards.map((c) => ({
          cardType: "flashcard" as const,
          front: c.front,
          back: c.back,
          question: null,
          options: null,
          correctIndex: null,
          explanation: null,
        })),
        ...gen.mcqs.map((c) => ({
          cardType: "mcq" as const,
          front: null,
          back: null,
          question: c.question,
          options: c.options,
          correctIndex: c.correct_index,
          explanation: c.explanation,
        })),
      ];
      // We need to pass topicId — but the /api/study-sets POST doesn't accept it yet.
      // For we'll save via /api/study-sets and then patch each card's topicId via the practice endpoint.
      const res = await api.createStudySet({
        title: `${topic.name} practice`,
        sourceType: "text",
        sourceText: `Practice set for ${topic.name}`,
        subject: topic.subject,
        topic: topic.name,
        generate: false,
        cards: cardsToSave,
      });
      // Update each card's topicId via a follow-up — for now, the practice endpoint
      // will find them via subject+topic string match, which works.
      void res;
      setGenStatus(`Generated ${cardsToSave.length} cards!`);
      setTimeout(() => setGenStatus(null), 3000);
      await loadPractice();
    } catch (e: any) {
      setGenStatus(`Failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setGeneratingCards(false);
    }
  };

  // ===== Render =====
  if (!topicData) {
    return (
      <div className="min-h-screen max-w-3xl mx-auto flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2 text-sm">Loading study room…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-6xl mx-auto">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => {
              setActiveTopicId(null);
              setScreen("home");
            }}
            aria-label="Back"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0 px-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 truncate">{topic?.subject}</p>
            <h1 className="text-base font-bold text-gray-900 truncate">{topic?.name}</h1>
          </div>
          <button
            onClick={() => setFavorite((f) => !f)}
            aria-label="Favorite"
            className={`w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center ${favorite ? "text-rose-500" : "text-gray-400"}`}
          >
            <Heart className={`w-5 h-5 ${favorite ? "fill-rose-500" : ""}`} />
          </button>
        </div>
        {/* mastery bar */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between text-[11px] mb-0.5">
            <span className="text-gray-500">
              {masteryPct >= 80 ? "Mastered" : masteryPct >= 60 ? "Getting there" : masteryPct > 0 ? "Needs work" : "Just started"} · {topicData.mastery.totalAttempts} attempts
            </span>
            <span className="font-semibold text-gray-900">{masteryPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                masteryPct >= 80 ? "bg-emerald-500" : masteryPct >= 60 ? "bg-amber-500" : "bg-indigo-600"
              }`}
              style={{ width: `${masteryPct}%` }}
            />
          </div>
        </div>
      </header>

      <div className="px-4 py-4 md:grid md:grid-cols-2 md:gap-6 md:pb-32">
        {/* LEFT COLUMN — Lesson + Interactive tools */}
        <div className="space-y-4">
          {/* Lesson */}
          <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-600" /> Lesson
              </h2>
              <button
                onClick={regenerateLesson}
                disabled={lessonLoading}
                className="text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-full flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${lessonLoading ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </div>

            {lessonLoading && !lesson && (
              <div className="py-8 flex flex-col items-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="mt-2 text-xs">AI is writing the lesson…</p>
              </div>
            )}

            {lessonError && !lessonLoading && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{lessonError}</span>
              </div>
            )}

            {lesson && !lessonLoading && (
              <div className="space-y-2">
                {/* Intro */}
                <LessonSection
                  open={!collapsed.has("intro")}
                  onToggle={() => toggleCollapse("intro")}
                  icon={Sparkles}
                  color="bg-indigo-50 text-indigo-600"
                  title="Introduction"
                >
                  <p className="text-sm text-gray-700 leading-relaxed">{lesson.introduction ?? "—"}</p>
                </LessonSection>

                {/* Key Concepts */}
                {lesson.keyConcepts && lesson.keyConcepts.length > 0 && (
                  <LessonSection
                    open={!collapsed.has("concepts")}
                    onToggle={() => toggleCollapse("concepts")}
                    icon={Target}
                    color="bg-emerald-50 text-emerald-600"
                    title={`Key Concepts (${lesson.keyConcepts.length})`}
                  >
                    <div className="space-y-2">
                      {lesson.keyConcepts.map((c, i) => (
                        <div key={i} className="rounded-xl bg-gray-50 p-2.5">
                          <p className="text-xs font-semibold text-gray-900">{c.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{c.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </LessonSection>
                )}

                {/* Formulas (math) */}
                {isMath && lesson.formulas && lesson.formulas.length > 0 && (
                  <LessonSection
                    open={!collapsed.has("formulas")}
                    onToggle={() => toggleCollapse("formulas")}
                    icon={Sigma}
                    color="bg-violet-50 text-violet-600"
                    title="Key Formulas"
                  >
                    <div className="space-y-1.5">
                      {lesson.formulas.map((f, i) => (
                        <div key={i} className="p-2 rounded-lg bg-violet-50 text-violet-800 text-sm font-mono text-center">
                          {f}
                        </div>
                      ))}
                    </div>
                  </LessonSection>
                )}

                {/* Examples */}
                {lesson.examples && lesson.examples.length > 0 && (
                  <LessonSection
                    open={!collapsed.has("examples")}
                    onToggle={() => toggleCollapse("examples")}
                    icon={Lightbulb}
                    color="bg-amber-50 text-amber-600"
                    title={`Worked Examples (${lesson.examples.length})`}
                  >
                    <div className="space-y-2">
                      {lesson.examples.map((ex, i) => (
                        <div key={i} className="rounded-xl bg-gray-50 p-2.5">
                          <p className="text-xs font-semibold text-gray-900">{ex.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{ex.problem}</p>
                          <ol className="mt-1.5 space-y-1">
                            {ex.steps.map((s, j) => (
                              <li key={j} className="text-xs text-gray-700 flex gap-2">
                                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold flex-shrink-0">
                                  {j + 1}
                                </span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ol>
                          {ex.answer && (
                            <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                              Answer: {ex.answer}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </LessonSection>
                )}

                {/* Summary */}
                <LessonSection
                  open={!collapsed.has("summary")}
                  onToggle={() => toggleCollapse("summary")}
                  icon={Check}
                  color="bg-emerald-50 text-emerald-600"
                  title="Summary"
                >
                  <p className="text-sm text-gray-700 leading-relaxed">{lesson.summary ?? "—"}</p>
                </LessonSection>
              </div>
            )}
          </section>

          {/* Interactive tools (math only — graph inline) */}
          {isMath && (
            <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                <Pencil className="w-4 h-4 text-sky-600" /> Interactive Graph
              </h2>
              <p className="text-xs text-gray-500 mb-2">
                Tap below to draw an equation related to this topic. Opens the full Graph Explorer.
              </p>
              <button
                onClick={() => setScreen("graph")}
                className="w-full h-10 rounded-full bg-sky-50 text-sky-700 font-semibold text-sm hover:bg-sky-100 flex items-center justify-center gap-1.5"
              >
                <Pencil className="w-4 h-4" /> Open Graph Explorer
              </button>
            </section>
          )}

          {/* Related topics */}
          {topicData.relatedTopics.length > 0 && (
            <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                <ChevronRight className="w-4 h-4 text-indigo-600" /> Related Topics
              </h2>
              <div className="space-y-1.5">
                {topicData.relatedTopics.map((t) => (
                  <button
                    key={t.id}
                    onClick={async () => {
                      setActiveTopicId(t.id);
                      setScreen("study");
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-indigo-50/40 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-[11px] text-gray-500">{t.subject}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN — Practice + Tutor */}
        <div className="mt-6 md:mt-0 space-y-4">
          {/* Practice Zone */}
          <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Practice Zone</h2>
              {topicData.mastery.dueCount > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                  {topicData.mastery.dueCount} due
                </span>
              )}
            </div>

            {/* Tab switcher — show solver only for math */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium mb-4">
              <button
                onClick={() => setPracticeTab("flashcards")}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition ${practiceTab === "flashcards" ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
              >
                <Layers className="w-4 h-4" /> Flashcards
              </button>
              <button
                onClick={() => setPracticeTab("quiz")}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition ${practiceTab === "quiz" ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
              >
                <ListChecks className="w-4 h-4" /> Quiz
              </button>
              <button
                onClick={() => setPracticeTab("solver")}
                disabled={!isMath}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition ${practiceTab === "solver" ? "bg-white shadow text-indigo-600" : "text-gray-500"} ${!isMath ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Sigma className="w-4 h-4" /> Solver
              </button>
            </div>

            {practiceLoading && (
              <div className="py-6 flex items-center justify-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="ml-2 text-xs">Loading practice…</span>
              </div>
            )}

            {practiceError && (
              <div className="p-2 rounded-lg bg-rose-50 text-rose-700 text-xs">{practiceError}</div>
            )}

            {/* Empty state — no cards yet */}
            {!practiceLoading && practiceCards.length === 0 && (
              <div className="py-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900">No practice cards yet</p>
                <p className="mt-0.5 text-xs text-gray-500">Generate AI cards for this topic to start practicing.</p>
                <button
                  onClick={generatePracticeCards}
                  disabled={generatingCards}
                  className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-indigo-600 text-white text-sm font-semibold shadow-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generatingCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generatingCards ? "Generating…" : "Generate 5 flashcards + 5 MCQs"}
                </button>
                {genStatus && <p className="mt-2 text-xs text-gray-600">{genStatus}</p>}
              </div>
            )}

            {/* Flashcards practice */}
            {!practiceLoading && practiceTab === "flashcards" && flashcards.length > 0 && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
                  <span>{fcIdx + 1} / {flashcards.length}</span>
                  <span>Tap card to flip</span>
                </div>
                <button
                  onClick={() => setFcFlipped((f) => !f)}
                  className="flip-card w-full h-56 text-left"
                  aria-label="Flip card"
                >
                  <div className={`flip-card-inner ${fcFlipped ? "is-flipped" : ""}`}>
                    <div className="flip-card-face rounded-3xl bg-white border border-gray-100 shadow-md p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] uppercase tracking-wider text-indigo-600 font-semibold">Question</span>
                      <p className="mt-2 text-base font-semibold text-gray-900">{flashcards[fcIdx].front}</p>
                    </div>
                    <div className="flip-card-face flip-card-back rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-500 text-white shadow-md p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Answer</span>
                      <p className="mt-2 text-base font-bold">{flashcards[fcIdx].back}</p>
                    </div>
                  </div>
                </button>
                {fcFlipped && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => submitFlashcard(0)}
                      disabled={fcSubmitting}
                      className="h-10 rounded-full bg-amber-500 text-white text-sm font-semibold shadow hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      Still learning
                    </button>
                    <button
                      onClick={() => submitFlashcard(5)}
                      disabled={fcSubmitting}
                      className="h-10 rounded-full bg-emerald-500 text-white text-sm font-semibold shadow hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> I knew it
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quiz practice */}
            {!practiceLoading && practiceTab === "quiz" && mcqs.length > 0 && !quizDone && (
              <div>
                <div className="text-[11px] text-gray-500 mb-2">Question {quizIdx + 1} / {mcqs.length} · Correct: {quizCorrect}</div>
                <p className="text-sm font-medium text-gray-900 mb-3">{mcqs[quizIdx].question}</p>
                <div className="space-y-1.5">
                  {mcqs[quizIdx].options?.map((opt, i) => {
                    const isSel = quizSelected === i;
                    const isAns = i === mcqs[quizIdx].correctIndex;
                    let cls = "border-gray-200 bg-white hover:border-indigo-300";
                    if (quizSelected !== null) {
                      if (isAns) cls = "border-emerald-500 bg-emerald-50 text-emerald-700";
                      else if (isSel) cls = "border-rose-500 bg-rose-50 text-rose-700";
                      else cls = "opacity-60";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => handleQuizSelect(i)}
                        disabled={quizSelected !== null}
                        className={`w-full flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-medium transition ${cls}`}
                      >
                        <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {quizSelected !== null && mcqs[quizIdx].explanation && (
                  <div className="mt-2 p-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs">
                    {mcqs[quizIdx].explanation}
                  </div>
                )}
                {quizSelected !== null && (
                  <button
                    onClick={nextQuiz}
                    className="mt-2 w-full h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold shadow hover:bg-indigo-700"
                  >
                    {quizIdx + 1 < mcqs.length ? "Next Question" : "Finish Quiz"}
                  </button>
                )}
              </div>
            )}

            {practiceTab === "quiz" && quizDone && (
              <div className="py-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">Quiz complete!</p>
                <p className="text-xs text-gray-500">Score: {quizCorrect} / {mcqs.length}</p>
                <button
                  onClick={() => {
                    setQuizIdx(0);
                    setQuizSelected(null);
                    setQuizCorrect(0);
                    setQuizDone(false);
                  }}
                  className="mt-3 h-10 px-4 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Solver (math) */}
            {practiceTab === "solver" && isMath && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Type a math problem</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && solve()}
                    placeholder="e.g. Solve 2x + 5 = 15"
                    className="flex-1 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    onClick={solve}
                    disabled={solving || !problem.trim()}
                    className="px-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {solving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Solve
                  </button>
                </div>
                {solverError && (
                  <div className="mt-2 p-2 rounded-lg bg-rose-50 text-rose-700 text-xs">{solverError}</div>
                )}
                {solution && (
                  <div className="mt-3 space-y-2">
                    {solution.steps.map((s, i) => (
                      <div key={i} className="rounded-xl bg-gray-50 p-2.5">
                        <p className="text-xs text-gray-700">{s.explanation}</p>
                        <p className="mt-1 text-sm font-mono text-indigo-700">{s.expression}</p>
                      </div>
                    ))}
                    {solution.finalAnswer && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                        <p className="text-[11px] uppercase font-semibold text-emerald-700">Final Answer</p>
                        <p className="text-sm font-bold text-emerald-900 mt-0.5">{solution.finalAnswer}</p>
                        {solution.check && (
                          <p className="mt-1 text-xs text-emerald-700 italic">{solution.check}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {practiceTab === "solver" && !isMath && (
              <div className="py-6 text-center text-xs text-gray-500">
                Step-by-step solver is only available for math topics.
              </div>
            )}
          </section>

          {/* Tutor Chat — inline collapsible */}
          <section className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setTutorOpen((v) => !v)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
            >
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-rose-600" /> Topic Tutor
              </h2>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition ${tutorOpen ? "rotate-180" : ""}`} />
            </button>
            {tutorOpen && (
              <div className="border-t border-gray-100">
                <div ref={chatScrollRef} className="max-h-72 overflow-y-auto p-3 space-y-2 bg-gray-50">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-2">
                      Ask anything about {topic?.name} — the tutor already knows the topic context.
                    </p>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap break-words ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-gray-200 text-gray-900 shadow-sm"
                      }`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatBusy && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl px-3 py-2 bg-white border border-gray-200 shadow-sm">
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                      </div>
                    </div>
                  )}
                  {chatError && (
                    <p className="text-xs text-rose-600 text-center">{chatError}</p>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChat();
                  }}
                  className="p-2 border-t border-gray-100 flex items-end gap-1.5"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    placeholder={`Ask about ${topic?.name}…`}
                    className="flex-1 p-2 rounded-full border border-gray-200 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="submit"
                    disabled={chatBusy || !chatInput.trim()}
                    className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0"
                  >
                    {chatBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Mobile exit button (bottom-right) */}
      <button
        onClick={() => {
          setActiveTopicId(null);
          setScreen("home");
        }}
        className="md:hidden fixed bottom-4 right-4 z-20 w-12 h-12 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-700"
        aria-label="Exit Study Room"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

function LessonSection({
  open,
  onToggle,
  icon: Icon,
  color,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${open ? "border-gray-200" : "border-transparent"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-xl"
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-xs font-semibold text-gray-900 flex-1 text-left">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-2 pb-2 pt-1">{children}</div>}
    </div>
  );
}
