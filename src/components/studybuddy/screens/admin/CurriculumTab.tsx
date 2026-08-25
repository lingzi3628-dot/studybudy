"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  Check,
  Plus,
  Upload,
  FileText,
  RefreshCw,
  BookOpen,
  Layers,
  Brain,
  Lock,
  Trophy,
  Trash2,
  Send,
  Sparkles,
  Bot,
  MessageSquare,
} from "lucide-react";

type Grade = {
  id: string;
  name: string;
  level: string;
  orderIndex: number;
  status: "ready" | "coming_soon";
  description: string | null;
  _count?: { subjects: number; sourceDocs: number; exams: number };
};

type Subject = {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  orderIndex: number;
  _count?: { topics: number; sourceDocs: number };
};

type SourceDoc = {
  id: string;
  fileName: string;
  sourceType: string;
  parsingStatus: string;
  parseError: string | null;
  createdAt: string;
  grade?: { name: string };
  subject?: { name: string } | null;
};

/**
 * CurriculumTab — admin UI for the curriculum engine.
 *
 * Three sections:
 * 1. Grades — list + create + toggle status (ready / coming_soon)
 * 2. Upload — paste text or upload a PDF/DOC for a grade+subject, AI parses it
 * 3. Source docs — list of all uploaded docs with parse status + re-parse button
 */
