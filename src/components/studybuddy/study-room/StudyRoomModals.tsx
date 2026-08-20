"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  X, Loader2, AlertCircle, Play, Pause, RotateCcw, Send,
  Sparkles, Trophy, Flame, Coins, Map as MapIcon, Bot,
  Settings, Music, Timer, FileText, Bookmark, BookOpen, ListChecks,
  Layers, ChevronRight, Volume2, VolumeX, Check, Trash2, Plus,
  Target, Users, Award, Palette, FileDown, Gamepad2,
} from "lucide-react";
import { useApp } from "../store";

type ModalProps = { open: boolean; onClose: () => void; topicId: string; room: any };

/* ════════════════════════════════════════════════════════════════
 * Modal wrapper
 * ════════════════════════════════════════════════════════════════ */
function ModalShell({ title, icon: Icon, onClose, children, maxWidth = "max-w-md" }: {
  title: string;
  icon: any;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className={`relative w-full ${maxWidth} bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Icon className="w-4 h-4 text-indigo-600" /> {title}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Focus Timer Modal
 * ════════════════════════════════════════════════════════════════ */
export function FocusTimerModal({ open, onClose, topicId }: ModalProps) {
  const [duration, setDuration] = useState(25 * 60); // 25 min default
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const intervalRef = useRef<any>(null);
  const handleCompleteRef = useRef<() => void>(() => {});

  // Save handler ref
  handleCompleteRef.current = async () => {
    setSaving(true);
    try {
      const elapsedSec = duration;
      await fetch("/api/focus-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          durationSec: elapsedSec,
          startedAt: startedAtRef.current?.toISOString(),
          endedAt: new Date().toISOString(),
        }),
      }).then((r) => r.json()).then((d) => {
        if (d.xpGained) {
          setToast(`+${d.xpGained} XP earned ${d.leveledUp ? "— Level up! 🎉" : ""}`);
          setTimeout(() => setToast(null), 3000);
        }
      });
      setRemaining(duration);
      startedAtRef.current = null;
    } catch {}
    setSaving(false);
  };

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            setCompletedSessions((c) => c + 1);
            handleCompleteRef.current();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [running, remaining, duration]);

  const start = () => {
    if (!running) {
      startedAtRef.current = new Date();
      setRunning(true);
    }
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setRemaining(duration);
    startedAtRef.current = null;
  };
  const setDur = (min: number) => {
    setDuration(min * 60);
    setRemaining(min * 60);
    setRunning(false);
    startedAtRef.current = null;
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = ((duration - remaining) / duration) * 100;

  if (!open) return null;
  return (
    <ModalShell title="Focus Timer" icon={Timer} onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-40 h-40">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="45" fill="none" stroke="#6366f1" strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
              strokeLinecap="round"
              className="transition-all"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-bold text-gray-900 tabular-nums">{mins}:{secs.toString().padStart(2, "0")}</p>
            <p className="text-[10px] text-gray-500">{completedSessions} sessions today</p>
          </div>
        </div>

        <div className="flex gap-2">
          {[15, 25, 50].map((m) => (
            <button
              key={m}
              onClick={() => setDur(m)}
              className={`px-3 h-8 rounded-full text-xs font-semibold ${duration === m * 60 ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {m}m
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {!running ? (
            <button onClick={start} className="px-5 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center gap-1.5">
              <Play className="w-4 h-4" /> Start
            </button>
          ) : (
            <button onClick={pause} className="px-5 h-10 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 flex items-center gap-1.5">
              <Pause className="w-4 h-4" /> Pause
            </button>
          )}
          <button onClick={reset} className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center justify-center">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[10px] text-gray-400 text-center">
          Stay focused — earn 10 XP per 25-min session.<br />
          Close this modal and your timer keeps running.
        </p>
      </div>
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Notes Modal
 * ════════════════════════════════════════════════════════════════ */
export function NotesModal({ open, onClose, topicId }: ModalProps) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/notes?topicId=${topicId}`);
      const d = await r.json();
      setNotes(d.notes ?? []);
    } catch {}
    setLoading(false);
  }, [topicId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const save = async () => {
    if (!title.trim()) { setError("Title required"); return; }
    setBusy(true); setError(null);
    try {
      const url = editing ? `/api/notes/${editing.id}` : "/api/notes";
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content, topicId }),
      });
      if (!r.ok) throw new Error("Save failed");
      setEditing(null); setTitle(""); setContent("");
      await load();
    } catch (e: any) { setError(e?.message ?? "Save failed"); }
    setBusy(false);
  };

  const edit = (n: any) => {
    setEditing(n); setTitle(n.title); setContent(n.content ?? "");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    await load();
  };

  if (!open) return null;
  return (
    <ModalShell title="Notes & Journal" icon={FileText} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3">
        {/* Editor */}
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={editing ? "Edit title" : "New note title"}
            className="w-full p-2 rounded-lg border border-gray-200 text-sm font-semibold bg-white outline-none focus:border-indigo-400"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your notes here…"
            rows={4}
            className="w-full p-2 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-indigo-400 resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500">{content.length} chars</p>
            <div className="flex gap-1">
              {editing && (
                <button onClick={() => { setEditing(null); setTitle(""); setContent(""); }} className="px-2 h-7 rounded-full bg-gray-200 text-gray-700 text-[10px] font-semibold">
                  Cancel
                </button>
              )}
              <button onClick={save} disabled={busy} className="px-3 h-7 rounded-full bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {busy ? "Saving…" : editing ? "Update" : "Save +5 XP"}
              </button>
            </div>
          </div>
          {error && <p className="text-[10px] text-rose-600">{error}</p>}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No notes yet. Create one above.</p>
        ) : (
          <div className="space-y-1.5">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl bg-white border border-gray-200 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => edit(n)} className="flex-1 text-left min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{n.title}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5">{n.content || "(empty)"}</p>
                    <p className="text-[9px] text-gray-400 mt-1">{new Date(n.updatedAt).toLocaleString()}</p>
                  </button>
                  <button onClick={() => remove(n.id)} className="w-6 h-6 rounded-full hover:bg-rose-50 flex items-center justify-center text-rose-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Music Player Modal — ambient sounds
 * ════════════════════════════════════════════════════════════════ */
export function MusicPlayerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Use free audio sources — these are open-source ambient sound streams
  // Note: For production, replace with self-hosted audio files
  const sounds = [
    { key: "lofi", label: "Lo-Fi Beats", emoji: "🎧", color: "from-purple-500 to-pink-500" },
    { key: "rain", label: "Rain", emoji: "🌧️", color: "from-sky-500 to-blue-600" },
    { key: "whitenoise", label: "White Noise", emoji: "⚪", color: "from-gray-500 to-gray-700" },
    { key: "classical", label: "Classical", emoji: "🎻", color: "from-amber-500 to-orange-600" },
    { key: "forest", label: "Forest", emoji: "🌲", color: "from-emerald-500 to-green-600" },
    { key: "ocean", label: "Ocean", emoji: "🌊", color: "from-cyan-500 to-teal-600" },
  ];

  const toggle = (key: string) => {
    if (active === key) {
      audioRef.current?.pause();
      setActive(null);
      return;
    }
    // Free streaming URLs (best-effort — these may go down)
    const urls: Record<string, string> = {
      rain: "https://cdn.pixabay.com/audio/2022/03/24/audio_32299a8d9a.mp3",
      forest: "https://cdn.pixabay.com/audio/2022/03/15/audio_890d0d8d8a.mp3",
      ocean: "https://cdn.pixabay.com/audio/2022/03/15/audio_7d860d8d8a.mp3",
      whitenoise: "https://cdn.pixabay.com/audio/2022/03/10/audio_0a60d0d8d8a.mp3",
      lofi: "https://cdn.pixabay.com/audio/2022/05/27/audio_9862666eca.mp3",
      classical: "https://cdn.pixabay.com/audio/2022/03/15/audio_d0d8d8a.mp3",
    };
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(urls[key]);
    audioRef.current.loop = true;
    audioRef.current.volume = 0.5;
    audioRef.current.play().catch(() => {});
    setActive(key);
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  if (!open) return null;
  return (
    <ModalShell title="Study Music" icon={Music} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {sounds.map((s) => (
          <button
            key={s.key}
            onClick={() => toggle(s.key)}
            className={`relative rounded-2xl p-4 bg-gradient-to-br ${s.color} text-white overflow-hidden transition ${active === s.key ? "ring-4 ring-white" : ""}`}
          >
            <span className="text-3xl">{s.emoji}</span>
            <p className="mt-1 text-xs font-bold">{s.label}</p>
            {active === s.key && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/30 flex items-center justify-center">
                <Pause className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-gray-400 text-center">
        Music is free — no token cost. Click a sound to start, click again to stop.
      </p>
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Customization Modal — premium
 * ════════════════════════════════════════════════════════════════ */
export function CustomizationModal({ open, onClose, topicId, room }: ModalProps) {
  const { setScreen } = useApp();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aiTeacherName, setAiTeacherName] = useState(room?.aiTeacherName ?? "Professor Bloom");
  const [aiTeacherAvatar, setAiTeacherAvatar] = useState(room?.aiTeacherAvatar ?? "🧙‍♂️");
  const [aiTeacherStyle, setAiTeacherStyle] = useState(room?.aiTeacherStyle ?? "encouraging");
  const [roomTheme, setRoomTheme] = useState(room?.roomTheme ?? "warm");
  const [preferredAudio, setPreferredAudio] = useState(room?.preferredAudio ?? "");

  const AVATARS = ["🧙‍♂️", "👩‍🏫", "👨‍🏫", "🦉", "🎓", "📚", "🌟", "🤖", "🦊", "🐧", "🧠", "🦄"];
  const STYLES = [
    { value: "encouraging", label: "Encouraging", emoji: "🌟" },
    { value: "strict", label: "Strict", emoji: "📐" },
    { value: "fun", label: "Fun", emoji: "🎉" },
    { value: "academic", label: "Academic", emoji: "🎓" },
  ];
  const THEMES = [
    { value: "warm", label: "Warm", color: "bg-amber-100" },
    { value: "dark", label: "Dark", color: "bg-gray-800" },
    { value: "pastel", label: "Pastel", color: "bg-pink-100" },
    { value: "ocean", label: "Ocean", color: "bg-cyan-100" },
  ];

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/study-room/${topicId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiTeacherName, aiTeacherAvatar, aiTeacherStyle,
          roomTheme, preferredAudio: preferredAudio || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setScreen("premium");
          return;
        }
        throw new Error(d.error);
      }
      setToast("Settings saved ✓");
      setTimeout(() => { setToast(null); onClose(); }, 1500);
    } catch (e: any) {
      setToast(e?.message ?? "Save failed");
    }
    setBusy(false);
  };

  if (!open) return null;
  return (
    <ModalShell title="Customize Room" icon={Palette} onClose={onClose}>
      <div className="space-y-4">
        {/* Teacher name */}
        <div>
          <label className="text-xs font-semibold text-gray-700">Teacher Name</label>
          <input
            value={aiTeacherName}
            onChange={(e) => setAiTeacherName(e.target.value)}
            maxLength={50}
            className="mt-1 w-full p-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        {/* Avatar picker */}
        <div>
          <label className="text-xs font-semibold text-gray-700">Teacher Avatar</label>
          <div className="mt-1 grid grid-cols-6 gap-1.5">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAiTeacherAvatar(a)}
                className={`aspect-square rounded-xl flex items-center justify-center text-2xl ${aiTeacherAvatar === a ? "bg-indigo-100 ring-2 ring-indigo-500" : "bg-gray-50"}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div>
          <label className="text-xs font-semibold text-gray-700">Teaching Style</label>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s.value}
                onClick={() => setAiTeacherStyle(s.value)}
                className={`p-2 rounded-xl text-xs font-semibold ${aiTeacherStyle === s.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Room theme (premium) */}
        <div>
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            Room Theme
            <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded-full">PREMIUM</span>
          </label>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => setRoomTheme(t.value)}
                className={`p-2 rounded-xl flex flex-col items-center gap-1 ${roomTheme === t.value ? "ring-2 ring-indigo-500" : ""}`}
              >
                <span className={`w-8 h-8 rounded-lg ${t.color}`} />
                <span className="text-[9px] font-medium text-gray-700">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={save}
          disabled={busy}
          className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {busy ? "Saving…" : "Save Settings"}
        </button>
      </div>
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Report Card Modal
 * ════════════════════════════════════════════════════════════════ */
export function ReportCardModal({ open, onClose, topicId }: ModalProps) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    fetch(`/api/study-room/${topicId}/report`)
      .then((r) => r.json())
      .then((d) => { if (mounted) setReport(d.report); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [open, topicId]);

  if (!open) return null;
  return (
    <ModalShell title="Report Card" icon={FileDown} onClose={onClose} maxWidth="max-w-md">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
      ) : !report ? (
        <p className="text-center text-xs text-gray-400 py-6">Couldn't generate report.</p>
      ) : (
        <div className="space-y-3">
          <div className="text-center pb-3 border-b border-gray-100">
            <p className="text-xs uppercase tracking-wide text-gray-500">{report.topic?.subject}</p>
            <p className="text-lg font-bold text-gray-900">{report.topic?.name}</p>
            <p className="text-[10px] text-gray-400">Generated {new Date(report.generatedAt).toLocaleDateString()}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-[10px] text-gray-500">Mastery</p>
              <p className="text-xl font-bold text-indigo-600">{Math.round(report.mastery * 100)}%</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-[10px] text-gray-500">Accuracy (7d)</p>
              <p className="text-xl font-bold text-emerald-600">{Math.round(report.accuracy7d * 100)}%</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-[10px] text-gray-500">Focus (30d)</p>
              <p className="text-xl font-bold text-violet-600">{Math.round(report.focusSeconds30d / 60)}m</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-[10px] text-gray-500">XP</p>
              <p className="text-xl font-bold text-amber-600">{report.xp.toLocaleString()}</p>
            </div>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-3 text-center">
            <p className="text-[10px] text-emerald-700 font-semibold uppercase">Predicted Readiness</p>
            <p className="text-3xl font-bold text-emerald-700">{Math.round(report.readiness * 100)}%</p>
          </div>

          <div>
            <p className="text-[10px] text-gray-500 font-semibold mb-1">Daily Accuracy (last 7 days)</p>
            <div className="flex items-end justify-between gap-1 h-16">
              {report.dailyBuckets.map((b: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full bg-indigo-200 rounded-t" style={{ height: `${(b.accuracy ?? 0) * 100}%` }} />
                  <span className="text-[8px] text-gray-400">{b.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          {report.badges?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 font-semibold mb-1">Recent Badges ({report.badges.length})</p>
              <div className="flex flex-wrap gap-1">
                {report.badges.map((b: any) => (
                  <span key={b.id} className="text-lg" title={b.name}>{b.icon}</span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
            <p>📚 {report.studySets} study sets created</p>
            <p>🗺️ {report.conceptMaps} concept maps generated</p>
            <p>✅ {report.completedPathItems} path items completed</p>
            <p>🔥 {report.streak} day streak</p>
          </div>

          <p className="text-center text-[10px] text-gray-400">
            Tip: Use your browser's Print → Save as PDF to export this report.
          </p>
        </div>
      )}
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════════
 * AI Teacher Chat Modal
 * ════════════════════════════════════════════════════════════════ */
export function AITeacherChatModal({ open, onClose, topicId, room }: ModalProps) {
  const { setScreen } = useApp();
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = `Hi! I'm ${room?.aiTeacherName ?? "Professor Bloom"}. What would you like to learn about ${room?.topic?.name ?? "this topic"} today?`;
      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, [open, room, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    setShowUpgrade(false);
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    try {
      const r = await fetch(`/api/study-room/${topicId}/ai-teacher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          history: next.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setError(d.error);
          setShowUpgrade(true);
        } else {
          throw new Error(d.error ?? "Failed");
        }
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: d.reply }]);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <ModalShell title={`Chat with ${room?.aiTeacherName ?? "Professor Bloom"}`} icon={Bot} onClose={onClose} maxWidth="max-w-md">
      <div ref={scrollRef} className="space-y-2 max-h-[50vh] overflow-y-auto pb-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-900"}`}>
              {m.role === "assistant" && (
                <span className="text-base mr-1">{room?.aiTeacherAvatar ?? "🧙‍♂️"}</span>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3 py-2 bg-gray-100">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            </div>
          </div>
        )}
        {error && !showUpgrade && (
          <p className="text-xs text-rose-600 text-center p-2">{error}</p>
        )}
        {showUpgrade && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
            <span className="text-2xl">🥲</span>
            <p className="mt-1 text-xs font-semibold text-gray-900">{error}</p>
            <button onClick={() => setScreen("premium")} className="mt-2 px-4 h-8 rounded-full bg-indigo-600 text-white text-xs font-semibold">
              Upgrade Now →
            </button>
          </div>
        )}
      </div>
      <div className="flex items-end gap-1.5 pt-2 border-t border-gray-100">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask anything…"
          rows={1}
          className="flex-1 p-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 resize-none max-h-24"
        />
        <button onClick={send} disabled={busy || !input.trim()} className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      <p className="mt-1 text-[9px] text-gray-400 text-center">50 tokens per message · Free: 10/day</p>
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Daily Review Modal
 * ════════════════════════════════════════════════════════════════ */
export function DailyReviewModal({ open, onClose, topicId, onComplete }: ModalProps & { onComplete: () => void }) {
  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/study-room/${topicId}/daily-review`, { method: "POST" });
      const d = await r.json();
      if (r.ok && d.dailyReview) {
        setReview(d.dailyReview);
        if (d.alreadyCompleted) {
          setSubmitted(true);
        }
      }
    } catch {}
    setLoading(false);
  }, [topicId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const submit = async () => {
    setBusy(true);
    const items = review?.items ?? [];
    const results = items.map((it: any) => {
      const userAns = answers[it.itemId];
      let score = 0;
      if (it.type === "quiz" && it.correctIndex !== null) {
        score = userAns === it.correctIndex ? 1 : 0;
      } else if (it.type === "flashcard") {
        score = userAns === "known" ? 1 : 0;
      }
      return { itemId: it.itemId, score };
    });
    try {
      const r = await fetch(`/api/study-room/${topicId}/complete-daily-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      const d = await r.json();
      if (r.ok) {
        const avgScore = results.reduce((s: number, r: any) => s + r.score, 0) / results.length;
        setToast(`Daily review complete! Score: ${Math.round(avgScore * 100)}%${d.leveledUp ? " — Level up! 🎉" : ""}`);
        setSubmitted(true);
        setTimeout(() => {
          setToast(null);
          onComplete();
          onClose();
        }, 2500);
      }
    } catch {}
    setBusy(false);
  };

  if (!open) return null;
  const items = review?.items ?? [];
  return (
    <ModalShell title="Daily Review" icon={Sparkles} onClose={onClose} maxWidth="max-w-md">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
      ) : submitted ? (
        <div className="text-center py-6">
          <p className="text-4xl">✓</p>
          <p className="mt-2 text-sm font-bold text-gray-900">Today's review complete!</p>
          <p className="text-xs text-gray-500 mt-1">Come back tomorrow for more.</p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-6">No review items available.</p>
      ) : (
        <div className="space-y-3">
          {items.map((it: any, idx: number) => (
            <div key={it.itemId} className="rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-[10px] text-gray-500 mb-1">Q{idx + 1} · {it.type}</p>
              <p className="text-sm font-semibold text-gray-900">{it.question}</p>
              {it.type === "quiz" && Array.isArray(it.options) && it.options.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-1">
                  {it.options.map((opt: string, oi: number) => (
                    <button
                      key={oi}
                      onClick={() => setAnswers({ ...answers, [it.itemId]: oi })}
                      className={`text-left p-2 rounded-lg text-xs border ${answers[it.itemId] === oi ? "bg-indigo-100 border-indigo-400" : "bg-white border-gray-200"}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => setAnswers({ ...answers, [it.itemId]: "known" })} className={`flex-1 p-2 rounded-lg text-xs font-semibold ${answers[it.itemId] === "known" ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-700 border border-gray-200"}`}>
                    ✓ Got it
                  </button>
                  <button onClick={() => setAnswers({ ...answers, [it.itemId]: "unknown" })} className={`flex-1 p-2 rounded-lg text-xs font-semibold ${answers[it.itemId] === "unknown" ? "bg-rose-100 text-rose-700" : "bg-white text-gray-700 border border-gray-200"}`}>
                    ✗ Need review
                  </button>
                </div>
              )}
            </div>
          ))}
          <button
            onClick={submit}
            disabled={busy || items.some((it: any) => answers[it.itemId] === undefined)}
            className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {busy ? "Submitting…" : "Submit Review"}
          </button>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Mini-Games Modal
 * ════════════════════════════════════════════════════════════════ */
export function MiniGamesModal({ open, onClose, topicId }: ModalProps) {
  const games = [
    { key: "matching", label: "Matching", desc: "Match terms to definitions", emoji: "🃏", color: "from-amber-400 to-orange-500" },
    { key: "fillblank", label: "Fill-in-the-Blank", desc: "Type the missing word", emoji: "✏️", color: "from-emerald-400 to-teal-500" },
    { key: "spinwheel", label: "Spin the Wheel", desc: "Random topic quiz", emoji: "🎯", color: "from-fuchsia-400 to-pink-500" },
  ];

  if (!open) return null;
  return (
    <ModalShell title="Mini-Games" icon={Gamepad2} onClose={onClose}>
      <div className="space-y-2">
        {games.map((g) => (
          <button
            key={g.key}
            onClick={() => {
              alert(`${g.label} — coming soon! Use the practice tabs above for now.`);
            }}
            className="w-full rounded-xl bg-gradient-to-br text-white p-3 flex items-center gap-3 text-left"
            style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-from), var(--tw-gradient-to))` }}
          >
            <span className="text-3xl">{g.emoji}</span>
            <div>
              <p className="text-sm font-bold">{g.label}</p>
              <p className="text-[10px] opacity-90">{g.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 ml-auto" />
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-gray-400 text-center">
        Mini-games use your existing flashcards & quizzes. Free for all users.
      </p>
    </ModalShell>
  );
}
