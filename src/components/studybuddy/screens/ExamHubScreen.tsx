"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  Loader2,
  Search,
  FileText,
  Clock,
  TrendingUp,
  Filter,
  X,
  Eye,
  Calendar,
  School,
} from "lucide-react";
import { useApp } from "../store";
import { InAppPdfViewer } from "./admin/CurriculumTab";

type ExamPaper = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  paperType: string | null;
  gradeLevel: string | null;
  subjectName: string | null;
  schoolName: string | null;
  year: number | null;
  examType: string;
  fileUrl: string | null;
  totalMarks: number;
  durationMin: number;
  coverImage: string | null;
  pages: number | null;
  viewCount: number;
};

const CATEGORIES = [
  { key: "", label: "All", icon: "📋" },
  { key: "kcse_revision", label: "KCSE Revision", icon: "🎓" },
  { key: "kpsea", label: "KPSEA (CBC)", icon: "📚" },
  { key: "kjsea", label: "KJSEA (Upper Junior)", icon: "🏫" },
  { key: "past_paper", label: "Past Papers", icon: "📄" },
  { key: "studybuddy_ai", label: "StudyBuddy AI", icon: "🤖" },
];

const GRADE_LEVELS = [
  "", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9",
  "Form 1", "Form 2", "Form 3", "Form 4",
];

/**
 * ExamHubScreen — Phase 26
 *
 * Netflix-style exam marketplace with:
 *   - Category tabs (KCSE, KPSEA, KJSEA, Past Papers, StudyBuddy AI)
 *   - Grade filter
 *   - Smart search (title, description, subject, school)
 *   - Trending section
 *   - Exam cards with cover, title, year, school, marks
 *   - Click → detail view with full description + open exam
 */