export function CurriculumTab() {
  const [view, setView] = useState<"grades" | "upload" | "docs" | "exams" | "test">("grades");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-600" /> Curriculum Engine
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Upload PDFs or paste content per grade + subject. The AI parses it into
          topics, flashcards, and quiz questions — no more hallucination.
        </p>
      </div>

      {/* Section toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-medium overflow-x-auto">
        <button
          onClick={() => setView("grades")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "grades" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Layers className="w-3.5 h-3.5 inline mr-1" /> Grades
        </button>
        <button
          onClick={() => setView("upload")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "upload" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Upload className="w-3.5 h-3.5 inline mr-1" /> Upload
        </button>
        <button
          onClick={() => setView("docs")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "docs" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline mr-1" /> Docs
        </button>
        <button
          onClick={() => setView("exams")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "exams" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Trophy className="w-3.5 h-3.5 inline mr-1" /> Exams
        </button>
        <button
          onClick={() => setView("test")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "test" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 inline mr-1" /> Test
        </button>
      </div>

      {view === "grades" && <GradesView />}
      {view === "upload" && <UploadView />}
      {view === "docs" && <DocsView />}
      {view === "exams" && <ExamsView />}
      {view === "test" && <TestView />}
    </div>
  );
}

function GradesView() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState("primary");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedGradeId, setExpandedGradeId] = useState<string | null>(null);
  const [gradeSubjects, setGradeSubjects] = useState<Record<string, Subject[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/curriculum/grades");
      const d = await r.json();
      if (r.ok) setGrades(d.grades ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load subjects for a grade when it's expanded
  const loadGradeSubjects = useCallback(async (gradeId: string) => {
    try {
      const r = await fetch(`/api/admin/curriculum/subjects?gradeId=${gradeId}`);
      const d = await r.json();
      setGradeSubjects((prev) => ({ ...prev, [gradeId]: d.subjects ?? [] }));
    } catch {}
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/curriculum/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          level: newLevel,
          status: "coming_soon",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setNewName("");
      setToast(`✓ Created ${d.grade.name}`);
      setTimeout(() => setToast(null), 2500);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (g: Grade) => {
    const newStatus = g.status === "ready" ? "coming_soon" : "ready";
    if (newStatus === "ready") {
      const subjectCount = g._count?.subjects ?? 0;
      if (subjectCount === 0) {
        if (!confirm(
          `⚠️ ${g.name} has no subjects yet!\n\n` +
          `Students who select this grade will see an empty dashboard.\n\n` +
          `Are you sure you want to activate it now? (Recommended: upload at least 1 subject's content first.)`
        )) return;
      } else {
        if (!confirm(
          `Activate ${g.name}?\n\n` +
          `Students will now see this grade as selectable in onboarding and can start learning.\n\n` +
          `Current content: ${subjectCount} subject(s), ${g._count?.sourceDocs ?? 0} source doc(s).`
        )) return;
      }
    }
    setBusy(true);
    try {
      await fetch("/api/admin/curriculum/grades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, status: newStatus }),
      });
      setToast(
        newStatus === "ready"
          ? `✓ ${g.name} is now live — students can select it in onboarding!`
          : `↩ ${g.name} set to "Coming soon" — students won't see it as selectable.`
      );
      setTimeout(() => setToast(null), 3500);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleExpand = (gradeId: string) => {
    if (expandedGradeId === gradeId) {
      setExpandedGradeId(null);
    } else {
      setExpandedGradeId(gradeId);
      if (!gradeSubjects[gradeId]) {
        loadGradeSubjects(gradeId);
      }
    }
  };

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-center gap-2">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* Create new grade */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Add a new grade</h3>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Grade 2"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
          <select
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value)}
            className="px-2 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
          <button
            onClick={create}
            disabled={busy || !newName.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-rose-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
      </div>

      {/* Grades list */}
      <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-bold uppercase text-gray-500">
            Grades ({grades.length})
          </h3>
        </div>
        <ul className="divide-y divide-gray-100">
          {grades.length === 0 ? (
            <li className="px-4 py-8 text-center text-xs text-gray-400">
              No grades yet. Create one above or run <code>bun run scripts/seed-phase22.ts</code>.
            </li>
          ) : (
            grades.map((g) => {
              const subjectCount = g._count?.subjects ?? 0;
              const sourceDocCount = g._count?.sourceDocs ?? 0;
              const isReady = g.status === "ready";
              const canActivate = subjectCount > 0;
              const isExpanded = expandedGradeId === g.id;
              const subjects = gradeSubjects[g.id] ?? [];
              const totalTopics = subjects.reduce((sum, s) => sum + (s._count?.topics ?? 0), 0);

              return (
                <li key={g.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(g.id)}
                      className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"
                    >
                      {isExpanded ? "−" : "+"}
                    </button>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {g.level} · {subjectCount} subjects · {sourceDocCount} source docs
                      </p>
                    </div>
                    {/* Activation checklist badge */}
                    {isReady ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                        <Check className="w-3 h-3" /> Live
                      </span>
                    ) : canActivate ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                        <Check className="w-3 h-3" /> Ready to activate
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold">
                        <Lock className="w-3 h-3" /> Needs content
                      </span>
                    )}
                    {/* Activate/deactivate button */}
                    <button
                      onClick={() => toggleStatus(g)}
                      disabled={busy || (!canActivate && !isReady)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        isReady
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {isReady ? (
                        <><Lock className="w-3 h-3 inline" /> Deactivate</>
                      ) : (
                        <><Check className="w-3 h-3 inline" /> Activate grade</>
                      )}
                    </button>
                  </div>

                  {/* Expanded view — show subjects + topic counts + checklist */}
                  {isExpanded && (
                    <div className="mt-3 ml-9 p-3 rounded-xl bg-gray-50 border border-gray-200">
                      <p className="text-[10px] font-bold uppercase text-gray-500 mb-2">
                        Activation checklist
                      </p>
                      <ul className="space-y-1 mb-3">
                        <li className="flex items-center gap-2 text-xs">
                          <span className={subjectCount > 0 ? "text-emerald-600" : "text-gray-400"}>
                            {subjectCount > 0 ? "✓" : "○"}
                          </span>
                          <span className={subjectCount > 0 ? "text-gray-700" : "text-gray-400"}>
                            At least 1 subject uploaded ({subjectCount} so far)
                          </span>
                        </li>
                        <li className="flex items-center gap-2 text-xs">
                          <span className={totalTopics > 0 ? "text-emerald-600" : "text-gray-400"}>
                            {totalTopics > 0 ? "✓" : "○"}
                          </span>
                          <span className={totalTopics > 0 ? "text-gray-700" : "text-gray-400"}>
                            At least 1 topic parsed ({totalTopics} so far)
                          </span>
                        </li>
                        <li className="flex items-center gap-2 text-xs">
                          <span className={isReady ? "text-emerald-600" : "text-gray-400"}>
                            {isReady ? "✓" : "○"}
                          </span>
                          <span className={isReady ? "text-gray-700" : "text-gray-400"}>
                            Grade activated and visible to students
                          </span>
                        </li>
                      </ul>

                      {/* Subject breakdown */}
                      {subjects.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">
                            Subjects
                          </p>
                          <ul className="space-y-1">
                            {subjects.map((s) => (
                              <li key={s.id} className="flex items-center gap-2 text-xs">
                                <span>{s.icon}</span>
                                <span className="font-medium text-gray-700 flex-1">{s.name}</span>
                                <span className="text-gray-500">
                                  {s._count?.topics ?? 0} topics
                                </span>
                                <span className="text-gray-500">
                                  · {s._count?.sourceDocs ?? 0} docs
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">
                          No subjects yet — upload content via the &quot;Upload&quot; tab.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function UploadView() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("pasted-content.txt");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Load grades
  useEffect(() => {
    fetch("/api/admin/curriculum/grades")
      .then((r) => r.json())
      .then((d) => {
        setGrades(d.grades ?? []);
      })
      .catch(() => {});
  }, []);

  // Load subjects when grade changes
  useEffect(() => {
    if (!selectedGradeId) {
      setSubjects([]);
      return;
    }
    fetch(`/api/admin/curriculum/subjects?gradeId=${selectedGradeId}`)
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => setSubjects([]));
    setSelectedSubjectId("");
    setNewSubjectName("");
  }, [selectedGradeId]);

  const upload = async () => {
    if (!selectedGradeId) {
      setError("Please select a grade");
      return;
    }
    if (!selectedSubjectId && !newSubjectName.trim()) {
      setError("Please select an existing subject or enter a new subject name");
      return;
    }
    if (rawText.trim().length < 50) {
      setError("Content is too short — need at least 50 characters");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body: any = {
        gradeId: selectedGradeId,
        sourceType: "paste",
        fileName: fileName.trim() || "pasted-content.txt",
        rawText,
        parseNow: true,
      };
      if (selectedSubjectId) {
        body.subjectId = selectedSubjectId;
      } else {
        body.subjectName = newSubjectName.trim();
      }
      const r = await fetch("/api/admin/curriculum/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setResult(d);
      setRawText("");
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase text-gray-500">Upload curriculum content</h3>
        <p className="text-[11px] text-gray-500">
          Paste the textbook/notes content below. The AI will parse it into topics, flashcards, and quiz questions.
          Only content from the text will be used — no hallucination.
        </p>

        {/* Grade + subject selection */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Grade</label>
            <select
              value={selectedGradeId}
              onChange={(e) => setSelectedGradeId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Select grade…</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.status === "ready" ? "ready" : "soon"})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Existing subject (optional)</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={!selectedGradeId}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100"
            >
              <option value="">— create new —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!selectedSubjectId && (
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">
              New subject name
            </label>
            <input
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="e.g. Mathematics"
              disabled={!selectedGradeId}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:bg-gray-100"
            />
          </div>
        )}

        <div>
          <label className="text-[10px] font-bold uppercase text-gray-500">File name (for tracking)</label>
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase text-gray-500">Content (paste text here)</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the textbook content, notes, or lesson material here…"
            rows={10}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-mono outline-none focus:border-indigo-400"
          />
          <p className="text-[10px] text-gray-400 mt-1">{rawText.length} chars</p>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
            <p className="font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Parsed successfully!
            </p>
            {result.parseResult && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                <li>Topics: {result.parseResult.topicCount}</li>
                <li>Flashcards: {result.parseResult.flashcardCount}</li>
                <li>Quiz questions: {result.parseResult.quizQuestionCount}</li>
              </ul>
            )}
            {result.parseError && (
              <p className="mt-1 text-rose-600">Parse error: {result.parseError}</p>
            )}
          </div>
        )}

        <button
          onClick={upload}
          disabled={busy}
          className="w-full h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {busy ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> AI is parsing… (30-60s)</>
          ) : (
            <><Brain className="w-4 h-4" /> Upload &amp; parse with AI</>
          )}
        </button>
      </div>
    </div>
  );
}

function DocsView() {
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/curriculum/docs");
      const d = await r.json();
      setDocs(d.docs ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reparse = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch("/api/admin/curriculum/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDocId: id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      await load();
    } catch (e: any) {
      alert(`Re-parse failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase text-gray-500">
          Source docs ({docs.length})
        </h3>
        <button
          onClick={load}
          className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <ul className="divide-y divide-gray-100">
        {docs.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-gray-400">
            No source docs yet. Upload some via the &quot;Upload content&quot; tab.
          </li>
        ) : (
          docs.map((d) => (
            <li key={d.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{d.fileName}</p>
                  <p className="text-[11px] text-gray-500">
                    {d.grade?.name} · {d.subject?.name ?? "—"} · {d.sourceType}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(d.createdAt).toLocaleString()}
                  </p>
                  {d.parseError && (
                    <p className="text-[10px] text-rose-600 mt-1">Error: {d.parseError}</p>
                  )}
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    d.parsingStatus === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : d.parsingStatus === "failed"
                      ? "bg-rose-50 text-rose-700"
                      : d.parsingStatus === "processing"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-gray-50 text-gray-600"
                  }`}
                >
                  {d.parsingStatus}
                </span>
                <button
                  onClick={() => reparse(d.id)}
                  disabled={busy === d.id}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  {busy === d.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Re-parse
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// ExamsView — create + manage exams
// ---------------------------------------------------------------------

function ExamsView() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [newExamTitle, setNewExamTitle] = useState("");
  const [newExamDuration, setNewExamDuration] = useState("30");
  const [newExamPassThreshold, setNewExamPassThreshold] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load grades
  useEffect(() => {
    fetch("/api/admin/curriculum/grades")
      .then((r) => r.json())
      .then((d) => setGrades(d.grades ?? []))
      .catch(() => {});
  }, []);

  // Load subjects when grade changes
  useEffect(() => {
    if (!selectedGradeId) {
      setSubjects([]);
      return;
    }
    fetch(`/api/admin/curriculum/subjects?gradeId=${selectedGradeId}`)
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => setSubjects([]));
    setSelectedSubjectId("");
  }, [selectedGradeId]);

  // Load exams when subject changes
  const loadExams = useCallback(async () => {
    if (!selectedSubjectId) {
      setExams([]);
      return;
    }
    try {
      const r = await fetch(
        `/api/admin/curriculum/exams?gradeId=${selectedGradeId}&subjectId=${selectedSubjectId}`
      );
      const d = await r.json();
      setExams(d.exams ?? []);
    } catch {}
  }, [selectedGradeId, selectedSubjectId]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const createExam = async () => {
    if (!selectedGradeId || !selectedSubjectId || !newExamTitle.trim()) {
      setError("Select grade, subject, and enter a title");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/curriculum/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gradeId: selectedGradeId,
          subjectId: selectedSubjectId,
          title: newExamTitle.trim(),
          durationMinutes: Number(newExamDuration) || 30,
          passThreshold: Number(newExamPassThreshold) || 0.5,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setNewExamTitle("");
      await loadExams();
      setExpandedExamId(d.exam.id);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (examId: string, currentStatus: string) => {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    await fetch(`/api/admin/curriculum/exams/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadExams();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase text-gray-500">Create an exam</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Grade</label>
            <select
              value={selectedGradeId}
              onChange={(e) => setSelectedGradeId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Select…</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={!selectedGradeId}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100"
            >
              <option value="">Select…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-gray-500">Exam title</label>
          <input
            value={newExamTitle}
            onChange={(e) => setNewExamTitle(e.target.value)}
            placeholder="e.g. Grade 1 Mathematics End Term 1 Exam"
            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Duration (min)</label>
            <input
              type="number"
              value={newExamDuration}
              onChange={(e) => setNewExamDuration(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Pass threshold (0-1)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={newExamPassThreshold}
              onChange={(e) => setNewExamPassThreshold(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
            />
          </div>
        </div>
        <button
          onClick={createExam}
          disabled={busy}
          className="w-full h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create exam (draft)
        </button>
        {error && (
          <p className="text-xs text-rose-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
      </div>

      {/* Exams list */}
      <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-bold uppercase text-gray-500">
            Exams ({exams.length})
          </h3>
        </div>
        {exams.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-gray-400">
            No exams yet. Create one above.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {exams.map((exam) => (
              <li key={exam.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{exam.title}</p>
                    <p className="text-[11px] text-gray-500">
                      {exam.durationMinutes} min · {exam._count?.questions ?? 0} questions ·
                      Pass: {Math.round(exam.passThreshold * 100)}%
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      exam.status === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {exam.status}
                  </span>
                  <button
                    onClick={() => setExpandedExamId(expandedExamId === exam.id ? null : exam.id)}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    {expandedExamId === exam.id ? "Hide" : "Manage"}
                  </button>
                  <button
                    onClick={() => togglePublish(exam.id, exam.status)}
                    className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                      exam.status === "published"
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    } flex items-center gap-1`}
                  >
                    <Send className="w-3 h-3" />
                    {exam.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </div>
                {expandedExamId === exam.id && (
                  <ExamQuestionEditor examId={exam.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ExamQuestionEditor({ examId }: { examId: string }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQ, setNewQ] = useState({
    questionText: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    explanation: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/curriculum/exams/${examId}`);
      const d = await r.json();
      setQuestions(d.exam?.questions ?? []);
    } catch {}
  }, [examId]);

  useEffect(() => {
    load();
  }, [load]);

  const addQuestion = async () => {
    if (!newQ.questionText.trim()) return;
    if (newQ.options.filter((o) => o.trim()).length < 2) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/curriculum/exams/${examId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: newQ.questionText.trim(),
          options: newQ.options.map((o) => o.trim()).filter(Boolean),
          correctIndex: newQ.correctIndex,
          explanation: newQ.explanation.trim() || null,
        }),
      });
      setNewQ({ questionText: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    await fetch(`/api/admin/curriculum/exams/${examId}/questions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
    });
    await load();
  };

  return (
    <div className="mt-3 ml-4 p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
      <p className="text-[10px] font-bold uppercase text-gray-500">
        Questions ({questions.length})
      </p>
      {/* Existing questions */}
      {questions.length > 0 && (
        <ul className="space-y-1.5">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-lg bg-white border border-gray-200 p-2 flex items-start gap-2">
              <span className="text-[10px] font-bold text-gray-400 mt-0.5">{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900">{q.questionText}</p>
                <p className="text-[10px] text-gray-500">
                  Correct: {String.fromCharCode(65 + q.correctIndex)}. {q.options?.[q.correctIndex]}
                </p>
              </div>
              <button
                onClick={() => deleteQuestion(q.id)}
                className="text-rose-500 hover:text-rose-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new question */}
      <div className="space-y-2 pt-2 border-t border-gray-200">
        <input
          value={newQ.questionText}
          onChange={(e) => setNewQ({ ...newQ, questionText: e.target.value })}
          placeholder="Question text"
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs"
        />
        <div className="space-y-1">
          {newQ.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <button
                onClick={() => setNewQ({ ...newQ, correctIndex: oi })}
                className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  newQ.correctIndex === oi
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {String.fromCharCode(65 + oi)}
              </button>
              <input
                value={opt}
                onChange={(e) => {
                  const newOptions = [...newQ.options];
                  newOptions[oi] = e.target.value;
                  setNewQ({ ...newQ, options: newOptions });
                }}
                placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                className="flex-1 px-2 py-1 rounded border border-gray-200 text-xs"
              />
            </div>
          ))}
        </div>
        <input
          value={newQ.explanation}
          onChange={(e) => setNewQ({ ...newQ, explanation: e.target.value })}
          placeholder="Explanation (optional)"
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs"
        />
        <button
          onClick={addQuestion}
          disabled={busy}
          className="w-full h-8 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add question
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// TestView — preview AI tutor + flashcards + quiz for any subject
// ---------------------------------------------------------------------

function TestView() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicData, setTopicData] = useState<any | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [testTab, setTestTab] = useState<"lesson" | "flashcards" | "quiz" | "tutor">("lesson");

  // AI tutor state
  const [tutorMessages, setTutorMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [tutorInput, setTutorInput] = useState("");
  const [tutorBusy, setTutorBusy] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);

  // Load grades
  useEffect(() => {
    fetch("/api/admin/curriculum/grades")
      .then((r) => r.json())
      .then((d) => setGrades(d.grades ?? []))
      .catch(() => {});
  }, []);

  // Load subjects when grade changes
  useEffect(() => {
    if (!selectedGradeId) {
      setSubjects([]);
      return;
    }
    fetch(`/api/admin/curriculum/subjects?gradeId=${selectedGradeId}`)
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => setSubjects([]));
    setSelectedSubjectId("");
    setTopics([]);
  }, [selectedGradeId]);

  // Load topics when subject changes
  useEffect(() => {
    if (!selectedSubjectId) {
      setTopics([]);
      return;
    }
    fetch(`/api/curriculum/topics?subjectId=${selectedSubjectId}`)
      .then((r) => r.json())
      .then((d) => setTopics(d.topics ?? []))
      .catch(() => setTopics([]));
    setSelectedTopicId(null);
    setTopicData(null);
  }, [selectedSubjectId]);

  // Load topic detail when a topic is selected
  useEffect(() => {
    if (!selectedTopicId) {
      setTopicData(null);
      return;
    }
    setLoadingTopic(true);
    fetch(`/api/curriculum/topic/${selectedTopicId}`)
      .then((r) => r.json())
      .then((d) => setTopicData(d.topic ?? null))
      .catch(() => setTopicData(null))
      .finally(() => setLoadingTopic(false));
  }, [selectedTopicId]);

  // AI tutor send (uses the admin's token, simulates a student asking questions)
  const sendTutor = async (text?: string) => {
    const q = (text ?? tutorInput).trim();
    if (!q || tutorBusy) return;
    setTutorInput("");
    setTutorBusy(true);
    setTutorError(null);
    const next = [...tutorMessages, { role: "user" as const, content: q }];
    setTutorMessages(next);
    try {
      const r = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          messages: next.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setTutorMessages((m) => [...m, { role: "assistant", content: d.reply }]);
    } catch (e: any) {
      setTutorError(e?.message ?? "AI tutor failed");
    } finally {
      setTutorBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase text-gray-500 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" /> Test curriculum content
        </h3>
        <p className="text-[11px] text-gray-500">
          Pick a grade + subject to preview the lesson, flashcards, quiz, and AI tutor —
          exactly as a student would see them.
        </p>

        {/* Grade + subject selectors */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Grade</label>
            <select
              value={selectedGradeId}
              onChange={(e) => setSelectedGradeId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Select grade…</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={!selectedGradeId}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100"
            >
              <option value="">Select subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Topics list */}
        {topics.length > 0 && (
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500">
              Topics ({topics.length})
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {topics.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTopicId(t.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                    selectedTopicId === t.id
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {i + 1}. {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Topic preview */}
      {loadingTopic && (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </div>
      )}

      {topicData && !loadingTopic && (
        <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
          {/* Topic header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100">
            <p className="text-sm font-bold text-gray-900">{topicData.name}</p>
            <p className="text-[11px] text-gray-500">
              {topicData.subject?.gradeName} · {topicData.subject?.name} · {topicData.estimatedMin} min
            </p>
          </div>

          {/* Test tab bar */}
          <div className="flex gap-1 p-2 bg-gray-50 border-b border-gray-100">
            {[
              { key: "lesson" as const, label: "📖 Lesson" },
              { key: "flashcards" as const, label: `🎴 Cards (${topicData.flashcards?.length ?? 0})` },
              { key: "quiz" as const, label: `❓ Quiz (${topicData.quizQuestions?.length ?? 0})` },
              { key: "tutor" as const, label: "🤖 AI Tutor" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTestTab(t.key)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition ${
                  testTab === t.key ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4 max-h-[500px] overflow-y-auto">
            {testTab === "lesson" && (
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {topicData.summary && (
                  <div className="mb-3 p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs">
                    <strong>Summary:</strong> {topicData.summary}
                  </div>
                )}
                <div className="prose prose-sm max-w-none">
                  <TopicMarkdown content={topicData.contentMarkdown ?? ""} />
                </div>
              </div>
            )}

            {testTab === "flashcards" && (
              <FlashcardPreview flashcards={topicData.flashcards ?? []} />
            )}

            {testTab === "quiz" && (
              <QuizPreview questions={topicData.quizQuestions ?? []} />
            )}

            {testTab === "tutor" && (
              <div className="space-y-2">
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-2 text-[11px] text-violet-700">
                  <Bot className="w-3.5 h-3.5 inline mr-1" />
                  The AI tutor is loaded with this grade&apos;s curriculum. Ask it anything a
                  student might ask — it will answer based on the curated content.
                </div>
                {/* Messages */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {tutorMessages.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">
                      No messages yet. Ask a question below.
                    </p>
                  )}
                  {tutorMessages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                          m.role === "user"
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {tutorBusy && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-2xl px-3 py-2 text-xs text-gray-500 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                      </div>
                    </div>
                  )}
                </div>
                {tutorError && (
                  <p className="text-[11px] text-rose-600">{tutorError}</p>
                )}
                {/* Suggested questions */}
                {tutorMessages.length === 0 && (
                  <div className="flex flex-wrap gap-1">
                    {["What did I learn?", "Explain the main idea", "Give me a quiz question"].map((s) => (
                      <button
                        key={s}
                        onClick={() => sendTutor(s)}
                        disabled={tutorBusy}
                        className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {/* Input */}
                <form
                  onSubmit={(e) => { e.preventDefault(); sendTutor(); }}
                  className="flex gap-2 pt-2 border-t border-gray-100"
                >
                  <input
                    value={tutorInput}
                    onChange={(e) => setTutorInput(e.target.value)}
                    placeholder="Ask the AI tutor…"
                    disabled={tutorBusy}
                    className="flex-1 px-3 py-2 rounded-full bg-gray-100 text-xs outline-none focus:ring-2 focus:ring-indigo-200 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={tutorBusy || !tutorInput.trim()}
                    className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-indigo-700"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedGradeId && (
        <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
          <Sparkles className="w-8 h-8 text-gray-400 mx-auto" />
          <p className="mt-2 text-sm text-gray-600">
            Select a grade and subject above to preview the content.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Simple markdown renderer for the topic lesson preview
// ---------------------------------------------------------------------

function TopicMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="my-2 text-sm leading-relaxed text-gray-800">
          {paragraph.join(" ")}
        </p>
      );
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-2 ml-5 list-disc space-y-1 text-sm text-gray-800">
          {listItems.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("## ")) { flushParagraph(); flushList(); blocks.push(<h2 key={`h-${blocks.length}`} className="text-base font-bold mt-3 mb-1">{t.slice(3)}</h2>); }
    else if (t.startsWith("# ")) { flushParagraph(); flushList(); blocks.push(<h1 key={`h-${blocks.length}`} className="text-lg font-bold mt-3 mb-1">{t.slice(2)}</h1>); }
    else if (t.startsWith("### ")) { flushParagraph(); flushList(); blocks.push(<h3 key={`h-${blocks.length}`} className="text-sm font-bold mt-2 mb-1">{t.slice(4)}</h3>); }
    else if (/^\d+\.\s/.test(t)) { flushParagraph(); listItems.push(t.replace(/^\d+\.\s/, "")); }
    else if (t.startsWith("- ") || t.startsWith("* ")) { flushParagraph(); listItems.push(t.slice(2)); }
    else if (t === "") { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(t); }
  }
  flushParagraph(); flushList();
  return <>{blocks}</>;
}

// ---------------------------------------------------------------------
// Flashcard preview (inline, no flip — just show front + back)
// ---------------------------------------------------------------------

function FlashcardPreview({ flashcards }: { flashcards: Array<{ id: string; front: string; back: string }> }) {
  if (flashcards.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">No flashcards for this topic.</p>;
  }
  return (
    <div className="space-y-2">
      {flashcards.map((fc, i) => (
        <div key={fc.id} className="rounded-xl border border-gray-200 p-3">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-bold text-indigo-500 mt-0.5">Q{i + 1}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{fc.front}</p>
              <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                <p className="text-[10px] font-bold uppercase text-emerald-600 mb-0.5">Answer</p>
                <p className="text-xs text-gray-700">{fc.back}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Quiz preview (inline — show questions + correct answers highlighted)
// ---------------------------------------------------------------------

function QuizPreview({ questions }: { questions: Array<{ id: string; questionText: string; options: string[]; correctIndex: number; explanation: string | null }> }) {
  if (questions.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">No quiz questions for this topic.</p>;
  }
  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-xl border border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-900 mb-2">
            <span className="text-indigo-500 mr-1">{qi + 1}.</span>
            {q.questionText}
          </p>
          <div className="space-y-1">
            {q.options.map((opt, oi) => (
              <div
                key={oi}
                className={`px-2 py-1.5 rounded-lg border text-xs ${
                  oi === q.correctIndex
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                <span className="font-mono mr-1">{String.fromCharCode(65 + oi)}.</span>
                {opt}
                {oi === q.correctIndex && <Check className="w-3 h-3 inline ml-1" />}
              </div>
            ))}
          </div>
          {q.explanation && (
            <p className="mt-2 text-[11px] text-gray-500 italic">💡 {q.explanation}</p>
          )}
        </div>
      ))}
    </div>
  );
}
