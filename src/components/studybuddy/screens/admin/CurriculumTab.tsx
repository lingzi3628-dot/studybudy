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
  const [view, setView] = useState<"grades" | "upload" | "docs">("grades");

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
          <Upload className="w-3.5 h-3.5 inline mr-1" /> Upload content
        </button>
        <button
          onClick={() => setView("docs")}
          className={`flex-1 px-3 py-1.5 rounded-lg transition ${
            view === "docs" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-600"
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline mr-1" /> Source docs
        </button>
      </div>

      {view === "grades" && <GradesView />}
      {view === "upload" && <UploadView />}
      {view === "docs" && <DocsView />}
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
