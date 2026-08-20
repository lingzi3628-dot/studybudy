"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X, Loader2, AlertCircle, Play, Pause, Hand, Send, SkipForward,
  GraduationCap, Clock, BarChart3, Check, Trophy, Coins, Zap,
  Sparkles, ChevronRight, Bot, Calculator,
  Layers, ListChecks, Map as MapIcon, Sigma, Bot as BotIcon,
} from "lucide-react";
import { useApp } from "../store";

type Block = { type: "heading" | "text" | "equation" | "bullet"; content: string };
type Question = {
  id: string;
  type?: "mcq" | "short" | "math";
  question: string;
  options?: string[];
  correctIndex?: number;
  answer?: string;
  explanation?: string;
};

type Phase = "loading" | "lesson" | "mini_test" | "oral_exam" | "written_exam" | "summary";

export function ClassroomScreen() {
  const { setScreen, activeTopicId } = useApp() as any;
  const classroomSessionId = (useApp() as any).activeClassroomSessionId;
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<any>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [visibleBlocks, setVisibleBlocks] = useState(0);
  const [timer, setTimer] = useState(0); // seconds elapsed
  const [running, setRunning] = useState(true);
  const [durationMin, setDurationMin] = useState(30);
  const [testIntervalMin, setTestIntervalMin] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [currentTest, setCurrentTest] = useState<any>(null);
  const [testAnswers, setTestAnswers] = useState<Record<string, number | string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [oralQ, setOralQ] = useState<any>(null);
  const [oralAnswer, setOralAnswer] = useState("");
  const [oralFeedback, setOralFeedback] = useState<any>(null);
  const [writtenTest, setWrittenTest] = useState<any>(null);
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [writtenResult, setWrittenResult] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const intervalRef = useRef<any>(null);
  // Phase 16 — guided flow
  const [flowState, setFlowState] = useState<string>("ASSESSMENT");
  const [flowStep, setFlowStep] = useState(0);
  const [flowProgress, setFlowProgress] = useState(0);
  const [professorMsg, setProfessorMsg] = useState<string>("");

  // Start class
  const startClass = useCallback(async () => {
    if (!activeTopicId) {
      setError("No topic selected. Go to a Study Room first.");
      setPhase("loading");
      return;
    }
    setPhase("loading");
    setError(null);
    setShowUpgrade(false);
    try {
      const r = await fetch("/api/classroom/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: activeTopicId }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade || r.status === 402) {
          setError(d.error ?? "Token limit reached");
          setShowUpgrade(true);
          return;
        }
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      setSession(d.session);

      // Phase 14+16 combined: response has both flowState AND lessonBlocks
      setFlowState(d.flowState ?? d.session?.flowState ?? "ASSESSMENT");
      setFlowStep(d.currentStep ?? d.session?.currentStep ?? 0);
      setFlowProgress(d.progress ?? d.session?.progress ?? 0);
      setBlocks(d.lessonBlocks ?? []);
      setDurationMin(d.durationMinutes ?? 30);
      setTestIntervalMin(d.testIntervalMin ?? 10);
      // Fetch classroom state for professor message
      try {
        const sr = await fetch(`/api/classroom/${d.session.id}/state`);
        const sd = await sr.json();
        if (sr.ok && sd.professorMessage) {
          setProfessorMsg(sd.professorMessage);
        }
      } catch {}

      setPhase("lesson");
      setTimer(0);
      setRunning(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start class");
    }
  }, [activeTopicId]);

  useEffect(() => { startClass(); }, [startClass]);

  // Timer
  useEffect(() => {
    if (running && phase === "lesson") {
      intervalRef.current = setInterval(() => {
        setTimer((t) => {
          const newT = t + 1;
          // Check if it's time for a mini-test (every testIntervalMin minutes)
          const testMark = Math.floor(newT / (testIntervalMin * 60));
          if (testMark > 0 && testMark <= 3 && testMark > Math.floor(t / (testIntervalMin * 60))) {
            triggerMiniTest(testMark);
          }
          return newT;
        });
      }, 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [running, phase, testIntervalMin]);

  // Typing animation for blocks
  useEffect(() => {
    if (phase === "lesson" && visibleBlocks < blocks.length) {
      const tid = setTimeout(() => setVisibleBlocks((v) => v + 1), 800);
      return () => clearTimeout(tid);
    }
  }, [phase, visibleBlocks, blocks.length]);

  // Trigger mini-test
  const triggerMiniTest = async (testNumber: number) => {
    if (!session || testNumber > 3) return;
    setRunning(false);
    setPhase("mini_test");
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/classroom/${session.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testType: "mini" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to generate test");
      setCurrentTest(d.test);
      setTestAnswers({});
      setTestResult(null);
    } catch (e: any) {
      setError(e?.message ?? "Test failed");
      setPhase("lesson");
      setRunning(true);
    }
    setBusy(false);
  };

  // Submit mini-test
  const submitMiniTest = async () => {
    if (!session || !currentTest) return;
    setBusy(true);
    try {
      const answers = Object.entries(testAnswers).map(([qid, val]) => ({
        questionId: qid,
        selectedIndex: typeof val === "number" ? val : 0,
      }));
      const r = await fetch(`/api/classroom/${session.id}/submit-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: currentTest.id, answers }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Submit failed");
      setTestResult(d);
      setToast(`Test ${d.passed ? "passed! 🎉" : "needs work"} — Score: ${Math.round(d.score * 100)}%`);
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
    }
    setBusy(false);
  };

  // Continue after mini-test
  const continueAfterTest = () => {
    setCurrentTest(null);
    setTestResult(null);
    // After 3rd test, go to oral exam
    const testNum = session?.currentTestIndex ?? 0;
    if (testNum >= 3) {
      startOralExam();
    } else {
      setPhase("lesson");
      setRunning(true);
    }
  };

  // Start oral exam
  const startOralExam = async () => {
    if (!session) return;
    setPhase("oral_exam");
    setBusy(true);
    setOralAnswer("");
    setOralFeedback(null);
    try {
      const r = await fetch(`/api/classroom/${session.id}/oral-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Oral exam failed");
      setOralQ(d);
    } catch (e: any) {
      setError(e?.message ?? "Oral exam failed");
    }
    setBusy(false);
  };

  // Submit oral answer
  const submitOralAnswer = async () => {
    if (!session || !oralQ || !oralAnswer.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/classroom/${session.id}/oral-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: oralAnswer }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Submit failed");
      setOralFeedback(d);
      setOralAnswer("");
      if (d.isLast) {
        setOralQ(null);
      } else {
        setOralQ(d);
      }
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
    }
    setBusy(false);
  };

  // Skip to written exam
  const skipToWritten = () => {
    setOralQ(null);
    setOralFeedback(null);
    startWrittenExam();
  };

  // Start written exam
  const startWrittenExam = async () => {
    if (!session) return;
    setPhase("written_exam");
    setBusy(true);
    setWrittenResult(null);
    try {
      const r = await fetch(`/api/classroom/${session.id}/written-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Written exam failed");
      setWrittenTest(d.test);
      setWrittenAnswers({});
    } catch (e: any) {
      setError(e?.message ?? "Written exam failed");
    }
    setBusy(false);
  };

  // Submit written exam
  const submitWrittenExam = async () => {
    if (!session || !writtenTest) return;
    setBusy(true);
    try {
      const questions = writtenTest.questions as Question[];
      const answers = questions.map((q) => {
        const ans = writtenAnswers[q.id] ?? "";
        if (q.type === "mcq" && q.options) {
          return { questionId: q.id, selectedIndex: Number(ans) || 0 };
        }
        return { questionId: q.id, answer: ans };
      });
      const r = await fetch(`/api/classroom/${session.id}/submit-written-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: writtenTest.id, answers }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Submit failed");
      setWrittenResult(d);
      setToast(`Written exam ${d.passed ? "passed! 🎉" : "needs work"} — Score: ${Math.round(d.score * 100)}%`);
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
    }
    setBusy(false);
  };

  // Complete class
  const completeClass = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/classroom/${session.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Complete failed");
      setSummary(d.summary);
      setPhase("summary");
    } catch (e: any) {
      setError(e?.message ?? "Complete failed");
    }
    setBusy(false);
  };

  // Phase 16: advance guided flow
  const advanceFlow = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/classroom/${session.id}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to advance");
      setFlowState(d.newState ?? d.flowState ?? flowState);
      setFlowStep(d.currentStep ?? flowStep + 1);
      setFlowProgress(d.progress ?? flowProgress);
      if (d.professorMessage) setProfessorMsg(d.professorMessage);
      setToast(`Advanced to ${d.newState ?? "next step"} ✓`);
      setTimeout(() => setToast(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Failed to advance");
    }
    setBusy(false);
  };

  const mins = Math.floor(timer / 60);
  const secs = timer % 60;
  const progressPct = Math.min(100, (timer / (durationMin * 60)) * 100);
  const testProgressPct = session ? session.progress * 100 : 0;

  // ===== LOADING / ERROR =====
  if (phase === "loading" && !session) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center">
        {showUpgrade ? (
          <div className="text-center px-4 max-w-md">
            <span className="text-5xl">🥲</span>
            <p className="mt-3 text-sm font-semibold text-white">{error}</p>
            <button onClick={() => setScreen("premium")} className="mt-4 px-6 h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700">
              Upgrade Now →
            </button>
            <button onClick={() => setScreen("home")} className="mt-2 text-xs text-gray-400 block w-full">
              Back to home
            </button>
          </div>
        ) : error ? (
          <div className="text-center px-4">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <p className="mt-3 text-sm text-gray-300">{error}</p>
            <button onClick={() => setScreen("home")} className="mt-4 px-4 h-10 rounded-full bg-gray-700 text-white text-sm">
              Back to home
            </button>
          </div>
        ) : (
          <>
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <p className="mt-3 text-sm text-gray-400">Professor Bloom is preparing the classroom…</p>
          </>
        )}
      </div>
    );
  }

  // ===== SUMMARY =====
  if (phase === "summary" && summary) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-4xl">
          🎓
        </div>
        <h1 className="mt-4 text-xl font-bold text-white">Class Complete!</h1>
        <p className="mt-1 text-sm text-gray-400">Professor Bloom is proud of you.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-sm">
          <div className="rounded-xl bg-gray-800 p-3">
            <p className="text-[10px] text-gray-500">Avg Score</p>
            <p className="text-lg font-bold text-white">{Math.round((summary.avgScore ?? 0) * 100)}%</p>
          </div>
          <div className="rounded-xl bg-gray-800 p-3">
            <p className="text-[10px] text-gray-500">Mastery +</p>
            <p className="text-lg font-bold text-emerald-400">{Math.round((summary.masteryIncrease ?? 0) * 100)}%</p>
          </div>
          <div className="rounded-xl bg-gray-800 p-3">
            <p className="text-[10px] text-gray-500">XP Gained</p>
            <p className="text-lg font-bold text-violet-400">+{summary.xpGained ?? 0}</p>
          </div>
          <div className="rounded-xl bg-gray-800 p-3">
            <p className="text-[10px] text-gray-500">Coins Gained</p>
            <p className="text-lg font-bold text-amber-400">+{summary.coinsGained ?? 0}</p>
          </div>
        </div>

        {summary.newBadges?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">New badges earned!</p>
            <div className="flex gap-2">
              {summary.newBadges.map((b: any, i: number) => (
                <span key={i} className="text-3xl" title={b.name}>{b.icon}</span>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setScreen("study")} className="mt-6 px-6 h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700">
          Back to Study Room
        </button>
      </div>
    );
  }

  // ===== MAIN CLASSROOM =====
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header: Professor + Timer + Progress + Flow State */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xl flex-shrink-0">
            🧙‍♂️
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">Professor Bloom</p>
            <p className="text-[9px] text-gray-400">Phase 16: {flowState} · Step {flowStep + 1}/6</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Phase 16: Flow progress bar */}
          <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-violet-400 transition-all" style={{ width: `${Math.min(100, flowProgress * 100)}%` }} />
          </div>
          <div className="flex items-center gap-1 text-amber-400 text-xs font-mono">
            <Clock className="w-3 h-3" />
            <span>{mins}:{secs.toString().padStart(2, "0")}</span>
          </div>
          <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <button onClick={() => { if (confirm("Exit classroom? Your progress will be saved.")) { if (session) fetch(`/api/classroom/${session.id}/save`, { method: "POST" }).catch(() => {}); setScreen("dashboard"); } }} className="w-8 h-8 rounded-full hover:bg-gray-700 flex items-center justify-center text-gray-400">
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Phase 16: Professor Bloomer's narration + Next Step button */}
      {professorMsg && (
        <div className="bg-violet-900/40 border-b border-violet-700 px-4 py-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-violet-200 truncate flex-1">
            <span className="text-base mr-1">🧙‍♂️</span>{professorMsg}
          </p>
          <button
            onClick={advanceFlow}
            disabled={busy || flowState === "MASTERED"}
            className="flex-shrink-0 px-3 h-7 rounded-full bg-violet-600 text-white text-[10px] font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
            {flowState === "MASTERED" ? "Done" : "Next Step"}
          </button>
        </div>
      )}

      {/* Whiteboard */}
      {(phase === "lesson" || phase === "mini_test") && (
        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-900 to-gray-800 p-4 md:p-8">
          <div className="max-w-2xl mx-auto">
            {phase === "lesson" && (
              <div className="space-y-3">
                {blocks.slice(0, visibleBlocks).map((block, i) => (
                  <WhiteboardBlock key={i} block={block} />
                ))}
                {visibleBlocks < blocks.length && (
                  <div className="flex items-center gap-1 text-gray-500 text-sm">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Professor is writing…</span>
                  </div>
                )}
                {visibleBlocks >= blocks.length && (
                  <p className="text-xs text-gray-500 text-center mt-4">
                    Next mini-test in {testIntervalMin - (mins % testIntervalMin)} min…
                  </p>
                )}
              </div>
            )}

            {/* Mini-test overlay */}
            {phase === "mini_test" && currentTest && !testResult && (
              <MiniTestComponent
                test={currentTest}
                answers={testAnswers}
                setAnswers={setTestAnswers}
                onSubmit={submitMiniTest}
                busy={busy}
              />
            )}
            {phase === "mini_test" && testResult && (
              <TestResultComponent result={testResult} onContinue={continueAfterTest} />
            )}
          </div>
        </div>
      )}

      {/* Oral exam */}
      {phase === "oral_exam" && (
        <div className="flex-1 overflow-y-auto bg-gray-900 p-4 md:p-8">
          <div className="max-w-xl mx-auto space-y-4">
            <div className="text-center">
              <span className="text-3xl">🗣️</span>
              <h2 className="text-lg font-bold text-white">Oral Exam</h2>
              <p className="text-xs text-gray-400">Professor Bloom asks, you answer.</p>
            </div>
            {busy ? (
              <div className="flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>
            ) : oralQ?.question ? (
              <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4 space-y-3">
                <p className="text-xs text-amber-400 font-semibold">Question {oralQ.questionIndex ?? 1} of {oralQ.totalQuestions ?? 3}</p>
                <p className="text-sm text-white">{oralQ.question}</p>
                <textarea
                  value={oralAnswer}
                  onChange={(e) => setOralAnswer(e.target.value)}
                  placeholder="Type your answer…"
                  rows={4}
                  className="w-full p-3 rounded-xl bg-gray-900 border border-gray-700 text-sm text-white outline-none focus:border-amber-400 resize-none"
                />
                <button
                  onClick={submitOralAnswer}
                  disabled={busy || !oralAnswer.trim()}
                  className="w-full h-10 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
                >
                  Submit Answer
                </button>
              </div>
            ) : oralFeedback?.isLast ? (
              <div className="text-center">
                <p className="text-sm text-gray-400">Oral exam complete!</p>
                <button onClick={startWrittenExam} className="mt-4 px-6 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold">
                  Start Written Exam →
                </button>
              </div>
            ) : null}
            {oralFeedback?.feedback && (
              <div className="rounded-xl bg-emerald-900/30 border border-emerald-700 p-3 text-xs text-emerald-300">
                <p className="font-semibold">Feedback: {oralFeedback.feedback}</p>
                {oralFeedback.score !== null && <p className="mt-1">Score: {Math.round(oralFeedback.score * 100)}%</p>}
              </div>
            )}
            <button onClick={skipToWritten} className="w-full text-xs text-gray-500 hover:underline text-center">
              Skip to Written Exam →
            </button>
          </div>
        </div>
      )}

      {/* Written exam */}
      {phase === "written_exam" && (
        <div className="flex-1 overflow-y-auto bg-gray-900 p-4 md:p-8">
          <div className="max-w-xl mx-auto space-y-3">
            <div className="text-center">
              <span className="text-3xl">📝</span>
              <h2 className="text-lg font-bold text-white">Written Exam</h2>
            </div>
            {busy && !writtenTest ? (
              <div className="flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>
            ) : writtenTest && !writtenResult ? (
              <>
                {(writtenTest.questions as Question[]).map((q, i) => (
                  <div key={q.id} className="rounded-xl bg-gray-800 border border-gray-700 p-3 space-y-2">
                    <p className="text-[10px] text-amber-400 font-semibold">Q{i + 1} · {q.type}</p>
                    <p className="text-sm text-white">{q.question}</p>
                    {q.options && q.type === "mcq" ? (
                      <div className="space-y-1">
                        {q.options.map((opt, oi) => (
                          <button
                            key={oi}
                            onClick={() => setWrittenAnswers({ ...writtenAnswers, [q.id]: String(oi) })}
                            className={`block w-full text-left p-2 rounded-lg text-xs border ${writtenAnswers[q.id] === String(oi) ? "bg-amber-900/30 border-amber-500 text-white" : "bg-gray-900 border-gray-700 text-gray-300"}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={writtenAnswers[q.id] ?? ""}
                        onChange={(e) => setWrittenAnswers({ ...writtenAnswers, [q.id]: e.target.value })}
                        placeholder={q.type === "math" ? "Type your calculation…" : "Write your answer…"}
                        rows={q.type === "math" ? 3 : 2}
                        className="w-full p-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white outline-none focus:border-amber-400 resize-none"
                      />
                    )}
                  </div>
                ))}
                <button
                  onClick={submitWrittenExam}
                  disabled={busy}
                  className="w-full h-11 rounded-full bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy ? "Submitting…" : "Submit Exam"}
                </button>
              </>
            ) : writtenResult ? (
              <div className="space-y-3">
                <TestResultComponent result={{ score: writtenResult.score, passed: writtenResult.passed }} onContinue={completeClass} continueLabel="Complete Class →" />
                {writtenResult.perQuestion?.map((pq: any, i: number) => (
                  <div key={i} className={`rounded-xl p-2 text-xs ${pq.correct ? "bg-emerald-900/20 border border-emerald-700" : "bg-rose-900/20 border border-rose-700"}`}>
                    <p className="text-white">Q{i + 1}: {pq.correct ? "✓ Correct" : "✗ Incorrect"}</p>
                    <p className="text-gray-400 mt-1">Expected: {pq.expected}</p>
                    <p className="text-gray-400">Your answer: {pq.userAnswer}</p>
                  </div>
                ))}
                <button onClick={completeClass} className="w-full h-11 rounded-full bg-indigo-600 text-white text-sm font-bold">
                  Complete Class & Get Rewards →
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Bottom controls + study tools */}
      {phase === "lesson" && (
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 space-y-2">
          {/* Phase 16: Study Tools — contextually shown per flow state */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="text-[9px] text-gray-500 font-semibold flex-shrink-0">TOOLS:</span>
            {flowState === "LEARNING" && (
              <>
                <button onClick={() => setScreen("flashcards")} className="flex-shrink-0 px-2 h-7 rounded-full bg-amber-600/80 text-white text-[10px] font-semibold hover:bg-amber-600 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Flashcards
                </button>
                <button onClick={() => triggerMiniTest(1)} className="flex-shrink-0 px-2 h-7 rounded-full bg-rose-600/80 text-white text-[10px] font-semibold hover:bg-rose-600 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" /> Quick Quiz
                </button>
                <button onClick={() => { (useApp.getState() as any).setActiveConceptMapId(null); setScreen("conceptMap"); }} className="flex-shrink-0 px-2 h-7 rounded-full bg-fuchsia-600/80 text-white text-[10px] font-semibold hover:bg-fuchsia-600 flex items-center gap-1">
                  <MapIcon className="w-3 h-3" /> Concept Map
                </button>
                <button onClick={() => setScreen("graph")} className="flex-shrink-0 px-2 h-7 rounded-full bg-sky-600/80 text-white text-[10px] font-semibold hover:bg-sky-600 flex items-center gap-1">
                  <Sigma className="w-3 h-3" /> Solver
                </button>
                <button onClick={() => setScreen("tutor")} className="flex-shrink-0 px-2 h-7 rounded-full bg-violet-600/80 text-white text-[10px] font-semibold hover:bg-violet-600 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Ask AI
                </button>
              </>
            )}
            {flowState === "PRACTICE" && (
              <>
                <button onClick={() => setScreen("flashcards")} className="flex-shrink-0 px-2 h-7 rounded-full bg-amber-600/80 text-white text-[10px] font-semibold hover:bg-amber-600 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Practice Cards
                </button>
                <button onClick={() => setScreen("quiz")} className="flex-shrink-0 px-2 h-7 rounded-full bg-rose-600/80 text-white text-[10px] font-semibold hover:bg-rose-600 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" /> Practice Quiz
                </button>
              </>
            )}
            {flowState === "QUIZ" && (
              <button onClick={() => triggerMiniTest(1)} disabled={busy} className="flex-shrink-0 px-3 h-7 rounded-full bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 flex items-center gap-1">
                <ListChecks className="w-3 h-3" /> Take Quiz Now
              </button>
            )}
            {flowState === "ASSESSMENT" && (
              <button onClick={() => triggerMiniTest(1)} disabled={busy} className="flex-shrink-0 px-3 h-7 rounded-full bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Start Assessment
              </button>
            )}
            {flowState === "REVIEW" && (
              <>
                <button onClick={() => setScreen("flashcards")} className="flex-shrink-0 px-2 h-7 rounded-full bg-amber-600/80 text-white text-[10px] font-semibold hover:bg-amber-600 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Review Cards
                </button>
                <button onClick={() => setScreen("quiz")} className="flex-shrink-0 px-2 h-7 rounded-full bg-rose-600/80 text-white text-[10px] font-semibold hover:bg-rose-600 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" /> Retry Quiz
                </button>
              </>
            )}
            {flowState === "MASTERED" && (
              <button onClick={() => completeClass()} disabled={busy} className="flex-shrink-0 px-3 h-7 rounded-full bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Complete & Earn Rewards
              </button>
            )}
          </div>
          {/* Playback controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setRunning(!running)}
              className="w-9 h-9 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white"
            >
              {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => triggerMiniTest((session?.currentTestIndex ?? 0) + 1)}
              disabled={busy}
              className="px-3 h-8 rounded-full bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> Take Test Now
            </button>
            <button
              onClick={() => setToast("Professor Bloom will check in shortly! 🙋")}
              className="w-9 h-9 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white"
            >
              <Hand className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}
      {error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}

// ===== Sub-components =====

function WhiteboardBlock({ block }: { block: Block }) {
  if (block.type === "heading") {
    return <h3 className="text-base font-bold text-amber-300 mt-2">{block.content}</h3>;
  }
  if (block.type === "equation") {
    return (
      <div className="rounded-lg bg-gray-800/50 border border-gray-700 px-3 py-2 my-2">
        <code className="text-sm text-cyan-300 font-mono">{block.content}</code>
      </div>
    );
  }
  if (block.type === "bullet") {
    return (
      <div className="flex items-start gap-2">
        <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
        <p className="text-sm text-gray-300">{block.content}</p>
      </div>
    );
  }
  return <p className="text-sm text-gray-300 leading-relaxed">{block.content}</p>;
}

function MiniTestComponent({ test, answers, setAnswers, onSubmit, busy }: {
  test: any;
  answers: Record<string, number | string>;
  setAnswers: (v: any) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const questions = (test.questions ?? []) as Question[];
  return (
    <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4 space-y-3">
      <div className="text-center">
        <span className="text-2xl">📋</span>
        <h3 className="text-sm font-bold text-white">Mini-Test</h3>
      </div>
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-1.5">
          <p className="text-xs text-amber-400 font-semibold">Q{i + 1}</p>
          <p className="text-sm text-white">{q.question}</p>
          {q.options && (
            <div className="space-y-1">
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => setAnswers({ ...answers, [q.id]: oi })}
                  className={`block w-full text-left p-2 rounded-lg text-xs border ${answers[q.id] === oi ? "bg-amber-900/30 border-amber-500 text-white" : "bg-gray-900 border-gray-700 text-gray-300"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={onSubmit}
        disabled={busy || questions.some((q) => answers[q.id] === undefined)}
        className="w-full h-10 rounded-full bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit Test"}
      </button>
    </div>
  );
}

function TestResultComponent({ result, onContinue, continueLabel }: {
  result: any;
  onContinue: () => void;
  continueLabel?: string;
}) {
  const pct = Math.round((result.score ?? 0) * 100);
  return (
    <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4 text-center space-y-2">
      <span className="text-3xl">{result.passed ? "🎉" : "💪"}</span>
      <p className="text-sm font-bold text-white">{result.passed ? "Passed!" : "Keep practicing!"}</p>
      <p className="text-2xl font-bold text-amber-400">{pct}%</p>
      <button
        onClick={onContinue}
        className="w-full h-10 rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
      >
        {continueLabel ?? "Continue →"}
      </button>
    </div>
  );
}
