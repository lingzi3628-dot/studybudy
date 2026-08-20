"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X, Loader2, AlertCircle, Send, Sparkles, Bot, ChevronRight,
  Clock,
} from "lucide-react";
import { useApp } from "../store";

type IntakeStep = "loading" | "name" | "teacher_name" | "knowledge" | "diagnostic_offer" | "diagnostic_quiz" | "countdown" | "done";

type ChatMsg = { role: "professor" | "user"; content: string };

/**
 * IntakeFlow — Phase 16 Study Room reception/intake.
 *
 * Professor Bloomer welcomes the user, learns their name, asks what to
 * call the teacher, asks prior knowledge, offers diagnostic quiz, then
 * countdown → redirect to Classroom.
 */
export function IntakeFlow({ topicId, topicName, onRedirectToClassroom }: {
  topicId: string;
  topicName: string;
  onRedirectToClassroom: (sessionId: string) => void;
}) {
  const { setScreen } = useApp();
  const [step, setStep] = useState<IntakeStep>("loading");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [teacherName, setTeacherName] = useState("Professor Bloom");
  const [knowledgeLevel, setKnowledgeLevel] = useState("");
  const [diagnosticQuestions, setDiagnosticQuestions] = useState<any[]>([]);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<Record<string, number>>({});
  const [countdown, setCountdown] = useState(10);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const startClassroom = useCallback(async () => {
    try {
      const r = await fetch("/api/classroom/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId }),
      });
      const d = await r.json();
      if (r.ok && d.session) {
        onRedirectToClassroom(d.session.id);
      } else {
        // Failed to start classroom — show intake anyway
        setStep("name");
        setChat([{
          role: "professor",
          content: `Welcome to ${topicName}! I'm Professor Bloom. What's your name?`,
        }]);
      }
    } catch {
      setStep("name");
      setChat([{
        role: "professor",
        content: `Welcome to ${topicName}! I'm Professor Bloom. What's your name?`,
      }]);
    }
  }, [topicId, topicName, onRedirectToClassroom]);

  // Load intake status
  const loadIntake = useCallback(async () => {
    try {
      const r = await fetch(`/api/study-room/${topicId}/intake`);
      const d = await r.json();
      if (r.ok) {
        if (d.intakeCompleted) {
          // Already done — start classroom
          await startClassroom();
        } else {
          setStep("name");
          setChat([{
            role: "professor",
            content: `Welcome to ${d.topicName ?? topicName}! I'm Professor Bloom. What's your name?`,
          }]);
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
      setStep("name");
    }
  }, [topicId, topicName, startClassroom]);

  useEffect(() => { loadIntake(); }, [loadIntake]);

  // Countdown timer
  useEffect(() => {
    if (step === "countdown" && countdown > 0) {
      const tid = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(tid);
    }
    if (step === "countdown" && countdown === 0 && sessionId) {
      setStep("done");
      onRedirectToClassroom(sessionId);
    }
  }, [step, countdown, sessionId, onRedirectToClassroom]);

  const addProfessor = (msg: string) => setChat((c) => [...c, { role: "professor", content: msg }]);
  const addUser = (msg: string) => setChat((c) => [...c, { role: "user", content: msg }]);

  const submitName = async () => {
    const name = input.trim();
    if (!name) return;
    setInput("");
    setUserName(name);
    addUser(name);
    addProfessor(`Nice to meet you, ${name}! You can call me whatever you like. What should I be called? (Default: Professor Bloom)`);
    setStep("teacher_name");
  };

  const submitTeacherName = async () => {
    const name = input.trim() || "Professor Bloom";
    setInput("");
    setTeacherName(name);
    addUser(name);
    addProfessor(`Great! Call me ${name} from now on. How much do you know about ${topicName}?`);
    setStep("knowledge");
  };

  const selectKnowledge = (level: string) => {
    setKnowledgeLevel(level);
    addUser(level);
    const msg = level === "I know nothing"
      ? "No worries — we'll start from scratch! "
      : level === "I know a little"
      ? "Great, we'll build on what you know. "
      : "Impressive! Let's see what you can do. ";
    addProfessor(msg + "Would you like me to set some questions to find out exactly where you stand?");
    setStep("diagnostic_offer");
  };

  const generateDiagnostic = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/study-room/${topicId}/intake/diagnostic`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to generate quiz");
      setDiagnosticQuestions(d.questions ?? []);
      setDiagnosticAnswers({});
      addProfessor("Here are 5 quick questions. Answer them and I'll know exactly how to help you!");
      setStep("diagnostic_quiz");
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate quiz");
      // Skip to classroom on error
      await saveIntakeAndCountdown();
    }
    setBusy(false);
  };

  const submitDiagnostic = async () => {
    setBusy(true);
    try {
      const answers = diagnosticQuestions.map((q: any) => ({
        questionId: q.id,
        selectedIndex: diagnosticAnswers[q.id] ?? 0,
        correctIndex: q.correctIndex,
      }));
      const r = await fetch(`/api/study-room/${topicId}/intake/diagnostic/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Submit failed");
      addProfessor(d.message ?? "Great! Let's start learning.");
      await saveIntakeAndCountdown();
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
      await saveIntakeAndCountdown();
    }
    setBusy(false);
  };

  const saveIntakeAndCountdown = async () => {
    setBusy(true);
    try {
      // Save intake data
      await fetch(`/api/study-room/${topicId}/intake/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName, teacherCustomName: teacherName }),
      });
      // Start classroom session
      const r = await fetch("/api/classroom/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId }),
      });
      const d = await r.json();
      if (r.ok && d.session) {
        setSessionId(d.session.id);
        addProfessor(`Welcome to our study, ${userName}! We are heading to the Classroom in 10 seconds...`);
        setStep("countdown");
        setCountdown(10);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to start classroom");
    }
    setBusy(false);
  };

  const skipDiagnostic = async () => {
    addUser("No, just start");
    addProfessor(`No problem, ${userName}! Let's dive right in.`);
    await saveIntakeAndCountdown();
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        <span className="ml-2 text-sm text-gray-500">Professor Bloom is preparing…</span>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-50">
        <div className="text-center">
          <Bot className="w-12 h-12 mx-auto text-indigo-600 animate-bounce" />
          <p className="mt-3 text-sm font-bold text-gray-900">Entering Classroom…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex flex-col">
      {/* Header */}
      <header className="px-4 h-14 flex items-center justify-between">
        <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-amber-100 flex items-center justify-center">
          <X className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-2xl">🧙‍♂️</span>
          <span className="text-sm font-bold text-gray-900">Professor Bloom</span>
        </div>
        <div className="w-9" />
      </header>

      {/* Chat area */}
      <div className="flex-1 max-w-md mx-auto w-full px-4 py-4 space-y-3 overflow-y-auto">
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === "user"
                ? "bg-indigo-600 text-white"
                : "bg-white border border-amber-200 text-gray-900 shadow-sm"
            }`}>
              {m.role === "professor" && <span className="text-lg mr-1">🧙‍♂️</span>}
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-white border border-amber-200 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            </div>
          </div>
        )}
        {error && (
          <div className="text-xs text-rose-500 text-center p-2">{error}</div>
        )}

        {/* Step-specific UI */}
        {(step === "name" || step === "teacher_name") && (
          <div className="flex items-end gap-2 pt-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") step === "name" ? submitName() : submitTeacherName(); }}
              placeholder={step === "name" ? "Your name…" : "Teacher name (default: Professor Bloom)"}
              className="flex-1 p-3 rounded-2xl border border-amber-200 text-sm outline-none focus:border-amber-400 bg-white"
              autoFocus
            />
            <button
              onClick={step === "name" ? submitName : submitTeacherName}
              disabled={busy || (step === "name" && !input.trim())}
              className="w-11 h-11 rounded-full bg-amber-500 text-white flex items-center justify-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === "knowledge" && (
          <div className="flex flex-col gap-2 pt-2">
            {["I know nothing", "I know a little", "I know a lot"].map((k) => (
              <button
                key={k}
                onClick={() => selectKnowledge(k)}
                disabled={busy}
                className="w-full p-3 rounded-2xl bg-white border border-amber-200 text-sm font-medium text-gray-700 hover:border-amber-400 hover:bg-amber-50 transition"
              >
                {k}
              </button>
            ))}
          </div>
        )}

        {step === "diagnostic_offer" && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={generateDiagnostic}
              disabled={busy}
              className="flex-1 p-3 rounded-2xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              Yes, set questions
            </button>
            <button
              onClick={skipDiagnostic}
              disabled={busy}
              className="flex-1 p-3 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              No, just start
            </button>
          </div>
        )}

        {step === "diagnostic_quiz" && diagnosticQuestions.length > 0 && (
          <div className="space-y-3 pt-2">
            {diagnosticQuestions.map((q: any, qi: number) => (
              <div key={q.id} className="rounded-2xl bg-white border border-amber-200 p-3 space-y-2">
                <p className="text-xs font-bold text-amber-600">Question {qi + 1}</p>
                <p className="text-sm text-gray-900">{q.question}</p>
                <div className="space-y-1">
                  {(q.options ?? []).map((opt: string, oi: number) => (
                    <button
                      key={oi}
                      onClick={() => setDiagnosticAnswers({ ...diagnosticAnswers, [q.id]: oi })}
                      className={`block w-full text-left p-2 rounded-lg text-xs border ${
                        diagnosticAnswers[q.id] === oi
                          ? "bg-amber-100 border-amber-400 text-gray-900"
                          : "bg-gray-50 border-gray-200 text-gray-600"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={submitDiagnostic}
              disabled={busy || diagnosticQuestions.some((q: any) => diagnosticAnswers[q.id] === undefined)}
              className="w-full h-11 rounded-full bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit Answers"}
            </button>
          </div>
        )}

        {step === "countdown" && (
          <div className="text-center pt-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-4xl font-bold text-white mx-auto shadow-lg">
              {countdown}
            </div>
            <p className="mt-4 text-sm text-gray-600">Heading to Classroom…</p>
          </div>
        )}
      </div>
    </div>
  );
}
