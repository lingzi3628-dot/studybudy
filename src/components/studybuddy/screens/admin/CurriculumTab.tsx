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
  const [view, setView] = useState<"grades" | "upload" | "docs" | "exams">("grades");

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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-medium">
        <button
          onClick={() => setView("grades")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${
            view === "grades" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Layers className="w-3.5 h-3.5 inline mr-1" /> Grades
        </button>
        <button
          onClick={() => setView("upload")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${
            view === "upload" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Upload className="w-3.5 h-3.5 inline mr-1" /> Upload
        </button>
        <button
          onClick={() => setView("docs")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${
            view === "docs" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline mr-1" /> Docs
        </button>
        <button
          onClick={() => setView("exams")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${
            view === "exams" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <Trophy className="w-3.5 h-3.5 inline mr-1" /> Exams
        </button>
      </div>

      {view === "grades" && <GradesView />}
      {view === "upload" && <UploadView />}
      {view === "docs" && <DocsView />}
      {view === "exams" && <ExamsView />}
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
    setBusy(true);
    try {
      await fetch("/api/admin/curriculum/grades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, status: newStatus }),
      });
      await load();
    } finally {
      setBusy(false);
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
        {toast && <p className="mt-2 text-xs text-emerald-600">{toast}</p>}
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
            grades.map((g) => (
              <li key={g.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {g.level} · {g._count?.subjects ?? 0} subjects · {g._count?.sourceDocs ?? 0} source docs
                  </p>
                </div>
                <button
                  onClick={() => toggleStatus(g)}
                  disabled={busy}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition ${
                    g.status === "ready"
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  {g.status === "ready" ? (
                    <><Check className="w-3 h-3 inline" /> Ready</>
                  ) : (
                    <><Lock className="w-3 h-3 inline" /> Coming soon</>
                  )}
                </button>
              </li>
            ))
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
