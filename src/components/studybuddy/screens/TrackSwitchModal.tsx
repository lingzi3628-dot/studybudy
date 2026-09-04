"use client";

/**
 * TrackSwitchModal — Phase 61
 *
 * A full-screen "portal" that lets users switch between education tracks
 * at any time. Each track is a "world" with its own buddies, tools,
 * and AI Tutor persona.
 *
 * Design:
 *   - Full-screen overlay with a gradient background
 *   - 7 track cards in a grid, each showing:
 *     - Large emoji + name
 *     - Description
 *     - "What you get" (buddies + tools)
 *     - Accent gradient
 *   - When the user picks a track:
 *     1. PUT /api/user/profile with the new track
 *     2. Clear the stored AI Tutor buddy so the new track's default kicks in
 *     3. Show a brief "Entering [track name]..." animation
 *     4. Reload the page so page.tsx routes to the correct Home
 *
 * This modal is triggered from:
 *   - Profile → TrackSwitcher dropdown (existing)
 *   - AITutorChat → "Switch track" button (new)
 *   - HigherEdHome / track homes → "Switch track" button (new)
 */

import { useState, useEffect } from "react";
import {
  X, Loader2, GraduationCap, Code, Database, Brain, Bot, Wrench,
  Sparkles, ArrowRight, Check,
} from "lucide-react";

export type TrackInfo = {
  key: string;
  label: string;
  emoji: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  accent: string;
  defaultBuddy: string;
  buddies: string[];
  tools: string[];
  worlds: string;
};

export const ALL_TRACKS: TrackInfo[] = [
  {
    key: "k12",
    label: "K-12 School",
    emoji: "📚",
    icon: GraduationCap,
    desc: "Kenya CBC / KCSE / KPSEA / KJSEA curriculum",
    accent: "from-indigo-500 to-violet-500",
    defaultBuddy: "study",
    buddies: ["📚 StudyBuddy"],
    tools: ["32 graph types", "Exam generator", "Flashcards + FSRS-5", "Concept maps"],
    worlds: "PP1 → Grade 9 → Form 1-4. Full Kenya curriculum with lessons, quizzes, and exams.",
  },
  {
    key: "dev",
    label: "Coding & Programming",
    emoji: "💻",
    icon: Code,
    desc: "Python, JavaScript, TypeScript, Go, Rust",
    accent: "from-emerald-500 to-teal-500",
    defaultBuddy: "dev",
    buddies: ["💻 DevBuddy", "🌐 WebBuddy", "⚙️ BackendBuddy"],
    tools: ["CodeMirror editor", "Python (Pyodide)", "JS sandbox", "Multi-file projects"],
    worlds: "Write, run, debug, and ship code. Multi-language sandbox in your browser.",
  },
  {
    key: "data",
    label: "Data Science",
    emoji: "📊",
    icon: Database,
    desc: "pandas, SQL, notebooks, EDA, visualization",
    accent: "from-sky-500 to-cyan-500",
    defaultBuddy: "data",
    buddies: ["📊 DataBuddy"],
    tools: ["Jupyter notebook", "Pre-loaded datasets", "Matplotlib charts", "SQL sandbox"],
    worlds: "Jupyter-style notebooks running 100% in-browser. Load titanic, iris, and more.",
  },
  {
    key: "ml",
    label: "Machine Learning",
    emoji: "🧠",
    icon: Brain,
    desc: "Train, visualize, evaluate neural networks",
    accent: "from-violet-500 to-fuchsia-500",
    defaultBuddy: "ml",
    buddies: ["🧠 MLBuddy", "📊 DataBuddy"],
    tools: ["TensorFlow.js", "XOR / Iris / MNIST demos", "Loss curves", "Decision boundaries"],
    worlds: "Build and train neural networks in your browser. No GPU server, no Python install.",
  },
  {
    key: "aiapp",
    label: "AI App Dev",
    emoji: "🤖",
    icon: Bot,
    desc: "Build AI apps: prompts, RAG, agents, evals",
    accent: "from-fuchsia-500 to-purple-600",
    defaultBuddy: "ai",
    buddies: ["🤖 AIBuddy", "💻 DevBuddy", "🌐 WebBuddy"],
    tools: ["Prompt playground", "In-browser RAG", "Agent builder", "Model evals"],
    worlds: "Build production AI apps. Test prompts, build RAG pipelines, create autonomous agents.",
  },
  {
    key: "tvet",
    label: "Technical (TVET)",
    emoji: "🔧",
    icon: Wrench,
    desc: "Electrical, mechanical, ICT, hospitality, automotive",
    accent: "from-amber-500 to-red-500",
    defaultBuddy: "tvet",
    buddies: ["🔧 TVETBuddy"],
    tools: ["Circuit simulator", "Gear train calc", "Network topology", "PLC ladder logic"],
    worlds: "Kenya TVET CDACC curriculum. Hands-on simulators for trades.",
  },
  {
    key: "mixed",
    label: "Multiple Interests",
    emoji: "🎯",
    icon: Sparkles,
    desc: "All 9 buddies — pick per task",
    accent: "from-rose-500 to-pink-500",
    defaultBuddy: "study",
    buddies: ["All 9 buddies"],
    tools: ["Everything", "Switch anytime", "No restrictions"],
    worlds: "Full access to every buddy, every tool, every track. The power user mode.",
  },
];

