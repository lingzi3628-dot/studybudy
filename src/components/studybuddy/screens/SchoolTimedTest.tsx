"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X, Loader2, AlertCircle, Check, Clock, Trophy,
  ChevronRight, ChevronLeft, PartyPopper, ShieldAlert,
} from "lucide-react";
import { useApp } from "../store";
import { useProctorGuard } from "./useProctorGuard";

type Question = { id: string; questionText: string; options: string[] };

export function SchoolTimedTest() {
  const { setScreen } = useApp();
  const topicId = (useApp() as any).activeSchoolTopicId;
  const [topic, setTopic] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<any>(null);
  const submittedRef = useRef(false);

  const start = useCallback(async () => {
    if (!topicId) { setError("No topic"); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/school/topic/${topicId}/start`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) setError(d.error);
        else throw new Error(d.error ?? "Failed");
        setLoading(false);
        return;
      }
      setTopic(d.topic);
      setQuestions(d.questions ?? []);
      setTimeLeft((d.topic?.timeLimitMinutes ?? 5) * 60);
      setLoading(false);
    } catch (e: any) { setError(e?.message ?? "Failed"); setLoading(false); }
  }, [topicId]);

  useEffect(() => { start(); }, [start]);

  // Countdown
  useEffect(() => {
    if (timeLeft > 0 && !result && !loading) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) { submit("timeout"); return 0; }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [timeLeft, result, loading]);

  // Phase 45: proctor guard — exits fullscreen / detects tab-switches / blocks copy-paste.
  // Auto-submits at 3 violations (configurable). Only enabled once the test screen is active
  // (not during loading, error, or result views).
  // Declared before `submit` because submit reads `proctor.violationCount` when reason="proctor".
  const [testActive, setTestActive] = useState(false);
  useEffect(() => { setTestActive(!loading && !error && !result); }, [loading, error, result]);
  const proctorRef = useRef<{ violationCount: number } | null>(null);
  const proctor = useProctorGuard({
    enabled: testActive,
    maxViolations: 3,
    onAutoSubmit: () => submit("proctor"),
  });
  // Keep the ref synced so submit() can read the current violation count without
  // re-creating submit on every violation increment.
  useEffect(() => { proctorRef.current = { violationCount: proctor.violationCount }; }, [proctor.violationCount]);

  const submit = async (reason?: "manual" | "timeout" | "proctor") => {
    if (submitting || submittedRef.current) return;
    submittedRef.current = true;
    clearInterval(intervalRef.current);
    setSubmitting(true);
    try {
      const formatted = Object.entries(answers).map(([questionId, idx]) => ({ questionId, selectedIndex: idx }));
      const r = await fetch(`/api/school/topic/${topicId}/submit-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: formatted,
          // Phase 45: include proctor metadata so the backend can flag suspicious submissions
          proctor: reason === "proctor"
            ? { autoSubmitted: true, reason: "violations_exceeded", violationCount: proctorRef.current?.violationCount ?? 0 }
            : reason === "timeout"
            ? { autoSubmitted: true, reason: "timeout" }
            : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setResult(d);
    } catch (e: any) { setError(e?.message ?? "Submit failed"); }
    setSubmitting(false);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const answeredCount = Object.keys(answers).length;
  const q = questions[current];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        <span className="ml-2 text-sm text-gray-400">Loading test...</span>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-4 text-center">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <p className="mt-3 text-sm text-gray-300">{error}</p>
        <button onClick={() => setScreen("schoolSubject")} className="mt-4 px-4 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold">
          Back to Subject
        </button>
      </div>
    );
  }

  // Result screen
  if (result) {
    const pct = Math.round((result.score ?? 0) * 100);
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4 text-center">
        {result.passed ? (
          <>
            <PartyPopper className="w-16 h-16 text-amber-400 animate-bounce" />
            <h1 className="mt-4 text-2xl font-bold text-white">Passed! 🎉</h1>
            <p className="mt-2 text-4xl font-bold text-amber-400">{pct}%</p>
            {result.badgeEarned && (
              <div className="mt-4 rounded-2xl bg-amber-900/30 border border-amber-700 p-4">
                <span className="text-4xl">{topic?.badgeIcon ?? "🏆"}</span>
                <p className="mt-2 text-sm font-bold text-amber-300">Badge Earned!</p>
              </div>
            )}
            {result.nextTopicUnlocked && (
              <p className="mt-4 text-xs text-emerald-400">✓ Next topic unlocked!</p>
            )}
          </>
        ) : (
          <>
            <span className="text-5xl">💪</span>
            <h1 className="mt-4 text-xl font-bold text-white">Keep practicing!</h1>
            <p className="mt-2 text-4xl font-bold text-rose-400">{pct}%</p>
            <p className="mt-2 text-xs text-gray-400">You need {Math.round((topic?.passThreshold ?? 0.7) * 100)}% to pass.</p>
          </>
        )}

        {/* Review answers */}
        <div className="mt-6 w-full max-w-sm space-y-2">
          {result.correctAnswers?.map((ca: any, i: number) => (
            <div key={i} className={`rounded-xl p-2 text-xs ${ca.correct ? "bg-emerald-900/30" : "bg-rose-900/30"}`}>
              <p className="text-white">{ca.questionId ? `Q${i + 1}` : `Q${i + 1}`}: {ca.correct ? "✓" : "✗"}</p>
              {ca.explanation && <p className="text-gray-400 mt-0.5">{ca.explanation}</p>}
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          {!result.passed && (
            <button onClick={() => { setResult(null); setAnswers({}); setCurrent(0); start(); }}
              className="px-4 h-10 rounded-full bg-amber-500 text-white text-sm font-semibold">
              Retry
            </button>
          )}
          <button onClick={() => setScreen("schoolSubject")}
            className="px-4 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold">
            {result.passed ? "Continue →" : "Back to Subject"}
          </button>
        </div>
      </div>
    );
  }

  // Test screen
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header with timer */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <button onClick={() => { if (confirm("Exit test? Your progress will be lost.")) setScreen("schoolSubject"); }}
          className="w-8 h-8 rounded-full hover:bg-gray-700 flex items-center justify-center text-gray-400">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1 text-amber-400 text-sm font-mono font-bold">
          <Clock className="w-4 h-4" />
          <span className={timeLeft < 60 ? "text-rose-400 animate-pulse" : ""}>{mins}:{secs.toString().padStart(2, "0")}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase 45: proctor violation indicator */}
          {proctor.violationCount > 0 && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                proctor.violationCount >= 3
                  ? "bg-rose-900/40 text-rose-300"
                  : proctor.violationCount >= 2
                  ? "bg-amber-900/40 text-amber-300"
                  : "bg-gray-700 text-gray-300"
              }`}
              title={`Proctor violations: ${proctor.violationCount}/3 — test will auto-submit at 3`}
            >
              <ShieldAlert className="w-3 h-3 inline mr-0.5" />
              {proctor.violationCount}/3
            </span>
          )}
          <span className="text-xs text-gray-400">{current + 1}/{questions.length}</span>
        </div>
      </header>

      {/* Phase 45: proctor warning banner — shown when a violation occurs */}
      {proctor.showWarning && proctor.lastEvent && (
        <div className="bg-amber-900/30 border-b border-amber-700/40 px-4 py-2 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-300">
              ⚠️ Proctor warning ({proctor.violationCount}/{3} violations)
            </p>
            <p className="text-[11px] text-amber-200/80 mt-0.5">
              {proctor.lastEvent.type === "tab-switch" && "You switched away from the test window. Stay on this tab to avoid auto-submission."}
              {proctor.lastEvent.type === "fullscreen-exit" && "You exited fullscreen. Re-enter fullscreen to continue."}
              {proctor.lastEvent.type === "copy" && "Copying is disabled during the test."}
              {proctor.lastEvent.type === "paste" && "Pasting is disabled during the test."}
              {proctor.lastEvent.type === "cut" && "Cutting is disabled during the test."}
              {proctor.lastEvent.type === "context-menu" && "Right-click is disabled during the test."}
              {proctor.lastEvent.type === "keyboard-shortcut" && `Blocked keyboard shortcut: ${proctor.lastEvent.detail ?? ""}.`}
              {proctor.violationCount >= 2 && proctor.violationCount < 3 && (
                <span className="block mt-1 text-amber-400 font-medium">
                  One more violation and the test will be auto-submitted.
                </span>
              )}
            </p>
          </div>
          <button
            onClick={proctor.dismissWarning}
            className="text-amber-400 hover:text-amber-200 text-xs px-2 py-1 flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Question */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {q && (
            <>
              <p className="text-lg font-bold text-white mb-4">{q.questionText}</p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <button key={oi}
                    onClick={() => setAnswers({ ...answers, [q.id]: oi })}
                    className={`w-full p-3 rounded-xl text-sm font-medium text-left border-2 transition ${
                      answers[q.id] === oi
                        ? "bg-indigo-900/40 border-indigo-500 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                    }`}>
                    <span className="inline-block w-6 h-6 rounded-full border-2 border-gray-500 text-center text-xs mr-2">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex items-center justify-between">
        <button onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}
          className="px-3 h-9 rounded-full bg-gray-700 text-white text-xs font-semibold disabled:opacity-30 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-[10px] text-gray-400">{answeredCount}/{questions.length} answered</span>
        {current < questions.length - 1 ? (
          <button onClick={() => setCurrent(current + 1)}
            className="px-3 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={() => submit("manual")} disabled={submitting}
            className="px-4 h-9 rounded-full bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
