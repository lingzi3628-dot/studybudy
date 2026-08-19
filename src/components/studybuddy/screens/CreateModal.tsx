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
  Trash2,
  Pencil,
  FileText,
  Send,
  ChevronLeft,
  Plus,
  Map as MapIcon,
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
  { key: "upload", label: "Upload PDF / Text", desc: "Extract text from a file then generate", icon: UploadCloud, color: "bg-indigo-50 text-indigo-600" },
  { key: "paste", label: "Paste Text", desc: "Paste notes to convert into learning", icon: Clipboard, color: "bg-violet-50 text-violet-600" },
  { key: "flashcards", label: "Generate Flashcards", desc: "Quick Q/A cards from any topic", icon: Layers, color: "bg-amber-50 text-amber-600" },
  { key: "quiz", label: "Generate Quiz", desc: "MCQ-only set with explanations", icon: ListChecks, color: "bg-emerald-50 text-emerald-600" },
  { key: "graph", label: "Draw Graph", desc: "Visualise equations with Recharts", icon: LineChart, color: "bg-sky-50 text-sky-600" },
  { key: "tutor", label: "Ask AI Tutor", desc: "Conversational help on any concept", icon: Bot, color: "bg-rose-50 text-rose-600" },
  { key: "path", label: "Create Learning Path", desc: "Build a 4-week roadmap", icon: Route, color: "bg-teal-50 text-teal-600" },
  { key: "conceptMap", label: "Generate Concept Map", desc: "Visual node graph of any topic", icon: MapIcon, color: "bg-fuchsia-50 text-fuchsia-600" },
];

type GenFlashcard = { front: string; back: string };
type GenMcq = { question: string; options: string[]; correct_index: number; explanation: string };
type GenResult = { flashcards: GenFlashcard[]; mcqs: GenMcq[] };

type ModalStep = "picker" | "input" | "generating" | "preview" | "saving" | "success";

