"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  BookOpen,
  Download,
  ExternalLink,
  Library,
  FileText,
} from "lucide-react";
import { useApp } from "../store";

type Book = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  fileUrl: string;
  fileType: string;
  coverImage: string | null;
  pages: number | null;
};

/**
 * BookshelfScreen — Phase 25
 *
 * Shows the digital library for a subject. Students can read PDFs in-app
 * (opens in a new tab via the file URL). Admin uploads books via the
 * admin panel.
 */
export function BookshelfScreen() {
  const { setScreen, activeCurriculumSubjectId } = useApp();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCurriculumSubjectId) {
      setError("No subject selected");
      setLoading(false);
      return;
    }
    fetch(`/api/curriculum/library?subjectId=${activeCurriculumSubjectId}`)
      .then((r) => r.json())
      .then((d) => setBooks(d.books ?? []))
      .catch((e) => setError(e?.message ?? "Failed"))
      .finally(() => setLoading(false));
  }, [activeCurriculumSubjectId]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setScreen("curriculumSubject")} className="text-gray-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Library className="w-5 h-5 text-indigo-600" />
          <p className="text-sm font-bold text-gray-900">Bookshelf</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-center">
            <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
            <p className="mt-2 text-sm text-rose-700">{error}</p>
          </div>
        ) : books.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <Library className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">No books available yet.</p>
            <p className="text-xs text-gray-400 mt-1">Books will appear here when the admin uploads them.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {books.map((book) => (
              <a
                key={book.id}
                href={book.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                {/* Cover */}
                <div className="aspect-[3/4] bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center relative">
                  {book.coverImage ? (
                    <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-12 h-12 text-indigo-300" />
                  )}
                  {/* PDF badge */}
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold uppercase">
                    {book.fileType}
                  </span>
                </div>
                {/* Info */}
                <div className="p-3">
                  <p className="text-xs font-bold text-gray-900 line-clamp-2">{book.title}</p>
                  {book.author && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{book.author}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-indigo-600 font-semibold">
                    <ExternalLink className="w-3 h-3" /> Read now
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
