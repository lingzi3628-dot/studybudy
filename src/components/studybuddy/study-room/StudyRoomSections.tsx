"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  X, Loader2, AlertCircle, Play, Pause, RotateCcw, Send,
  Sparkles, Trophy, Flame, Coins, Map as MapIcon, Bot, Send as SendIcon,
  Settings, Music, Timer, FileText, Bookmark, BookOpen, ListChecks,
  Layers, ChevronRight, Volume2, VolumeX, Check, Trash2, Plus,
  Target, Users, Award, Palette, FileDown, Gamepad2, GraduationCap,
} from "lucide-react";
import { useApp } from "../store";

type RoomData = any;

/**
 * StudyRoomHeader — Phase 12b top header
 * Shows: cover image, topic name, user avatar, XP/level, streak, tokens,
 * AI teacher greeting, continue button, daily review CTA.
 */
export function StudyRoomHeader({ room, analytics, gamification, onStartReview, onCustomize, onReport, onNotifications }: {
  room: RoomData;
  analytics: any;
  gamification: any;
  onStartReview: () => void;
  onCustomize: () => void;
  onReport: () => void;
  onNotifications: () => void;
}) {
  const { setScreen } = useApp();
  const topic = room?.topic;
  const cover = room?.coverImageUrl;

  return (
    <header className={`relative overflow-hidden ${cover ? "h-44" : "h-32"} bg-gradient-to-br from-indigo-600 to-violet-700`}>
      {cover && (
        <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="relative px-4 pt-4 pb-3 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide opacity-80">{topic?.subject ?? "Study Room"}</p>
            <h1 className="text-lg font-bold truncate">{topic?.name ?? "Topic"}</h1>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {gamification?.level && (
              <button onClick={() => setScreen("progress")} className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full text-xs font-semibold">
                <Trophy className="w-3 h-3" /> L{gamification.level}
              </button>
            )}
            <button onClick={onNotifications} className="relative w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-rose-500 rounded-full text-[8px] flex items-center justify-center font-bold">
                {analytics?.dueCards ?? 0}
              </span>
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {gamification?.streak !== undefined && (
            <span className="flex items-center gap-1 bg-amber-500/30 px-2 py-0.5 rounded-full text-xs font-semibold">
              <Flame className="w-3 h-3" /> {gamification.streak} streak
            </span>
          )}
          {gamification?.xp !== undefined && (
            <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
              <Sparkles className="w-3 h-3" /> {gamification.xp.toLocaleString()} XP
            </span>
          )}
          {analytics?.readiness !== undefined && (
            <span className="flex items-center gap-1 bg-emerald-500/30 px-2 py-0.5 rounded-full text-xs font-semibold">
              <Target className="w-3 h-3" /> {analytics.readiness}% ready
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onStartReview}
            className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-white text-indigo-700 text-xs font-bold hover:bg-white/90"
          >
            <Sparkles className="w-3.5 h-3.5" /> Daily Review
          </button>
          <button onClick={onCustomize} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={onReport} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
            <FileDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * AITeacherCard — Phase 12b left-sidebar AI teacher
 * Shows avatar, speech bubble, quick actions.
 */
export function AITeacherCard({ room, onAsk, onStartReview, onOpenChat }: {
  room: RoomData;
  onAsk: () => void;
  onStartReview: () => void;
  onOpenChat: () => void;
}) {
  // Compute greeting as derived state (no setState in effect)
  const hour = new Date().getHours();
  const name = room?.aiTeacherName ?? "Professor Bloom";
  const topicName = room?.topic?.name ?? "this topic";
  let timeGreeting = "Hello";
  if (hour < 12) timeGreeting = "Good morning";
  else if (hour < 18) timeGreeting = "Good afternoon";
  else timeGreeting = "Good evening";

  const greeting = `${timeGreeting}! I'm ${name}. Ready to dive into ${topicName}? You can ask me anything, or start with today's review.`;

  const avatar = room?.aiTeacherAvatar ?? "🧙‍♂️";

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center text-2xl">
          {avatar}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{room?.aiTeacherName ?? "Professor Bloom"}</p>
          <p className="text-[10px] text-gray-500 capitalize">{room?.aiTeacherStyle ?? "encouraging"} · AI Teacher</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-violet-100 p-3 text-xs text-gray-700 leading-relaxed shadow-sm">
        {greeting}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button
          onClick={onStartReview}
          className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-white hover:bg-violet-50 transition border border-violet-100"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          <span className="text-[9px] font-semibold text-gray-700">Review</span>
        </button>
        <button
          onClick={onOpenChat}
          className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-white hover:bg-violet-50 transition border border-violet-100"
        >
          <Bot className="w-3.5 h-3.5 text-violet-600" />
          <span className="text-[9px] font-semibold text-gray-700">Ask</span>
        </button>
        <button
          onClick={onAsk}
          className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-white hover:bg-violet-50 transition border border-violet-100"
        >
          <SendIcon className="w-3.5 h-3.5 text-violet-600" />
          <span className="text-[9px] font-semibold text-gray-700">Hint</span>
        </button>
      </div>
    </div>
  );
}

/**
 * ToolsWorkbench — grid of tool buttons
 */
export function ToolsWorkbench({ onTool }: { onTool: (tool: string) => void }) {
  const tools = [
    { key: "classroom", label: "Classroom", icon: GraduationCap, color: "bg-amber-50 text-amber-600" },
    { key: "graph", label: "Graph", icon: MapIcon, color: "bg-emerald-50 text-emerald-600" },
    { key: "flashcards", label: "Flashcards", icon: Layers, color: "bg-amber-50 text-amber-600" },
    { key: "quiz", label: "Quiz", icon: ListChecks, color: "bg-rose-50 text-rose-600" },
    { key: "conceptMap", label: "Concept Map", icon: MapIcon, color: "bg-fuchsia-50 text-fuchsia-600" },
    { key: "whiteboard", label: "Solver", icon: Bot, color: "bg-sky-50 text-sky-600" },
    { key: "focus", label: "Focus Timer", icon: Timer, color: "bg-indigo-50 text-indigo-600" },
    { key: "notes", label: "Notes", icon: FileText, color: "bg-violet-50 text-violet-600" },
    { key: "music", label: "Music", icon: Music, color: "bg-purple-50 text-purple-600" },
    { key: "games", label: "Mini-Games", icon: Gamepad2, color: "bg-pink-50 text-pink-600" },
  ];

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm">
      <h3 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
        <Target className="w-3.5 h-3.5 text-indigo-500" /> Tools
      </h3>
      <div className="grid grid-cols-3 gap-1.5">
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => onTool(t.key)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-gray-50 transition group"
            >
              <span className={`w-9 h-9 rounded-full flex items-center justify-center ${t.color}`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-[9px] font-medium text-gray-700">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * BulletinBoard — progress chart, badges, due cards, leaderboard
 */
export function BulletinBoard({ analytics, gamification, onReport }: {
  analytics: any;
  gamification: any;
  onReport: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm space-y-3">
      <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5 text-amber-500" /> Bulletin Board
      </h3>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-[10px] text-gray-500">Mastery</p>
          <p className="text-sm font-bold text-indigo-600">{Math.round((analytics?.topicMastery ?? 0) * 100)}%</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-[10px] text-gray-500">Accuracy</p>
          <p className="text-sm font-bold text-emerald-600">{Math.round((analytics?.accuracy ?? 0) * 100)}%</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-[10px] text-gray-500">Due</p>
          <p className="text-sm font-bold text-amber-600">{analytics?.dueCards ?? 0}</p>
        </div>
      </div>

      {/* XP progress to next level */}
      {gamification && (
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500 font-semibold">Level {gamification.level}</span>
            <span className="text-violet-600 font-semibold">{gamification.xp.toLocaleString()} XP</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-600" style={{ width: `${Math.min(100, ((gamification.xp % 250) / 250) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Badges */}
      {gamification?.badges?.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 font-semibold mb-1">Recent Badges</p>
          <div className="flex flex-wrap gap-1">
            {gamification.badges.slice(0, 8).map((b: any) => (
              <span key={b.id} title={b.name} className="text-lg">{b.icon}</span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onReport}
        className="w-full h-8 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 flex items-center justify-center gap-1"
      >
        <FileDown className="w-3 h-3" /> View Report Card
      </button>
    </div>
  );
}

/**
 * DailyGoalsChecklist — daily goals checklist with XP rewards
 */
export function DailyGoalsChecklist({ goals, onUpdate }: {
  goals: any;
  onUpdate: (tasks: any[]) => void;
}) {
  if (!goals?.tasks?.length) return null;
  const tasks = goals.tasks as any[];

  const toggle = (id: string) => {
    const updated = tasks.map((t) => t.id === id ? { ...t, completed: !t.completed } : t);
    onUpdate(updated);
  };

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm">
      <h3 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
        <Target className="w-3.5 h-3.5 text-emerald-500" /> Today's Goals
      </h3>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 text-left"
          >
            <span className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${
              t.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 text-transparent"
            }`}>
              <Check className="w-3 h-3" />
            </span>
            <span className={`flex-1 text-xs ${t.completed ? "text-gray-400 line-through" : "text-gray-700"}`}>
              {t.text}
            </span>
            <span className="text-[9px] text-amber-500 font-semibold flex-shrink-0">+{t.xp ?? 10} XP</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Bookshelf — horizontal scroll of resource cards
 */
export function Bookshelf({ title, resources, onOpen, emptyText, icon: Icon }: {
  title: string;
  resources: any[];
  onOpen: (resource: any) => void;
  emptyText: string;
  icon: any;
}) {
  if (!resources || resources.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-indigo-500" /> {title}
      </h3>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {resources.slice(0, 20).map((r, i) => (
          <button
            key={r.id ?? i}
            onClick={() => onOpen(r)}
            className="flex-shrink-0 w-32 rounded-xl bg-white border border-gray-200 p-2 hover:border-indigo-300 hover:shadow-md transition text-left"
          >
            <div className="aspect-[3/4] rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 mb-1.5 flex items-center justify-center">
              <Icon className="w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-[11px] font-semibold text-gray-900 line-clamp-2">{r.title}</p>
            {r._count?.cards !== undefined && (
              <p className="text-[9px] text-gray-400 mt-0.5">{r._count.cards} cards</p>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * GroupStudySection — shows user's study groups
 */
export function GroupStudySection({ groups, onOpenGroup }: {
  groups: any[];
  onOpenGroup: (groupId: string) => void;
}) {
  if (!groups || groups.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-fuchsia-500" /> Study Groups
      </h3>
      <div className="space-y-1.5">
        {groups.map((m: any) => (
          <button
            key={m.group.id}
            onClick={() => onOpenGroup(m.group.id)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-white border border-gray-200 hover:border-fuchsia-300 transition"
          >
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white flex items-center justify-center text-xs font-bold">
                {m.group.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-xs font-semibold text-gray-900">{m.group.name}</p>
                <p className="text-[9px] text-gray-500">{m.group._count?.members ?? 1} members</p>
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
        ))}
      </div>
    </section>
  );
}
