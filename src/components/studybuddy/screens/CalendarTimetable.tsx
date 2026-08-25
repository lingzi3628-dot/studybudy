"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Calendar as CalendarIcon,
  Clock,
  Flame,
  Trophy,
  Zap,
  Plus,
  Trash2,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../store";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * CalendarScreen — Phase 22e
 *
 * Shows a monthly calendar with daily progress markers:
 *   - Study sessions (blue dots)
 *   - Quizzes taken (violet dots)
 *   - Exams done (amber dots)
 *   - Flashcard sessions (emerald dots)
 *
 * Summary: total study minutes, quizzes, exams, streak.
 */
export function CalendarScreen() {
  const { setScreen } = useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/curriculum/calendar?month=${currentMonth}`);
      const d = await r.json();
      setData(d);
    } catch {}
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => { load(); }, [load]);

  const [year, monthNum] = currentMonth.split("-").map(Number);
  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const prevMonth = () => {
    const d = new Date(year, monthNum - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(year, monthNum, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const summary = data?.summary ?? {};

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setScreen("home")} className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <CalendarIcon className="w-5 h-5 text-indigo-600" />
          <p className="text-sm font-bold text-gray-900">AI Calendar</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryCard icon={Clock} label="Study min" value={summary.totalStudyMin ?? 0} color="indigo" />
          <SummaryCard icon={Flame} label="Day streak" value={summary.streak ?? 0} color="amber" />
          <SummaryCard icon={Trophy} label="Quizzes" value={summary.quizzesTaken ?? 0} color="violet" />
          <SummaryCard icon={CheckCircle2} label="Study days" value={summary.studyDays ?? 0} color="emerald" />
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-bold text-gray-900">
            {MONTHS[monthNum - 1]} {year}
          </p>
          <button onClick={nextMonth} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-gray-200 p-3">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase">
                  {d}
                </div>
              ))}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }, (_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const entries = data?.byDay?.[dateStr] ?? [];
                const isToday = dateStr === today;
                const hasStudy = entries.some((e: any) => e.type === "study");
                const hasQuiz = entries.some((e: any) => e.type === "quiz" || e.type === "exam");
                const hasFlashcard = entries.some((e: any) => e.type === "flashcard");

                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative ${
                      isToday ? "bg-indigo-50 border-2 border-indigo-300" : "bg-gray-50"
                    }`}
                  >
                    <span className={`font-medium ${isToday ? "text-indigo-700" : "text-gray-600"}`}>
                      {day}
                    </span>
                    {entries.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {hasStudy && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                        {hasQuiz && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                        {hasFlashcard && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Study</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" /> Quiz/Exam</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Flashcards</span>
            </div>
          </div>
        )}

        {/* Today's entries */}
        {data?.byDay?.[today] && data.byDay[today].length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Today's activity</p>
            <ul className="space-y-1">
              {data.byDay[today].map((e: any) => (
                <li key={e.id} className="text-xs text-gray-700 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    e.type === "study" ? "bg-indigo-500" :
                    e.type === "quiz" || e.type === "exam" ? "bg-violet-500" :
                    "bg-emerald-500"
                  }`} />
                  <span className="flex-1">{e.title}</span>
                  {e.durationMin > 0 && <span className="text-gray-400">{e.durationMin}min</span>}
                  {e.score !== null && <span className="text-gray-400">{Math.round(e.score * 100)}%</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Timetable link */}
        <button
          onClick={() => setScreen("timetable")}
          className="w-full p-3 rounded-2xl bg-white border border-gray-200 hover:border-indigo-300 transition flex items-center gap-2 text-left"
        >
          <Clock className="w-5 h-5 text-indigo-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">My Timetable</p>
            <p className="text-[11px] text-gray-500">Set your weekly learning schedule</p>
          </div>
          <ChevronLeft className="w-4 h-4 rotate-180 text-gray-400" />
        </button>
      </main>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "indigo" | "amber" | "violet" | "emerald";
}) {
  const colorMap = {
    indigo: "text-indigo-600 bg-indigo-50",
    amber: "text-amber-600 bg-amber-50",
    violet: "text-violet-600 bg-violet-50",
    emerald: "text-emerald-600 bg-emerald-50",
  };
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-3 text-center">
      <div className={`w-8 h-8 mx-auto rounded-lg ${colorMap[color]} flex items-center justify-center mb-1`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

// =====================================================================
// TimetableScreen
// =====================================================================

export function TimetableScreen() {
  const { setScreen } = useApp();
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ dayOfWeek: 1, startTime: "16:00", endTime: "17:00", subjectName: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/curriculum/timetable");
      const d = await r.json();
      setSlots(d.slots ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const r = await fetch("/api/curriculum/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setShowForm(false);
      setForm({ dayOfWeek: 1, startTime: "16:00", endTime: "17:00", subjectName: "", notes: "" });
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed");
    }
  };

  const remove = async (id: string) => {
    await fetch("/api/curriculum/timetable", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  // Group slots by day
  const byDay: Record<number, any[]> = {};
  for (const s of slots) {
    if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = [];
    byDay[s.dayOfWeek].push(s);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setScreen("calendar")} className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Clock className="w-5 h-5 text-indigo-600" />
          <p className="text-sm font-bold text-gray-900 flex-1">My Timetable</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add slot
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <Clock className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">No timetable slots yet.</p>
            <p className="text-xs text-gray-400 mt-1">Set up a weekly learning schedule to stay consistent.</p>
          </div>
        ) : (
          DAYS.map((dayName, dayNum) => {
            const daySlots = byDay[dayNum] ?? [];
            if (daySlots.length === 0) return null;
            return (
              <div key={dayNum} className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-700">{dayName}</p>
                </div>
                <ul className="divide-y divide-gray-100">
                  {daySlots.map((s) => (
                    <li key={s.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400">Start</span>
                        <span className="text-sm font-bold text-indigo-600">{s.startTime}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{s.subjectName}</p>
                        <p className="text-[11px] text-gray-500">Until {s.endTime}</p>
                        {s.notes && <p className="text-[10px] text-gray-400 mt-0.5">{s.notes}</p>}
                      </div>
                      <button
                        onClick={() => remove(s.id)}
                        className="w-7 h-7 rounded-full hover:bg-rose-50 text-gray-400 hover:text-rose-500 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}

        {/* Info card */}
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-3 text-[11px] text-indigo-700">
          <strong>💡 Tip:</strong> Set a regular time each day for each subject. Consistency is more
          important than long sessions — 30 minutes daily beats 3 hours once a week.
        </div>
      </main>

      {/* Add slot form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white">
              <p className="text-sm font-bold">Add timetable slot</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500">Day</label>
                <select
                  value={form.dayOfWeek}
                  onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500">Start</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500">End</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500">Subject</label>
                <input
                  value={form.subjectName}
                  onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
                  placeholder="e.g. Mathematics"
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500">Notes (optional)</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. Focus on fractions"
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-10 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={create}
                  disabled={!form.subjectName.trim()}
                  className="flex-1 h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add slot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