export function ExamHubScreen() {
  const { setScreen } = useApp();
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeGrade, setActiveGrade] = useState("");
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeCategory) params.set("category", activeCategory);
    if (activeGrade) params.set("gradeLevel", activeGrade);
    if (search.trim()) params.set("search", search.trim());
    try {
      const r = await fetch(`/api/exam-papers?${params.toString()}`);
      const d = await r.json();
      setPapers(d.papers ?? []);
    } catch {}
    setLoading(false);
  }, [activeCategory, activeGrade, search]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  // --- In-app PDF viewer (read-only, no print, no download) ---
  if (viewingPdf && selectedPaper?.fileUrl) {
    return <InAppPdfViewer dataUrl={selectedPaper.fileUrl} title={selectedPaper.title} onClose={() => setViewingPdf(false)} />;
  }

  // --- Detail view ---
  if (selectedPaper) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => setSelectedPaper(null)} className="text-gray-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <p className="text-sm font-bold text-gray-900 truncate flex-1">{selectedPaper.title}</p>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {/* Cover + info */}
          <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
            {selectedPaper.coverImage && (
              <img src={selectedPaper.coverImage} alt="" className="w-full h-48 object-cover" />
            )}
            <div className="p-4 space-y-2">
              <h1 className="text-lg font-bold text-gray-900">{selectedPaper.title}</h1>
              {selectedPaper.description && (
                <p className="text-sm text-gray-600">{selectedPaper.description}</p>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedPaper.subjectName && (
                  <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold">{selectedPaper.subjectName}</span>
                )}
                {selectedPaper.paperType && (
                  <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700 font-semibold">{selectedPaper.paperType}</span>
                )}
                {selectedPaper.gradeLevel && (
                  <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">{selectedPaper.gradeLevel}</span>
                )}
                {selectedPaper.year && (
                  <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {selectedPaper.year}
                  </span>
                )}
                {selectedPaper.schoolName && (
                  <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold flex items-center gap-1">
                    <School className="w-3 h-3" /> {selectedPaper.schoolName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {selectedPaper.totalMarks} marks</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {selectedPaper.durationMin} min</span>
                {selectedPaper.pages && <span>{selectedPaper.pages} pages</span>}
                <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {selectedPaper.viewCount} views</span>
              </div>
            </div>
          </div>

          {/* Open exam button — in-app viewer, read-only */}
          {selectedPaper.examType === "pdf" && selectedPaper.fileUrl && (
            <button
              onClick={() => setViewingPdf(true)}
              className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 flex items-center justify-center gap-2"
            >
              <FileText className="w-5 h-5" /> 📖 Read Exam (in-app)
            </button>
          )}
          {selectedPaper.examType === "ai_template" && (
            <button
              onClick={() => {
                setScreen("printableExam");
              }}
              className="w-full h-12 rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-md hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              🖨️ View & Print Exam
            </button>
          )}
        </main>
      </div>
    );
  }

  // --- List view ---
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setScreen("home")} className="text-gray-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
          {/* Kenya exam logo */}
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xl">🎓</span>
            <p className="text-sm font-bold text-gray-900">Exam Hub</p>
          </div>
          <button onClick={() => setShowFilters((s) => !s)} className="text-gray-500">
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* Smart search */}
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exams, subjects, schools, years…"
              className="w-full pl-10 pr-3 p-2 rounded-xl bg-gray-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="max-w-5xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                activeCategory === cat.key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Filters (collapsible) */}
        {showFilters && (
          <div className="max-w-5xl mx-auto px-4 pb-2 flex gap-2">
            <select
              value={activeGrade}
              onChange={(e) => setActiveGrade(e.target.value)}
              className="px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white"
            >
              <option value="">All grades</option>
              {GRADE_LEVELS.filter(Boolean).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : papers.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">No exams found.</p>
            <p className="text-xs text-gray-400 mt-1">Try a different category or search term.</p>
          </div>
        ) : (
          <>
            {/* Trending section */}
            {papers.some((p) => p.viewCount > 10) && !search && (
              <div className="mb-4">
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Trending
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {papers.filter((p) => p.viewCount > 10).slice(0, 5).map((paper) => (
                    <button
                      key={paper.id}
                      onClick={() => setSelectedPaper(paper)}
                      className="flex-shrink-0 w-32 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden"
                    >
                      <div className="aspect-[3/4] bg-gradient-to-br from-indigo-100 to-violet-100">
                        {paper.coverImage && <img src={paper.coverImage} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="p-2">
                        <p className="text-[10px] font-bold text-gray-900 line-clamp-2">{paper.title}</p>
                        <p className="text-[9px] text-gray-500">{paper.subjectName ?? "—"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Grid of exam papers */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {papers.map((paper) => (
                <button
                  key={paper.id}
                  onClick={() => setSelectedPaper(paper)}
                  className="group rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden text-left"
                >
                  {/* Cover */}
                  <div className="aspect-[3/4] bg-gradient-to-br from-indigo-100 to-violet-100 relative">
                    {paper.coverImage && (
                      <img src={paper.coverImage} alt="" className="w-full h-full object-cover" />
                    )}
                    {/* Category badge */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur text-white text-[8px] font-bold uppercase">
                      {CATEGORIES.find((c) => c.key === paper.category)?.label ?? paper.category}
                    </span>
                    {/* Paper type badge */}
                    {paper.paperType && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-indigo-600/80 backdrop-blur text-white text-[8px] font-bold">
                        {paper.paperType}
                      </span>
                    )}
                    {/* Exam type badge */}
                    {paper.examType === "pdf" && (
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[7px] font-bold">PDF</span>
                    )}
                    {paper.examType === "ai_template" && (
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[7px] font-bold">AI</span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-2">
                    <p className="text-xs font-bold text-gray-900 line-clamp-2">{paper.title}</p>
                    <div className="flex items-center gap-1 mt-1 text-[9px] text-gray-500">
                      {paper.subjectName && <span>{paper.subjectName}</span>}
                      {paper.year && <span>· {paper.year}</span>}
                    </div>
                    {paper.gradeLevel && (
                      <span className="inline-block mt-1 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                        {paper.gradeLevel}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
