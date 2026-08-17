"use client";

import { useEffect, useState } from "react";
import {
  X,
  UploadCloud,
  Clipboard,
  Layers,
  ListChecks,
  LineChart,
  Bot,
  Route,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  FileText,
} from "lucide-react";
import { useApp, type CreateOption } from "../store";
import { api } from "../api";

const options: {
  key: CreateOption;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { key: "upload", label: "Upload PDF / Photo", desc: "Turn documents into study material", icon: UploadCloud, color: "bg-indigo-50 text-indigo-600" },
  { key: "paste", label: "Paste Text", desc: "Paste notes to convert into learning", icon: Clipboard, color: "bg-violet-50 text-violet-600" },
  { key: "flashcards", label: "Generate Flashcards", desc: "Quick Q/A cards from any topic", icon: Layers, color: "bg-amber-50 text-amber-600" },
  { key: "quiz", label: "Generate Quiz", desc: "Practice questions with explanations", icon: ListChecks, color: "bg-emerald-50 text-emerald-600" },
  { key: "graph", label: "Draw Graph", desc: "Visualise equations and functions", icon: LineChart, color: "bg-sky-50 text-sky-600" },
  { key: "tutor", label: "Ask AI Tutor", desc: "Get instant help on any concept", icon: Bot, color: "bg-rose-50 text-rose-600" },
  { key: "path", label: "Create Learning Path", desc: "Build a step-by-step plan", icon: Route, color: "bg-teal-50 text-teal-600" },
];

type SubConfig = { title: string; placeholder: string; multiline: boolean; subject?: boolean; topic?: boolean };
const inputConfigs: Record<string, SubConfig> = {
  upload: { title: "Upload a file", placeholder: "Pick a PDF to extract text and auto-generate cards", multiline: false },
  paste: { title: "Paste your text", placeholder: "Paste your notes, article, or text here...", multiline: true },
  flashcards: { title: "Generate flashcards", placeholder: "Topic, e.g. Photosynthesis", multiline: false, subject: true, topic: true },
  quiz: { title: "Generate a quiz", placeholder: "Topic, e.g. Quadratic equations", multiline: false, subject: true, topic: true },
  graph: { title: "Draw a graph", placeholder: "Equation, e.g. y = 2x + 3", multiline: false },
  tutor: { title: "Ask the AI tutor", placeholder: "Ask anything, e.g. What is photosynthesis?", multiline: true },
  path: { title: "Create a learning path", placeholder: "Goal, e.g. Master Year 8 Algebra", multiline: false },
};

export function CreateModal() {
  const { createOpen, closeCreate, createOption, openCreate, setScreen, setActiveStudySetId } = useApp();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: string; setId?: string } | null>(null);

  useEffect(() => {
    if (createOpen) {
      setText("");
      setTitle("");
      setSubject("");
      setTopic("");
      setFile(null);
      setBusy(false);
      setError(null);
      setDone(null);
    }
  }, [createOpen, createOption]);

  if (!createOpen) return null;

  const cfg = createOption ? inputConfigs[createOption] : null;

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      if (createOption === "paste" || createOption === "flashcards" || createOption === "quiz") {
        if (!text.trim()) {
          setError("Please enter some text first.");
          setBusy(false);
          return;
        }
        const res = await api.createStudySet({
          title: title || (createOption === "paste" ? "Pasted notes" : text.slice(0, 40)),
          sourceType: "text",
          sourceText: text,
          subject: subject || undefined,
          topic: topic || undefined,
          generate: true,
          numFlashcards: 6,
          numMCQs: 4,
        });
        setDone({ kind: "set", setId: res.studySet.id });
      } else if (createOption === "upload") {
        if (!file) {
          setError("Please pick a PDF file first.");
          setBusy(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", title || file.name.replace(/\.pdf$/i, ""));
        if (subject) fd.append("subject", subject);
        if (topic) fd.append("topic", topic);
        fd.append("generate", "true");
        const res = await api.uploadStudySet(fd);
        setDone({ kind: "set", setId: res.studySet.id });
      } else if (createOption === "graph") {
        setScreen("graph");
        closeCreate();
      } else if (createOption === "tutor") {
        setScreen("search");
        closeCreate();
      } else if (createOption === "path") {
        if (!text.trim()) {
          setError("Please enter a goal/skill first.");
          setBusy(false);
          return;
        }
        const res = await api.generateLearningPath({
          skill: text.slice(0, 60),
          level: "beginner",
          goal: title || undefined,
        });
        setDone({ kind: "path", setId: res.learningPath.id });
      }
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleStartStudying = () => {
    if (done?.setId) {
      setActiveStudySetId(done.setId);
      setScreen("quiz");
    }
    closeCreate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeCreate} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{cfg ? cfg.title : "Create New"}</h2>
          <button
            onClick={closeCreate}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {!createOption ? (
            <div className="space-y-2.5">
              {options.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.key}
                    onClick={() => openCreate(o.key)}
                    className="w-full flex items-center gap-4 p-3.5 rounded-2xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition text-left"
                  >
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center ${o.color}`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{o.label}</p>
                      <p className="text-xs text-gray-500 truncate">{o.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : done ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900">
                {done.kind === "set" ? "Study set created!" : "Learning path generated!"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {done.kind === "set"
                  ? "Your AI-generated cards are saved and ready to study."
                  : "A 4-week roadmap is saved in your account."}
              </p>
              {done.setId && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={handleStartStudying}
                    className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700"
                  >
                    Start studying now
                  </button>
                  <button onClick={() => openCreate(null)} className="w-full h-10 rounded-full text-gray-500 text-sm hover:bg-gray-100">
                    Create another
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {createOption === "upload" && (
                <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                    id="file-input"
                  />
                  <label htmlFor="file-input" className="cursor-pointer inline-flex flex-col items-center gap-2">
                    <span className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <UploadCloud className="w-5 h-5" />
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {file ? file.name : "Tap to pick a PDF"}
                    </span>
                    <span className="text-xs text-gray-400">PDF up to 5MB</span>
                  </label>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Auto-generated if empty"
                  className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {cfg?.subject && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Subject</label>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Science"
                      className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Topic</label>
                    <input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. Photosynthesis"
                      className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              )}

              {createOption !== "upload" && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {createOption === "tutor" ? "Your question" : "Content"}
                  </label>
                  {cfg?.multiline ? (
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={5}
                      placeholder={cfg?.placeholder}
                      className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
                    />
                  ) : (
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={cfg?.placeholder}
                      className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 text-amber-700 text-xs">
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                <span>
                  {createOption === "paste" || createOption === "flashcards" || createOption === "quiz" || createOption === "upload"
                    ? "Generates ~6 flashcards + 4 MCQs using AI. Uses 1 of your daily AI calls."
                    : "Calls your AI provider (platform GLM by default, or your BYOK key in Profile)."}
                </span>
              </div>

              <button
                onClick={handleGenerate}
                disabled={busy}
                className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate
                  </>
                )}
              </button>

              <button
                onClick={() => openCreate(null)}
                className="w-full h-10 rounded-full text-gray-500 text-sm hover:bg-gray-100"
              >
                Back to options
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