export function TrackSwitchModal({
  open,
  onClose,
  currentTrack,
  onTrackChanged,
}: {
  open: boolean;
  onClose: () => void;
  currentTrack: string;
  onTrackChanged?: (newTrack: string) => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleSwitch = async (trackKey: string) => {
    if (trackKey === currentTrack) {
      onClose();
      return;
    }

    setSwitching(true);
    setSwitchingTo(trackKey);

    try {
      // 1. Save the new track
      await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: trackKey }),
      });

      // 2. Clear the stored AI Tutor buddy so the new track's default kicks in
      try { localStorage.removeItem("studybuddy_active_buddy"); } catch { /* ignore */ }

      // 3. Notify the parent
      onTrackChanged?.(trackKey);

      // 4. Brief animation, then reload
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (e) {
      setSwitching(false);
      setSwitchingTo(null);
      alert("Failed to switch track. Please try again.");
    }
  };

  const switchingTrack = ALL_TRACKS.find((t) => t.key === switchingTo);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Background */}
      <div className="absolute inset-0 bg-gray-900/95 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Choose your world 🌍
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Each track unlocks different AI buddies, tools, and experiences. Switch anytime — your projects are saved.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current track indicator */}
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
          <span>Current:</span>
          <span className="font-semibold text-white">
            {ALL_TRACKS.find((t) => t.key === currentTrack)?.emoji}{" "}
            {ALL_TRACKS.find((t) => t.key === currentTrack)?.label}
          </span>
        </div>

        {/* Track grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_TRACKS.map((track) => {
            const isActive = track.key === currentTrack;
            const isSwitching = switchingTo === track.key;
            const Icon = track.icon;
            return (
              <button
                key={track.key}
                onClick={() => handleSwitch(track.key)}
                disabled={switching}
                className={`relative text-left rounded-2xl border-2 p-4 transition-all overflow-hidden ${
                  isActive
                    ? "border-white/40 bg-white/10"
                    : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10"
                } ${switching ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
              >
                {/* Accent gradient strip */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${track.accent}`} />

                {/* Icon + name */}
                <div className="flex items-center gap-2 mb-2 mt-1">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${track.accent} flex items-center justify-center text-xl flex-shrink-0`}>
                    {track.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{track.label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{track.desc}</p>
                  </div>
                  {isActive && (
                    <span className="text-[9px] font-bold uppercase text-emerald-400 flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                  {isSwitching && (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  )}
                </div>

                {/* What you get */}
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-bold">Buddies</p>
                  <div className="flex flex-wrap gap-1">
                    {track.buddies.map((b, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 mt-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-bold">Tools</p>
                  <div className="flex flex-wrap gap-1">
                    {track.tools.map((t, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-500">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Worlds description */}
                <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                  {track.worlds}
                </p>

                {/* Hover arrow */}
                {!isActive && !switching && (
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition">
                    <ArrowRight className="w-4 h-4 text-white/50" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <p className="mt-4 text-center text-xs text-gray-500">
          💡 Your projects, notes, and chat history are saved across all tracks. Switch freely.
        </p>
      </div>

      {/* Switching animation overlay */}
      {switching && switchingTrack && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-900/95">
          <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${switchingTrack.accent} flex items-center justify-center text-4xl mb-4 animate-pulse`}>
            {switchingTrack.emoji}
          </div>
          <p className="text-lg font-bold text-white">Entering {switchingTrack.label}…</p>
          <p className="text-sm text-gray-400 mt-1">{switchingTrack.worlds}</p>
          <Loader2 className="w-6 h-6 animate-spin text-white mt-4" />
        </div>
      )}
    </div>
  );
}
