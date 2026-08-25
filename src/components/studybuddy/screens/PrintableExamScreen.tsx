"use client";

import { useEffect, useState, useRef } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Printer,
  Clock,
  Award,
} from "lucide-react";
import { useApp } from "../store";

type ExamQuestion = {
  questionText: string;
  options: string[];
  correctIndex: number;
  marks: number;
  difficulty?: string;
};

type ExamData = {
  id: string;
  title: string;
  studentName: string | null;
  gradeName: string;
  subjectName: string;
  questions: ExamQuestion[];
  totalMarks: number;
  durationMinutes: number;
  createdAt: string;
};

/**
 * PrintableExamScreen — Phase 25
 *
 * Shows a generated exam in a printable format with the StudyBuddy AI
 * logo, exam header, questions, and an answer key (hidden by default,
 * shown when "Show answers" is toggled).
 *
 * The student/parent can use Ctrl+P or the "Print" button to print.
 */
export function PrintableExamScreen() {
  const { setScreen, activeCurriculumSubjectId } = useApp();
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeCurriculumSubjectId) {
      setLoading(false);
      return;
    }
    fetch(`/api/curriculum/printable-exams?subjectId=${activeCurriculumSubjectId}`)
      .then((r) => r.json())
      .then((d) => setExams(d.exams ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCurriculumSubjectId]);

  const printExam = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  // --- Exam list view ---
  if (!selectedExam) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200 print:hidden">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => setScreen("curriculumSubject")} className="text-gray-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <Printer className="w-5 h-5 text-indigo-600" />
            <p className="text-sm font-bold text-gray-900">Printable Exams</p>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-4">
          {exams.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
              <Printer className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-2 text-sm text-gray-600">No printable exams yet.</p>
              <p className="text-xs text-gray-400 mt-1">Admin can generate exams from the admin panel.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => setSelectedExam({
                    id: exam.id,
                    title: exam.title,
                    studentName: exam.studentName,
                    gradeName: exam.grade?.name ?? "",
                    subjectName: exam.subject?.name ?? "",
                    questions: exam.questions,
                    totalMarks: exam.totalMarks,
                    durationMinutes: exam.durationMinutes,
                    createdAt: exam.createdAt,
                  })}
                  className="w-full text-left rounded-2xl bg-white border border-gray-200 p-4 hover:shadow-md transition"
                >
                  <p className="text-sm font-bold text-gray-900">{exam.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {exam.grade?.name} · {exam.subject?.name} · {exam.totalMarks} marks · {exam.durationMinutes} min
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {new Date(exam.createdAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // --- Exam print view ---
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar (hidden when printing) */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => setSelectedExam(null)} className="text-gray-500 flex items-center gap-1 text-sm">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAnswers((s) => !s)}
              className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100"
            >
              {showAnswers ? "Hide answers" : "Show answers"}
            </button>
            <button
              onClick={printExam}
              className="px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Printable exam */}
      <div ref={printRef} className="max-w-3xl mx-auto px-8 py-8 bg-white print:max-w-none print:p-0">
        {/* Exam header */}
        <div className="text-center border-b-2 border-indigo-600 pb-4 mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mb-2">
            <span className="text-2xl font-bold text-white">S</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">StudyBuddy AI</h1>
          <p className="text-sm text-gray-500">{selectedExam.gradeName} · {selectedExam.subjectName}</p>
          <h2 className="text-lg font-bold text-gray-900 mt-2">{selectedExam.title}</h2>
        </div>

        {/* Exam info */}
        <div className="flex justify-between text-xs text-gray-600 mb-6">
          <div>
            <p><strong>Name:</strong> {selectedExam.studentName ?? "________________________"}</p>
          </div>
          <div className="text-right">
            <p><strong>Date:</strong> ____/____/________</p>
            <p><strong>Time:</strong> {selectedExam.durationMinutes} minutes</p>
            <p><strong>Marks:</strong> {selectedExam.totalMarks}</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-6 text-xs text-gray-700">
          <p className="font-bold">Instructions:</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            <li>Answer ALL questions.</li>
            <li>Choose the correct answer and circle the letter (A, B, C, or D).</li>
            <li>Read each question carefully before answering.</li>
          </ul>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {selectedExam.questions.map((q, i) => (
            <div key={i} className="border-b border-gray-100 pb-3">
              <p className="text-sm font-semibold text-gray-900">
                {i + 1}. {q.questionText}
                <span className="ml-2 text-xs text-gray-400">({q.marks} mark{q.marks > 1 ? "s" : ""})</span>
              </p>
              <div className="mt-2 ml-6 space-y-1">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                      showAnswers && oi === q.correctIndex
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "border-gray-300 text-gray-400"
                    }`}>
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className={showAnswers && oi === q.correctIndex ? "text-emerald-700 font-semibold" : "text-gray-700"}>
                      {opt}
                    </span>
                    {showAnswers && oi === q.correctIndex && (
                      <span className="text-[10px] text-emerald-600 font-bold">✓ CORRECT</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          <p>— End of Exam —</p>
          <p className="mt-1">© 2026 StudyBuddy AI · Generated by AI · {new Date(selectedExam.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