export function CreateModal() {
  const {
    createOpen,
    closeCreate,
    createOption,
    openCreate,
    setScreen,
    setActiveStudySetId,
  } = useApp();

  const [step, setStep] = useState<ModalStep>("picker");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [numFlashcards, setNumFlashcards] = useState(6);
  const [numMCQs, setNumMCQs] = useState(4);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [generated, setGenerated] = useState<GenResult | null>(null);
  const [editedFlashcards, setEditedFlashcards] = useState<GenFlashcard[]>([]);
  const [editedMcqs, setEditedMcqs] = useState<GenMcq[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSetId, setSavedSetId] = useState<string | null>(null);

  useEffect(() => {
    if (createOpen) {
      setStep("picker");
      setText("");
      setTitle("");
      setSubject("");
      setTopic("");
      setFile(null);
      setExtracting(false);
      setGenerated(null);
      setEditedFlashcards([]);
      setEditedMcqs([]);
      setBusy(false);
      setError(null);
      setSavedSetId(null);
    }
  }, [createOpen]);

  // pick defaults when option changes
  useEffect(() => {
    if (createOption === "flashcards") {
      setNumFlashcards(6);
      setNumMCQs(4);
    } else if (createOption === "quiz") {
      setNumFlashcards(0);
      setNumMCQs(8);
    } else if (createOption === "paste" || createOption === "upload") {
      setNumFlashcards(6);
      setNumMCQs(4);
    }
  }, [createOption]);

  if (!createOpen) return null;

  // ============ "picker" step — render all 7 options ============
  if (step === "picker" && !createOption) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={closeCreate} aria-hidden />
        <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4">
          <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Create New</h2>
            <button
              onClick={closeCreate}
              aria-label="Close"
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5">
            <div className="space-y-2.5">
              {options.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.key}
                    onClick={() => {
                      // Graph/Tutor/Path/ConceptMap → redirect to dedicated full screens
                      if (o.key === "graph") {
                        closeCreate();
                        setScreen("graph");
                        return;
                      }
                      if (o.key === "tutor") {
                        closeCreate();
                        setScreen("tutor");
                        return;
                      }
                      if (o.key === "path") {
                        closeCreate();
                        setScreen("path");
                        return;
                      }
                      if (o.key === "conceptMap") {
                        closeCreate();
                        // Clear activeConceptMapId so the screen shows the "create new" view
                        useApp.getState().setActiveConceptMapId(null);
                        setScreen("conceptMap");
                        return;
                      }
                      openCreate(o.key);
                      setStep("input");
                    }}
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
          </div>
        </div>
      </div>
    );
  }

  // ============ "success" step ============
  if (step === "success" && savedSetId) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={closeCreate} aria-hidden />
        <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-gray-900">Study set saved!</h3>
            <p className="mt-1 text-sm text-gray-500">
              {editedFlashcards.length + editedMcqs.length} cards ready to study.
            </p>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => {
                  setActiveStudySetId(savedSetId);
                  closeCreate();
                  setScreen("quiz");
                }}
                className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700"
              >
                Start studying now
              </button>
              <button
                onClick={() => openCreate(null)}
                className="w-full h-10 rounded-full text-gray-500 text-sm hover:bg-gray-100"
              >
                Create another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ "generating" / "saving" step ============
  if (step === "generating" || step === "saving") {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/40" aria-hidden />
        <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 text-center">
          <Loader2 className="w-8 h-8 mx-auto text-indigo-600 animate-spin" />
          <h3 className="mt-3 text-base font-semibold text-gray-900">
            {step === "generating" ? "Generating with AI…" : "Saving to database…"}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {step === "generating"
              ? `Asking the AI to write ${numFlashcards > 0 ? `${numFlashcards} flashcard${numFlashcards === 1 ? "" : "s"}` : ""}${numFlashcards > 0 && numMCQs > 0 ? " and " : ""}${numMCQs > 0 ? `${numMCQs} MCQ${numMCQs === 1 ? "" : "s"}` : ""}.`
              : "Writing cards to your Neon Postgres database."}
          </p>
        </div>
      </div>
    );
  }

  // ============ "preview" step — edit/delete cards then save ============
  if (step === "preview" && generated) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={closeCreate} aria-hidden />
        <div className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => {
                  setStep("input");
                  setGenerated(null);
                }}
                aria-label="Back"
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-gray-900 truncate">
                Preview &amp; Edit
              </h2>
            </div>
            <button
              onClick={closeCreate}
              aria-label="Close"
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-500">Flashcards</p>
                <p className="font-semibold text-gray-900">{editedFlashcards.length}</p>
              </div>
              <div>
                <p className="text-gray-500">MCQs</p>
                <p className="font-semibold text-gray-900">{editedMcqs.length}</p>
              </div>
            </div>

            {editedFlashcards.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Flashcards</h3>
                <div className="space-y-2">
                  {editedFlashcards.map((c, i) => (
                    <div key={i} className="rounded-2xl border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 space-y-1">
                          <input
                            value={c.front}
                            onChange={(e) => {
                              setEditedFlashcards((arr) => arr.map((x, j) => j === i ? { ...x, front: e.target.value } : x));
                            }}
                            className="w-full text-sm font-medium text-gray-900 bg-transparent outline-none border-b border-transparent focus:border-indigo-300"
                          />
                          <input
                            value={c.back}
                            onChange={(e) => {
                              setEditedFlashcards((arr) => arr.map((x, j) => j === i ? { ...x, back: e.target.value } : x));
                            }}
                            className="w-full text-xs text-gray-600 bg-transparent outline-none border-b border-transparent focus:border-indigo-300"
                          />
                        </div>
                        <button
                          onClick={() => setEditedFlashcards((arr) => arr.filter((_, j) => j !== i))}
                          className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editedMcqs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Multiple-choice questions</h3>
                <div className="space-y-2">
                  {editedMcqs.map((c, i) => (
                    <div key={i} className="rounded-2xl border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 space-y-1.5">
                          <input
                            value={c.question}
                            onChange={(e) => {
                              setEditedMcqs((arr) => arr.map((x, j) => j === i ? { ...x, question: e.target.value } : x));
                            }}
                            className="w-full text-sm font-medium text-gray-900 bg-transparent outline-none border-b border-transparent focus:border-emerald-300"
                          />
                          {c.options.map((opt, j) => (
                            <div key={j} className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                checked={c.correct_index === j}
                                onChange={() => {
                                  setEditedMcqs((arr) => arr.map((x, k) => k === i ? { ...x, correct_index: j } : x));
                                }}
                                className="w-3 h-3 accent-emerald-500"
                              />
                              <input
                                value={opt}
                                onChange={(e) => {
                                  setEditedMcqs((arr) => arr.map((x, k) => k === i ? { ...x, options: x.options.map((o, l) => l === j ? e.target.value : o) } : x));
                                }}
                                className="flex-1 text-xs text-gray-700 bg-transparent outline-none border-b border-transparent focus:border-emerald-300"
                              />
                            </div>
                          ))}
                          <input
                            value={c.explanation}
                            onChange={(e) => {
                              setEditedMcqs((arr) => arr.map((x, j) => j === i ? { ...x, explanation: e.target.value } : x));
                            }}
                            className="w-full text-xs italic text-gray-500 bg-transparent outline-none border-b border-transparent focus:border-emerald-300"
                          />
                        </div>
                        <button
                          onClick={() => setEditedMcqs((arr) => arr.filter((_, j) => j !== i))}
                          className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={async () => {
                setStep("saving");
                setError(null);
                try {
                  // Pass the edited cards directly — no AI re-generation needed
                  const cardsToSave = [
                    ...editedFlashcards.map((c) => ({
                      cardType: "flashcard" as const,
                      front: c.front,
                      back: c.back,
                      question: null,
                      options: null,
                      correctIndex: null,
                      explanation: null,
                    })),
                    ...editedMcqs.map((c) => ({
                      cardType: "mcq" as const,
                      front: null,
                      back: null,
                      question: c.question,
                      options: c.options,
                      correctIndex: c.correct_index,
                      explanation: c.explanation,
                    })),
                  ];

                  const res = await api.createStudySet({
                    title: title || "Untitled set",
                    sourceType: createOption === "upload" ? "pdf" : "text",
                    sourceText: text,
                    subject: subject || undefined,
                    topic: topic || undefined,
                    generate: false,
                    cards: cardsToSave,
                  });
                  setSavedSetId(res.studySet.id);
                  setStep("success");
                } catch (e: any) {
                  setError(e?.message ?? "Save failed");
                  setStep("preview");
                }
              }}
              disabled={busy || (editedFlashcards.length === 0 && editedMcqs.length === 0)}
              className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" /> Save Study Set
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ "input" step — option-specific input form ============
  // Determine config per option
  const cfg = createOption
    ? {
        upload: { title: "Upload a file", icon: UploadCloud, color: "bg-indigo-50 text-indigo-600" },
        paste: { title: "Paste your text", icon: Clipboard, color: "bg-violet-50 text-violet-600" },
        flashcards: { title: "Generate flashcards", icon: Layers, color: "bg-amber-50 text-amber-600" },
        quiz: { title: "Generate a quiz", icon: ListChecks, color: "bg-emerald-50 text-emerald-600" },
      }[createOption as "upload" | "paste" | "flashcards" | "quiz"]
    : null;

  if (!cfg) {
    // unknown option — close
    return null;
  }

  const Icon = cfg.icon;

  const handleGenerate = async () => {
    if (createOption === "upload" && !text.trim()) {
      setError("Please upload a file and extract text first.");
      return;
    }
    if ((createOption === "paste" || createOption === "flashcards" || createOption === "quiz") && !text.trim()) {
      setError("Please enter some text or topic first.");
      return;
    }
    setStep("generating");
    setError(null);
    try {
      const result = await api.generateCards({
        text,
        numFlashcards,
        numMCQs,
        subject: subject || undefined,
        topic: topic || undefined,
      });
      setGenerated(result);
      setEditedFlashcards(result.flashcards);
      setEditedMcqs(result.mcqs);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
      setStep("input");
    }
  };

  const handleFilePick = async (f: File) => {
    setFile(f);
    setExtracting(true);
    setError(null);
    setText("");
    try {
      const r = await api.extractFile(f);
      setText(r.text);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) {
      setError(e?.message ?? "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeCreate} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => openCreate(null)}
              aria-label="Back"
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 truncate">{cfg.title}</h2>
          </div>
          <button
            onClick={closeCreate}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* File upload for "upload" option */}
          {createOption === "upload" && (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center">
              <input
                type="file"
                accept=".pdf,.txt,.md,.markdown,.csv,application/pdf,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePick(f);
                }}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="cursor-pointer inline-flex flex-col items-center gap-2">
                <span className={`w-12 h-12 rounded-full flex items-center justify-center ${cfg.color}`}>
                  {extracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {extracting ? "Extracting text…" : file ? file.name : "Tap to pick a PDF or .txt"}
                </span>
                <span className="text-xs text-gray-400">PDF or .txt up to 5 MB</span>
              </label>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "Auto-generated if empty"}
              className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Subject + Topic */}
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

          {/* Counts — show for flashcards & quiz */}
          {(createOption === "flashcards" || createOption === "quiz") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Flashcards
                </label>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={numFlashcards}
                  onChange={(e) => setNumFlashcards(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
                  className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">MCQs</label>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={numMCQs}
                  onChange={(e) => setNumMCQs(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
                  className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
          )}

          {/* Textarea (paste / upload extracted text / flashcards source / quiz source) */}
          {createOption !== "upload" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {createOption === "flashcards" || createOption === "quiz"
                  ? "Topic description or source text"
                  : "Content"}
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder={
                  createOption === "flashcards" || createOption === "quiz"
                    ? "e.g. Explain photosynthesis including the chemical equation and key organelles."
                    : "Paste your notes, article, or text here..."
                }
                className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                {text.length} chars
              </p>
            </div>
          )}

          {/* For upload — also show extracted text */}
          {createOption === "upload" && text && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                <span>Extracted text (editable)</span>
                <span className="text-[11px] font-normal text-gray-400">{text.length} chars</span>
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Extracted text will appear here..."
                className="mt-1.5 w-full p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none font-mono"
              />
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
              Generates {numFlashcards > 0 ? `${numFlashcards} flashcards` : ""}
              {numFlashcards > 0 && numMCQs > 0 ? " + " : ""}
              {numMCQs > 0 ? `${numMCQs} MCQs` : ""} using AI · uses 1 daily call
            </span>
          </div>

          <button
            onClick={handleGenerate}
            disabled={busy || !text.trim()}
            className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> Generate
          </button>

          <button
            onClick={() => openCreate(null)}
            className="w-full h-10 rounded-full text-gray-500 text-sm hover:bg-gray-100"
          >
            Back to options
          </button>
        </div>
      </div>
    </div>
  );
}
