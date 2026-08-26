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
  LockOpen,
  Trophy,
  Trash2,
  Send,
  Sparkles,
  Bot,
  MessageSquare,
  Bell,
  Image as ImageIcon,
  Palette,
  ChevronLeft,
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
  const [view, setView] = useState<"grades" | "subjects" | "upload" | "docs" | "exams" | "test" | "notifications" | "library">("grades");

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
          onClick={() => setView("subjects")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "subjects" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Palette className="w-3.5 h-3.5 inline mr-1" /> Subjects
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
        <button
          onClick={() => setView("notifications")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "notifications" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Bell className="w-3.5 h-3.5 inline mr-1" /> Notify
        </button>
        <button
          onClick={() => setView("library")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
            view === "library" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          📚 Library
        </button>
      </div>

      {view === "grades" && <GradesView />}
      {view === "subjects" && <SubjectsDesignView />}
      {view === "upload" && <UploadView />}
      {view === "docs" && <DocsView />}
      {view === "exams" && <ExamsView />}
      {view === "test" && <TestView />}
      {view === "notifications" && <NotificationsView />}
      {view === "library" && <LibraryAdminView />}
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

// ---------------------------------------------------------------------
// SubjectsDesignView — design subject cards (rename, image, color, lock/unlock)
// ---------------------------------------------------------------------

function SubjectsDesignView() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/curriculum/grades")
      .then((r) => r.json())
      .then((d) => setGrades(d.grades ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedGradeId) {
      setSubjects([]);
      return;
    }
    fetch(`/api/admin/curriculum/subjects?gradeId=${selectedGradeId}`)
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => setSubjects([]));
  }, [selectedGradeId]);

  const startEdit = (s: any) => {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      icon: s.icon,
      imageUrl: s.imageUrl ?? "",
      color: s.color,
      description: s.description ?? "",
      status: s.status,
      orderIndex: s.orderIndex,
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/curriculum/subjects/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          icon: editForm.icon,
          imageUrl: editForm.imageUrl || null,
          color: editForm.color,
          description: editForm.description || null,
          status: editForm.status,
          orderIndex: Number(editForm.orderIndex) || 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setEditingId(null);
      setToast(d.message ?? "✓ Saved");
      setTimeout(() => setToast(null), 3000);
      // Reload subjects
      const sr = await fetch(`/api/admin/curriculum/subjects?gradeId=${selectedGradeId}`);
      const sd = await sr.json();
      setSubjects(sd.subjects ?? []);
    } catch (e: any) {
      setToast(`✗ ${e?.message ?? "Failed"}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async (s: any) => {
    const newStatus = s.status === "locked" ? "unlocked" : "locked";
    if (newStatus === "unlocked" && (s._count?.topics ?? 0) === 0) {
      if (!confirm(`⚠️ ${s.name} has 0 topics. Students will see an empty subject.\n\nUnlock anyway?`)) return;
    } else if (newStatus === "unlocked") {
      if (!confirm(`Unlock ${s.name}?\n\nStudents will see this subject on their dashboard and you'll be able to notify them via WhatsApp/email.`)) return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/curriculum/subjects/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setToast(d.message ?? `✓ ${s.name} ${newStatus === "unlocked" ? "unlocked" : "locked"}`);
      setTimeout(() => setToast(null), 4000);
      const sr = await fetch(`/api/admin/curriculum/subjects?gradeId=${selectedGradeId}`);
      const sd = await sr.json();
      setSubjects(sd.subjects ?? []);
    } catch (e: any) {
      setToast(`✗ ${e?.message ?? "Failed"}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {toast && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-700 flex items-center gap-2">
          {toast}
        </div>
      )}

      {/* Grade selector */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        <label className="text-[10px] font-bold uppercase text-gray-500">Select grade</label>
        <select
          value={selectedGradeId}
          onChange={(e) => setSelectedGradeId(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
        >
          <option value="">Select grade…</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Subjects list */}
      {selectedGradeId && (
        <div className="space-y-2">
          {subjects.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
              <Palette className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="mt-2 text-sm text-gray-600">No subjects yet for this grade.</p>
              <p className="text-xs text-gray-400 mt-1">Upload content via the &quot;Upload&quot; tab first.</p>
            </div>
          ) : (
            subjects.map((s) => (
              <div key={s.id} className="rounded-2xl bg-white border border-gray-200 p-3">
                {editingId === s.id ? (
                  // --- Edit mode ---
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold uppercase text-gray-500">Editing subject</p>
                      <div className="flex gap-1">
                        <button
                          onClick={save}
                          disabled={busy}
                          className="px-3 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 inline" />} Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500">Name</label>
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500">Icon (emoji)</label>
                        <input
                          value={editForm.icon}
                          onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                          placeholder="🔢"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Image URL (optional — shown on dashboard card)
                      </label>
                      <input
                        value={editForm.imageUrl}
                        onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                        placeholder="https://example.com/math.png"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500">Color (hex)</label>
                        <div className="flex gap-1 items-center">
                          <input
                            type="color"
                            value={editForm.color}
                            onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                            className="w-10 h-9 rounded border border-gray-200"
                          />
                          <input
                            value={editForm.color}
                            onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                            className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500">Order</label>
                        <input
                          type="number"
                          value={editForm.orderIndex}
                          onChange={(e) => setEditForm({ ...editForm, orderIndex: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-500">Description (shown on card)</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={2}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                        placeholder="Learn numbers, shapes, and basic counting…"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-500">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
                      >
                        <option value="locked">🔒 Locked (students can&apos;t access yet)</option>
                        <option value="unlocked">🔓 Unlocked (students can study)</option>
                      </select>
                    </div>

                    {/* Live preview */}
                    <div className="mt-2 p-3 rounded-xl bg-gray-50 border border-gray-200">
                      <p className="text-[10px] font-bold uppercase text-gray-500 mb-2">Preview (dashboard card)</p>
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-gray-200 max-w-[200px]">
                        {editForm.imageUrl ? (
                          <img src={editForm.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                        ) : (
                          <span
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-base"
                            style={{ backgroundColor: editForm.color + "20" }}
                          >
                            {editForm.icon || "📚"}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{editForm.name || "Subject name"}</p>
                          <p className="text-[10px] text-gray-500">
                            {editForm.status === "locked" ? "🔒 Coming soon" : "3 topics"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // --- View mode ---
                  <div className="flex items-center gap-3">
                    {/* Subject image / icon */}
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt={s.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <span
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: s.color + "20" }}
                      >
                        {s.icon}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{s.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {s._count?.topics ?? 0} topics · {s._count?.sourceDocs ?? 0} docs
                      </p>
                      {s.description && (
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{s.description}</p>
                      )}
                    </div>
                    {/* Lock/unlock status */}
                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        s.status === "unlocked"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {s.status === "unlocked" ? "🔓 Unlocked" : "🔒 Locked"}
                    </span>
                    {/* Toggle lock button */}
                    <button
                      onClick={() => toggleLock(s)}
                      disabled={busy}
                      className={`px-2 py-1.5 rounded-full text-[11px] font-bold transition ${
                        s.status === "unlocked"
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      } disabled:opacity-50`}
                    >
                      {s.status === "unlocked" ? (
                        <><Lock className="w-3 h-3 inline" /> Lock</>
                      ) : (
                        <><LockOpen className="w-3 h-3 inline" /> Unlock</>
                      )}
                    </button>
                    {/* Edit button */}
                    <button
                      onClick={() => startEdit(s)}
                      className="px-2 py-1.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200"
                    >
                      <Palette className="w-3 h-3 inline" /> Design
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// NotificationsView — see pending/sent notifications
// ---------------------------------------------------------------------

function NotificationsView() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterChannel, setFilterChannel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterChannel) params.set("channel", filterChannel);
    try {
      const r = await fetch(`/api/admin/notifications?${params.toString()}`);
      const d = await r.json();
      setNotifications(d.notifications ?? []);
      setSummary(d.summary ?? {});
    } catch {}
    setLoading(false);
  }, [filterStatus, filterChannel]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{summary.pending_total ?? 0}</p>
          <p className="text-[10px] font-bold uppercase text-amber-600">Pending</p>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{summary.sent_total ?? 0}</p>
          <p className="text-[10px] font-bold uppercase text-emerald-600">Sent</p>
        </div>
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-center">
          <p className="text-2xl font-bold text-rose-700">{summary.failed_total ?? 0}</p>
          <p className="text-[10px] font-bold uppercase text-rose-600">Failed</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white border border-gray-200 p-3 flex gap-2 items-center">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
        >
          <option value="">All channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
        <button
          onClick={load}
          className="ml-auto text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Notifications list */}
      {loading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
          <Bell className="w-8 h-8 text-gray-400 mx-auto" />
          <p className="mt-2 text-sm text-gray-600">No notifications yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Notifications are created automatically when you unlock a subject.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                      n.channel === "whatsapp" ? "bg-emerald-50 text-emerald-600" :
                      n.channel === "sms" ? "bg-blue-50 text-blue-600" :
                      "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    {n.channel === "whatsapp" ? "💬" : n.channel === "sms" ? "📱" : "📧"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{n.subject}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{n.body}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                      <span>To: <strong>{n.recipient}</strong></span>
                      {n.user?.name && <span>· {n.user.name}</span>}
                      {n.user?.grade && <span>· {n.user.grade}</span>}
                      <span>· {new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      n.status === "sent" ? "bg-emerald-50 text-emerald-700" :
                      n.status === "failed" ? "bg-rose-50 text-rose-700" :
                      "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {n.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-[11px] text-indigo-700">
        <strong>💡 How it works:</strong> When you unlock a subject in the &quot;Subjects&quot; tab,
        a notification is created for every user who has that grade set. Notifications
        are stored here as <em>pending</em> — they&apos;ll be sent via WhatsApp/SMS/email
        once we connect a messaging gateway. For now, you can see who would be notified
        and their phone number / email.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// LibraryAdminView — upload + manage books
// ---------------------------------------------------------------------

function LibraryAdminView() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [form, setForm] = useState({ title: "", author: "", description: "", fileUrl: "", coverImage: "", pages: "" });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/curriculum/grades").then((r) => r.json()).then((d) => setGrades(d.grades ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedGradeId) return;
    fetch(`/api/admin/curriculum/subjects?gradeId=${selectedGradeId}`).then((r) => r.json()).then((d) => setSubjects(d.subjects ?? [])).catch(() => {});
    setSelectedSubjectId("");
  }, [selectedGradeId]);

  const loadBooks = useCallback(async () => {
    if (!selectedSubjectId) return;
    const r = await fetch(`/api/admin/library?subjectId=${selectedSubjectId}`);
    const d = await r.json();
    setBooks(d.books ?? []);
  }, [selectedSubjectId]);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  const addBook = async () => {
    if (!form.title.trim() || !form.fileUrl.trim() || !selectedSubjectId) {
      setToast("⚠️ Title, file URL, and subject are required");
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          author: form.author.trim() || null,
          description: form.description.trim() || null,
          fileUrl: form.fileUrl.trim(),
          coverImage: form.coverImage.trim() || null,
          pages: form.pages ? Number(form.pages) : null,
          subjectId: selectedSubjectId,
          gradeId: selectedGradeId,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      setForm({ title: "", author: "", description: "", fileUrl: "", coverImage: "", pages: "" });
      setToast("✓ Book added!");
      setTimeout(() => setToast(null), 2500);
      await loadBooks();
    } catch {
      setToast("✗ Failed to add book");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const deleteBook = async (id: string) => {
    if (!confirm("Delete this book?")) return;
    await fetch("/api/admin/library", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadBooks();
  };

  return (
    <div className="space-y-3">
      {toast && <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2 text-xs text-indigo-700">{toast}</div>}

      {/* Grade + subject selectors */}
      <div className="grid grid-cols-2 gap-2">
        <select value={selectedGradeId} onChange={(e) => setSelectedGradeId(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
          <option value="">Select grade…</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} disabled={!selectedGradeId} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100">
          <option value="">Select subject…</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
        </select>
      </div>

      {/* Add book form */}
      {selectedSubjectId && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase text-gray-500">Add a book</h3>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Book title *" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Author (optional)" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="PDF URL * (e.g. /library/math-book.pdf)" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-mono" />
          <input value={form.coverImage} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} placeholder="Cover image URL (optional)" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.pages} onChange={(e) => setForm({ ...form, pages: e.target.value })} placeholder="Pages (optional)" type="number" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" rows={2} className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <button onClick={addBook} disabled={busy} className="w-full h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Adding…" : "Add book"}
          </button>
        </div>
      )}

      {/* Book list */}
      {selectedSubjectId && (
        <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100"><h3 className="text-xs font-bold uppercase text-gray-500">Books ({books.length})</h3></div>
          {books.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">No books yet. Add one above.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {books.map((b) => (
                <li key={b.id} className="px-4 py-3 flex items-center gap-2">
                  {b.coverImage ? <img src={b.coverImage} alt="" className="w-10 h-12 rounded object-cover" /> : <div className="w-10 h-12 rounded bg-indigo-50 flex items-center justify-center text-indigo-400">📄</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{b.title}</p>
                    <p className="text-[10px] text-gray-500">{b.author ?? "—"} · {b.fileType.toUpperCase()} · {b.pages ? `${b.pages}p` : "—"}</p>
                  </div>
                  <a href={b.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-indigo-600 hover:underline">View</a>
                  <button onClick={() => deleteBook(b.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ExamGeneratorView — AI-generated printable exams
// ---------------------------------------------------------------------


// ---------------------------------------------------------------------
// Unified ExamsView — PDF upload + AI template + exam papers list
// ---------------------------------------------------------------------

function ExamsView() {
  const [subView, setSubView] = useState<"list" | "pdf" | "ai" | "bulk">("list");

  return (
    <div className="space-y-3">
      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-medium">
        <button
          onClick={() => setSubView("list")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${subView === "list" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"}`}
        >
          📋 All Exams
        </button>
        <button
          onClick={() => setSubView("pdf")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${subView === "pdf" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"}`}
        >
          📄 Upload PDF
        </button>
        <button
          onClick={() => setSubView("ai")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${subView === "ai" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"}`}
        >
          🤖 AI Template
        </button>
        <button
          onClick={() => setSubView("bulk")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${subView === "bulk" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"}`}
        >
          📦 Bulk Upload
        </button>
      </div>

      {subView === "list" && <ExamPapersList />}
      {subView === "pdf" && <PdfUploadView />}
      {subView === "ai" && <AiTemplateView />}
      {subView === "bulk" && <BulkUploadView />}
    </div>
  );
}

// --- Exam papers list ---
function ExamPapersList() {
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/exam-papers");
      const d = await r.json();
      setPapers(d.papers ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (paper: any) => {
    setEditingId(paper.id);
    setEditForm({
      title: paper.title ?? "",
      description: paper.description ?? "",
      category: paper.category ?? "past_paper",
      paperType: paper.paperType ?? "",
      gradeLevel: paper.gradeLevel ?? "",
      subjectName: paper.subjectName ?? "",
      schoolName: paper.schoolName ?? "",
      year: paper.year ?? "",
      coverImage: paper.coverImage ?? "",
      durationMin: paper.durationMin ?? 60,
    });
  };

  const saveEdit = async () => {
    await fetch(`/api/admin/exam-papers/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        category: editForm.category,
        paperType: editForm.paperType.trim() || null,
        gradeLevel: editForm.gradeLevel || null,
        subjectName: editForm.subjectName.trim() || null,
        schoolName: editForm.schoolName.trim() || null,
        year: editForm.year ? Number(editForm.year) : null,
        coverImage: editForm.coverImage.trim() || null,
        durationMin: Number(editForm.durationMin) || 60,
      }),
    });
    setEditingId(null);
    await load();
  };

  const togglePublish = async (paper: any) => {
    await fetch(`/api/admin/exam-papers/${paper.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !paper.isPublished }),
    });
    await load();
  };

  const toggleTrending = async (paper: any) => {
    await fetch(`/api/admin/exam-papers/${paper.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTrending: !paper.isTrending }),
    });
    await load();
  };

  const deletePaper = async (id: string) => {
    if (!confirm("Delete this exam paper?")) return;
    await fetch("/api/admin/exam-papers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>;

  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-xs font-bold uppercase text-gray-500">All Exam Papers ({papers.length})</h3>
      </div>
      {papers.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-gray-400">No exam papers yet. Upload a PDF or generate with AI.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {papers.map((p) => (
            <li key={p.id} className="px-4 py-3">
              {editingId === p.id ? (
                /* Edit form */
                <div className="space-y-2 rounded-xl bg-gray-50 p-3 border border-gray-200">
                  <p className="text-[10px] font-bold uppercase text-indigo-600">✏️ Editing: {p.title}</p>
                  <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Title" className="w-full px-2 py-1 rounded border border-gray-200 text-sm" />
                  <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" rows={1} className="w-full px-2 py-1 rounded border border-gray-200 text-sm" />
                  <div className="grid grid-cols-2 gap-1">
                    <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="px-2 py-1 rounded border border-gray-200 text-xs bg-white">
                      <option value="past_paper">Past Paper</option>
                      <option value="kcse_revision">KCSE Revision</option>
                      <option value="kpsea">KPSEA</option>
                      <option value="kjsea">KJSEA</option>
                      <option value="studybuddy_ai">StudyBuddy AI</option>
                    </select>
                    <input value={editForm.paperType} onChange={(e) => setEditForm({ ...editForm, paperType: e.target.value })} placeholder="Paper type" className="px-2 py-1 rounded border border-gray-200 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <input value={editForm.gradeLevel} onChange={(e) => setEditForm({ ...editForm, gradeLevel: e.target.value })} placeholder="Grade" className="px-2 py-1 rounded border border-gray-200 text-xs" />
                    <input value={editForm.subjectName} onChange={(e) => setEditForm({ ...editForm, subjectName: e.target.value })} placeholder="Subject" className="px-2 py-1 rounded border border-gray-200 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <input value={editForm.schoolName} onChange={(e) => setEditForm({ ...editForm, schoolName: e.target.value })} placeholder="School" className="px-2 py-1 rounded border border-gray-200 text-xs" />
                    <input value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} placeholder="Year" type="number" className="px-2 py-1 rounded border border-gray-200 text-xs" />
                  </div>
                  <input value={editForm.coverImage} onChange={(e) => setEditForm({ ...editForm, coverImage: e.target.value })} placeholder="Cover image URL" className="w-full px-2 py-1 rounded border border-gray-200 text-xs" />
                  <div className="flex gap-1">
                    <button onClick={saveEdit} className="flex-1 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold">Save</button>
                    <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded-full bg-gray-200 text-gray-700 text-xs font-bold">Cancel</button>
                  </div>
                </div>
              ) : (
                /* Normal row */
                <div className="flex items-center gap-2">
                  {p.coverImage ? <img src={p.coverImage} alt="" className="w-10 h-12 rounded object-cover" /> : <div className="w-10 h-12 rounded bg-indigo-50 flex items-center justify-center text-indigo-400">📄</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                    <p className="text-[10px] text-gray-500">
                      {p.category} · {p.gradeLevel ?? "—"} · {p.subjectName ?? "—"} · {p.examType === "pdf" ? "PDF" : "AI"}
                      {p.year ? ` · ${p.year}` : ""}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.isTrending ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-400"}`}>🔥</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.isPublished ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>{p.isPublished ? "LIVE" : "DRAFT"}</span>
                  <button onClick={() => startEdit(p)} className="text-[10px] font-semibold text-indigo-600">✏️ Edit</button>
                  <button onClick={() => togglePublish(p)} className="text-[10px] font-semibold text-gray-600">{p.isPublished ? "Unpublish" : "Publish"}</button>
                  <button onClick={() => toggleTrending(p)} className="text-[10px] font-semibold text-amber-600">{p.isTrending ? "Un-trend" : "Trend"}</button>
                  <button onClick={() => deletePaper(p.id)} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- PDF Upload view ---
function PdfUploadView() {
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [convertToExam, setConvertToExam] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", category: "past_paper", paperType: "",
    gradeLevel: "", subjectName: "", schoolName: "", year: "",
    fileUrl: "", coverImage: "", pages: "", durationMinutes: "60",
  });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setToast("⚠️ File too large for direct upload (max 5MB). Use 'From URL' mode for larger files.");
      setTimeout(() => setToast(null), 4000);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    // Auto-fill title if empty
    if (!form.title) {
      const name = file.name.replace(/\.[^/.]+$/, "");
      setForm({ ...form, title: name });
    }
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setToast("⚠️ Title is required");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (uploadMode === "file") {
      if (!selectedFile) {
        setToast("⚠️ Please select a file");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      // Send file + metadata in one multipart request
      setBusy(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("title", form.title.trim());
        formData.append("description", form.description.trim());
        formData.append("category", form.category);
        formData.append("paperType", form.paperType.trim());
        formData.append("gradeLevel", form.gradeLevel);
        formData.append("subjectName", form.subjectName.trim());
        formData.append("schoolName", form.schoolName.trim());
        formData.append("year", form.year);
        formData.append("coverImage", form.coverImage.trim());
        formData.append("pages", form.pages);
        formData.append("durationMinutes", form.durationMinutes);
        formData.append("convertToExam", convertToExam ? "true" : "false");

        const r = await fetch("/api/admin/exam-papers/upload", {
          method: "POST",
          body: formData,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        setToast(
          d.questionsGenerated
            ? `✓ Generated ${d.questionsGenerated} exam questions from the file!`
            : "✓ Exam uploaded successfully!"
        );
        setForm({ title: "", description: "", category: "past_paper", paperType: "", gradeLevel: "", subjectName: "", schoolName: "", year: "", fileUrl: "", coverImage: "", pages: "", durationMinutes: "60" });
        setSelectedFile(null);
        setConvertToExam(false);
        setTimeout(() => setToast(null), 4000);
      } catch (e: any) {
        setToast(`✗ ${e?.message ?? "Failed"}`);
        setTimeout(() => setToast(null), 4000);
      } finally {
        setBusy(false);
      }
    } else {
      // URL mode — send as JSON
      if (!form.fileUrl.trim()) {
        setToast("⚠️ PDF URL is required");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      setBusy(true);
      try {
        const r = await fetch("/api/admin/exam-papers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examType: "pdf",
            title: form.title.trim(),
            description: form.description.trim() || null,
            category: form.category,
            paperType: form.paperType.trim() || null,
            gradeLevel: form.gradeLevel || null,
            subjectName: form.subjectName.trim() || null,
            schoolName: form.schoolName.trim() || null,
            year: form.year ? Number(form.year) : null,
            fileUrl: form.fileUrl.trim(),
            coverImage: form.coverImage.trim() || null,
            pages: form.pages ? Number(form.pages) : null,
            durationMinutes: Number(form.durationMinutes) || 60,
          }),
        });
        if (!r.ok) throw new Error("Failed");
        setToast("✓ Exam paper uploaded!");
        setForm({ title: "", description: "", category: "past_paper", paperType: "", gradeLevel: "", subjectName: "", schoolName: "", year: "", fileUrl: "", coverImage: "", pages: "", durationMinutes: "60" });
        setTimeout(() => setToast(null), 3000);
      } catch {
        setToast("✗ Failed");
        setTimeout(() => setToast(null), 3000);
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      {toast && <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2 text-xs text-indigo-700">{toast}</div>}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2">
        <h3 className="text-xs font-bold uppercase text-gray-500">Upload Exam PDF</h3>

        {/* Upload mode toggle */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-xs">
          <button
            onClick={() => setUploadMode("file")}
            className={`flex-1 py-1.5 rounded-md transition ${uploadMode === "file" ? "bg-white text-indigo-700 font-semibold shadow-sm" : "text-gray-600"}`}
          >
            📁 From File
          </button>
          <button
            onClick={() => setUploadMode("url")}
            className={`flex-1 py-1.5 rounded-md transition ${uploadMode === "url" ? "bg-white text-indigo-700 font-semibold shadow-sm" : "text-gray-600"}`}
          >
            🔗 From URL
          </button>
        </div>

        {/* File upload zone */}
        {uploadMode === "file" ? (
          <div>
            <label className="block w-full cursor-pointer">
              <div className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
                selectedFile ? "border-emerald-400 bg-emerald-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/30"
              }`}>
                {selectedFile ? (
                  <div>
                    <Check className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <p className="text-xs font-semibold text-emerald-700">{selectedFile.name}</p>
                    <p className="text-[10px] text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-xs text-gray-600">Click to select a file</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">PDF, DOC, DOCX · Max 5MB · DOC/DOCX auto-converted to PDF</p>
                  </div>
                )}
              </div>
              <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>
        ) : (
          <input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="PDF URL (e.g. https://example.com/exam.pdf or /exams/math.pdf)" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-mono" />
        )}

        {/* Metadata */}
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Exam title *" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" rows={2} className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
            <option value="past_paper">Past Paper</option>
            <option value="kcse_revision">KCSE Revision</option>
            <option value="kpsea">KPSEA (CBC)</option>
            <option value="kjsea">KJSEA (Upper Junior)</option>
            <option value="studybuddy_ai">StudyBuddy AI</option>
          </select>
          <input value={form.paperType} onChange={(e) => setForm({ ...form, paperType: e.target.value })} placeholder="Paper 1 / 2 / 3" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.gradeLevel} onChange={(e) => setForm({ ...form, gradeLevel: e.target.value })} placeholder="Grade (e.g. Form 4)" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} placeholder="Subject (e.g. Mathematics)" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} placeholder="School (optional)" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Year (e.g. 2023)" type="number" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.pages} onChange={(e) => setForm({ ...form, pages: e.target.value })} placeholder="Pages" type="number" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="Duration (min)" type="number" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
        {/* Cover image: upload (500KB) or Pollinations AI or URL */}
        <CoverImageInput value={form.coverImage} onChange={(url) => setForm({ ...form, coverImage: url })} />

        {/* Convert to Exam toggle (NEW) — only available in file mode */}
        {uploadMode === "file" && selectedFile && (
          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={convertToExam}
                onChange={(e) => setConvertToExam(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-xs font-bold text-indigo-700">🤖 Convert to interactive exam (AI)</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  When ON: extracts text from the uploaded file (PDF → pdftotext, DOC/DOCX → LibreOffice) and uses AI to generate 15 multiple-choice questions. The result is an interactive exam (ai_template mode), not a PDF view.
                  <br />When OFF: stores the file as a PDF exam paper (DOC/DOCX auto-converted to PDF for in-app viewing).</p>
              </div>
            </label>
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || (uploadMode === "file" ? !selectedFile : !form.fileUrl.trim())}
          className={`w-full h-9 rounded-full text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1 ${convertToExam && uploadMode === "file" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
        >
          {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {convertToExam && uploadMode === "file" ? "Generating exam…" : "Uploading…"}</> : (convertToExam && uploadMode === "file" ? "🤖 Convert to exam" : "📤 Upload exam paper")}
        </button>
      </div>
    </div>
  );
}

// --- AI Template view ---
function AiTemplateView() {
  const [form, setForm] = useState({
    title: "", description: "", category: "studybuddy_ai", paperType: "",
    gradeLevel: "", subjectName: "", schoolName: "", year: "",
    content: "", numQuestions: "10", durationMinutes: "60", pages: "",
  });
  const [diagrams, setDiagrams] = useState<Array<{ url: string; caption: string }>>([]);
  const [newDiagramUrl, setNewDiagramUrl] = useState("");
  const [newDiagramCaption, setNewDiagramCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const generatePollinationsImage = () => {
    if (!form.subjectName.trim() && !form.title.trim()) return;
    const prompt = encodeURIComponent(`exam diagram ${form.subjectName} ${form.title} education illustration`);
    setNewDiagramUrl(`https://image.pollinations.ai/prompt/${prompt}?width=400&height=300&nologo=true`);
  };

  const addDiagram = () => {
    if (!newDiagramUrl.trim()) return;
    setDiagrams([...diagrams, { url: newDiagramUrl.trim(), caption: newDiagramCaption.trim() }]);
    setNewDiagramUrl("");
    setNewDiagramCaption("");
  };

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setToast("⚠️ Title and content are required");
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/admin/exam-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examType: "ai_template",
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          paperType: form.paperType.trim() || null,
          gradeLevel: form.gradeLevel || null,
          subjectName: form.subjectName.trim() || null,
          schoolName: form.schoolName.trim() || null,
          year: form.year ? Number(form.year) : null,
          content: form.content,
          numQuestions: Number(form.numQuestions) || 10,
          durationMinutes: Number(form.durationMinutes) || 60,
          pages: form.pages ? Number(form.pages) : null,
          diagrams,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setToast(`✓ Generated! ${d.questionsGenerated ?? 0} questions, ${d.paper?.totalMarks ?? 0} marks`);
      setForm({ title: "", description: "", category: "studybuddy_ai", paperType: "", gradeLevel: "", subjectName: "", schoolName: "", year: "", content: "", numQuestions: "10", durationMinutes: "60", pages: "" });
      setDiagrams([]);
      setTimeout(() => setToast(null), 4000);
    } catch (e: any) {
      setToast(`✗ ${e?.message ?? "Failed"}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {toast && <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2 text-xs text-indigo-700">{toast}</div>}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2">
        <h3 className="text-xs font-bold uppercase text-gray-500">AI Exam Template</h3>
        <p className="text-[10px] text-gray-400">Paste notes/content → AI generates exam questions. Add diagrams via URL or generate with Pollinations AI (free).</p>

        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Exam title *" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" rows={2} className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />

        <div className="grid grid-cols-2 gap-2">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
            <option value="studybuddy_ai">StudyBuddy AI</option>
            <option value="kcse_revision">KCSE Revision</option>
            <option value="kpsea">KPSEA (CBC)</option>
            <option value="kjsea">KJSEA (Upper Junior)</option>
            <option value="past_paper">Past Paper</option>
          </select>
          <input value={form.paperType} onChange={(e) => setForm({ ...form, paperType: e.target.value })} placeholder="Paper 1 / 2 / 3" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.gradeLevel} onChange={(e) => setForm({ ...form, gradeLevel: e.target.value })} placeholder="Grade (e.g. Form 4)" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} placeholder="Subject (e.g. Mathematics)" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input value={form.numQuestions} onChange={(e) => setForm({ ...form, numQuestions: e.target.value })} placeholder="Questions (5-50)" type="number" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="Min" type="number" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <input value={form.pages} onChange={(e) => setForm({ ...form, pages: e.target.value })} placeholder="Pages" type="number" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>

        {/* Content paste area */}
        <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Paste exam content / notes here… The AI will generate questions from this." rows={6} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-mono" />

        {/* Diagrams section */}
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase text-gray-500">Diagrams (optional)</p>
          {diagrams.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {diagrams.map((d, i) => (
                <div key={i} className="relative">
                  <img src={d.url} alt={d.caption} className="w-20 h-16 rounded object-cover" />
                  <button onClick={() => setDiagrams(diagrams.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px]">✕</button>
                  {d.caption && <p className="text-[8px] text-gray-500 mt-0.5 truncate w-20">{d.caption}</p>}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <input value={newDiagramUrl} onChange={(e) => setNewDiagramUrl(e.target.value)} placeholder="Image URL" className="flex-1 px-2 py-1 rounded border border-gray-200 text-xs" />
            <input value={newDiagramCaption} onChange={(e) => setNewDiagramCaption(e.target.value)} placeholder="Caption" className="flex-1 px-2 py-1 rounded border border-gray-200 text-xs" />
          </div>
          <div className="flex gap-1">
            <button onClick={generatePollinationsImage} className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">🎨 Generate with Pollinations AI</button>
            <button onClick={addDiagram} className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-semibold">Add diagram</button>
          </div>
        </div>

        <button onClick={submit} disabled={busy} className="w-full h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1">
          {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating exam…</> : "🤖 Generate & Publish"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// CoverImageInput — upload (500KB) / Pollinations AI / URL
// ---------------------------------------------------------------------

function CoverImageInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [mode, setMode] = useState<"url" | "upload" | "ai">("url");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert("Image too large. Max 500KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const generateAI = () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    const prompt = encodeURIComponent(aiPrompt.trim() + " exam cover education book");
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=400&height=560&nologo=true`;
    // Pre-load to check it works
    const img = new Image();
    img.onload = () => {
      onChange(url);
      setGenerating(false);
    };
    img.onerror = () => {
      setGenerating(false);
      alert("Failed to generate image. Try again.");
    };
    img.src = url;
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase text-gray-500">Cover image</p>
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-[10px]">
        <button onClick={() => setMode("url")} className={`flex-1 py-1 rounded ${mode === "url" ? "bg-white text-indigo-700 font-semibold" : "text-gray-600"}`}>🔗 URL</button>
        <button onClick={() => setMode("upload")} className={`flex-1 py-1 rounded ${mode === "upload" ? "bg-white text-indigo-700 font-semibold" : "text-gray-600"}`}>📁 Upload</button>
        <button onClick={() => setMode("ai")} className={`flex-1 py-1 rounded ${mode === "ai" ? "bg-white text-indigo-700 font-semibold" : "text-gray-600"}`}>🎨 AI</button>
      </div>
      {mode === "url" && (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Cover image URL" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
      )}
      {mode === "upload" && (
        <div>
          <label className="block cursor-pointer">
            <div className={`rounded-xl border-2 border-dashed p-3 text-center ${value ? "border-emerald-400 bg-emerald-50" : "border-gray-300 hover:border-indigo-400"}`}>
              {value ? <img src={value} alt="Cover" className="w-20 h-28 mx-auto rounded object-cover" /> : <p className="text-xs text-gray-500">Click to select image (max 500KB)</p>}
            </div>
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      )}
      {mode === "ai" && (
        <div className="space-y-1">
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Describe the cover (e.g. 'mathematics exam blue geometric')" className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
          <button onClick={generateAI} disabled={generating} className="w-full h-7 rounded-full bg-emerald-600 text-white text-[10px] font-semibold disabled:opacity-50">
            {generating ? "Generating…" : "🎨 Generate with Pollinations AI"}
          </button>
          {value && mode === "ai" && <img src={value} alt="Cover" className="w-20 h-28 mx-auto rounded object-cover" />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// InAppPdfViewer — read-only PDF viewer (no print, no download)
// ---------------------------------------------------------------------

export function InAppPdfViewer({ dataUrl, title, onClose }: { dataUrl: string; title: string; onClose: () => void }) {
  // The server converts DOC/DOCX to PDF, so the data URL should always be
  // application/pdf. But if conversion failed, it might be msword.
  // Check for PDF first, then try to render ANY data URL as PDF (since
  // our server always tries to convert to PDF).
  const isPdf = dataUrl.startsWith("data:application/pdf") ||
                dataUrl.startsWith("data:application/octet-stream") ||
                dataUrl.toLowerCase().includes(".pdf");
  const isDoc = (dataUrl.startsWith("data:application/msword") ||
                 dataUrl.startsWith("data:application/vnd.openxmlformats")) &&
                !isPdf;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-14 bg-gray-800 text-white flex-shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-sm">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <p className="text-sm font-bold truncate flex-1 text-center">{title}</p>
        <span className="text-[10px] text-gray-400">📖 Read-only</span>
      </div>
      {/* Viewer — always try <embed> with application/pdf type */}
      {isDoc ? (
        /* Genuine DOC/DOCX that wasn't converted — show message */
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <FileText className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-white font-bold">Word document preview</p>
            <p className="text-xs text-gray-400 mt-1">This DOC/DOCX file was not converted to PDF.</p>
            <p className="text-xs text-gray-400 mt-1">Only PDF files can be viewed in the app.</p>
          </div>
        </div>
      ) : (
        /* PDF (or anything that might be a PDF after conversion) — use <embed> */
        <div className="flex-1 relative overflow-hidden">
          <embed
            src={dataUrl}
            type="application/pdf"
            className="w-full h-full"
            style={{ border: "none" }}
          />
        </div>
      )}
      {/* Block printing */}
      <style>{`
        @media print { body { display: none !important; } }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------
// BulkUploadView — upload 10-100 PDFs, AI generates metadata per file
// ---------------------------------------------------------------------

function BulkUploadView() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [defaultCategory, setDefaultCategory] = useState("past_paper");
  const [defaultGrade, setDefaultGrade] = useState("");
  const [convertToExam, setConvertToExam] = useState(false);
  const [numQuestions, setNumQuestions] = useState("10");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter((f) => {
      const ext = (f.name.split(".").pop() ?? "").toLowerCase();
      return ["pdf", "doc", "docx"].includes(ext); // PDF, DOC, DOCX — DOC/DOCX auto-converted to PDF
    });
    const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);

    if (oversized.length > 0) {
      setToast(`⚠️ ${oversized.length} file(s) over 5MB skipped. Use URL mode for large files.`);
      setTimeout(() => setToast(null), 4000);
    }
    if (valid.length > 100) {
      setToast(`⚠️ Max 100 files. Only the first 100 will be uploaded.`);
      setTimeout(() => setToast(null), 4000);
    }
    setSelectedFiles(valid.slice(0, 100));
  };

  const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);

  const upload = async () => {
    if (selectedFiles.length < 1) return;
    setBusy(true);
    setProgress(0);
    setResults(null);
    setProgressLabel("Converting files to base64…");

    try {
      // Convert all files to base64 data URLs
      const filesData: Array<{ fileName: string; dataUrl: string; size: number }> = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        const contentType =
          ext === "pdf" ? "application/pdf" :
          ext === "doc" ? "application/msword" :
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");
        const dataUrl = `data:${contentType};base64,${base64}`;

        filesData.push({ fileName: file.name, dataUrl, size: file.size });

        // Update progress (conversion phase: 0-50%)
        const pct = Math.round(((i + 1) / selectedFiles.length) * 50);
        setProgress(pct);
        setProgressLabel(`Converting ${i + 1}/${selectedFiles.length}…`);
      }

      setProgressLabel("AI generating metadata…");
      setProgress(55);

      // Send to bulk upload API
      const r = await fetch("/api/admin/exam-papers/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: filesData,
          defaultCategory,
          defaultGradeLevel: defaultGrade,
          convertToExam,
          numQuestions: Number(numQuestions) || 10,
        }),
      });

      setProgress(90);
      setProgressLabel("Saving to database…");

      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");

      setProgress(100);
      setProgressLabel(`Done! ${d.created}/${d.total} exams created.`);
      setResults(d.results ?? []);
      setSelectedFiles([]);
      setToast(`✓ ${d.created} exams created successfully!`);
      setTimeout(() => setToast(null), 5000);
    } catch (e: any) {
      setToast(`✗ ${e?.message ?? "Failed"}`);
      setTimeout(() => setToast(null), 5000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {toast && <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2 text-xs text-indigo-700">{toast}</div>}

      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase text-gray-500">📦 Bulk Upload (10-100 files)</h3>
        <p className="text-[10px] text-gray-400">Select multiple PDF/DOC/DOCX files. By default they're stored as PDF exam papers (DOC/DOCX auto-converted). Enable "Convert to Exam" below to extract text from each file and use AI to generate multiple-choice questions — useful for turning existing worksheets and past papers into interactive exams.</p>

        {/* File picker */}
        <label className="block w-full cursor-pointer">
          <div className="rounded-xl border-2 border-dashed p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30">
            <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
            <p className="text-xs text-gray-600">Click to select multiple files</p>
            <p className="text-[10px] text-gray-400 mt-0.5">PDF, DOC, DOCX · Max 5MB each · DOC/DOCX auto-converted · 10-100 files</p>
          </div>
          <input type="file" accept=".pdf,.doc,.docx" multiple onChange={handleFileSelect} className="hidden" />
        </label>

        {/* Selected files list */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-700">{selectedFiles.length} files selected</span>
              <span className="text-gray-400">{(totalSize / 1024 / 1024).toFixed(1)} MB total</span>
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg bg-gray-50 border border-gray-200 p-2 space-y-1">
              {selectedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] text-gray-600">
                  <span className="truncate flex-1">{i + 1}. {f.name}</span>
                  <span className="text-gray-400 ml-2">{(f.size / 1024).toFixed(0)}KB</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Defaults */}
        <div className="grid grid-cols-2 gap-2">
          <select value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white">
            <option value="past_paper">Default: Past Paper</option>
            <option value="kcse_revision">Default: KCSE Revision</option>
            <option value="kpsea">Default: KPSEA</option>
            <option value="kjsea">Default: KJSEA</option>
            <option value="studybuddy_ai">Default: StudyBuddy AI</option>
          </select>
          <input value={defaultGrade} onChange={(e) => setDefaultGrade(e.target.value)} placeholder="Default grade (e.g. Form 4)" className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>

        {/* Convert to Exam toggle (NEW) */}
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={convertToExam}
              onChange={(e) => setConvertToExam(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-xs font-bold text-indigo-700">🤖 Convert files to interactive exams (AI)</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                When ON: extracts text from each file (PDF → pdftotext, DOC/DOCX → LibreOffice) and uses AI to generate {numQuestions} multiple-choice questions per file. The result is an interactive exam (ai_template mode).
                <br />When OFF: stores each file as a PDF exam paper (DOC/DOCX auto-converted to PDF for in-app viewing).</p>
            </div>
          </label>
          {convertToExam && (
            <div className="flex items-center gap-2 pl-6">
              <label className="text-[10px] text-gray-600 font-semibold">Questions per file:</label>
              <input
                type="number"
                min={5}
                max={50}
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
                className="w-20 px-2 py-1 rounded border border-gray-200 text-xs"
              />
            </div>
          )}
        </div>

        {/* Progress bar */}
        {busy && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>{progressLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-2 max-h-40 overflow-y-auto space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className={r.status === "created" ? "text-emerald-600" : "text-rose-600"}>
                  {r.status === "created" ? "✓" : "✗"}
                </span>
                <span className="text-gray-700 truncate flex-1">
                  {r.title}
                  {r.questionsGenerated ? <span className="text-indigo-500 ml-1">({r.questionsGenerated} questions)</span> : null}
                </span>
                {r.error && <span className="text-rose-400">{r.error}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={upload}
          disabled={busy || selectedFiles.length < 1}
          className={`w-full h-10 rounded-full text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1 ${convertToExam ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
        >
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : (convertToExam ? `🤖 Convert ${selectedFiles.length} files to exams` : `📦 Upload ${selectedFiles.length} files`)}
        </button>
      </div>
    </div>
  );
}
