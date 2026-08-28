"use client";

/**
 * StudyGroupScreen — Phase 46
 *
 * Shows a study group's chat + members + mini leaderboard.
 *
 * Replaces the empty `onOpenGroup={() => {}}` handler in StudyRoom.tsx.
 * Uses HTTP polling (every 3 seconds) for chat messages instead of
 * websockets — keeps deployment simple, works on standard Next.js.
 *
 * Layout:
 *   - Header with group name + invite code + back button
 *   - Top: members row (avatars + names + XP)
 *   - Middle: chat messages (auto-scroll to bottom on new messages)
 *   - Bottom: chat input (text + send button)
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { ChevronLeft, Send, Users, Loader2, AlertCircle, Copy, Check } from "lucide-react";
import { useApp } from "../store";

type Message = {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  body: string;
  createdAt: string;
};

type Member = {
  id: string;
  name: string;
  avatarUrl: string | null;
  xp: number;
  level: number;
  joinedAt: string;
  isYou: boolean;
};

export function StudyGroupScreen() {
  const { setScreen, activeStudyGroupId } = useApp();
  const [group, setGroup] = useState<{ id: string; name: string; inviteCode: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<any>(null);
  const lastFetchRef = useRef<string | null>(null);

  // Load group info + members + initial messages on mount
  useEffect(() => {
    if (!activeStudyGroupId) {
      setError("No group selected");
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        // Group info (uses the existing [id] route)
        const r1 = await fetch(`/api/study-groups/${activeStudyGroupId}`);
        if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
        const d1 = await r1.json();
        setGroup(d1.group ?? null);

        // Members
        const r2 = await fetch(`/api/study-groups/${activeStudyGroupId}/members`);
        if (r2.ok) {
          const d2 = await r2.json();
          setMembers(d2.members ?? []);
        }

        // Initial messages
        const r3 = await fetch(`/api/study-groups/${activeStudyGroupId}/chat`);
        if (r3.ok) {
          const d3 = await r3.json();
          setMessages(d3.messages ?? []);
          lastFetchRef.current = new Date().toISOString();
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeStudyGroupId]);

  // Polling — fetch new messages every 3 seconds
  const pollMessages = useCallback(async () => {
    if (!activeStudyGroupId || !lastFetchRef.current) return;
    try {
      const r = await fetch(
        `/api/study-groups/${activeStudyGroupId}/chat?since=${encodeURIComponent(lastFetchRef.current)}`
      );
      if (!r.ok) return;
      const d = await r.json();
      const newMsgs = d.messages ?? [];
      if (newMsgs.length > 0) {
        setMessages((prev) => [...prev, ...newMsgs]);
      }
      lastFetchRef.current = new Date().toISOString();
    } catch { /* ignore polling errors */ }
  }, [activeStudyGroupId]);

  useEffect(() => {
    pollTimerRef.current = setInterval(pollMessages, 3000);
    return () => clearInterval(pollTimerRef.current);
  }, [pollMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !activeStudyGroupId) return;
    setSending(true);
    try {
      const r = await fetch(`/api/study-groups/${activeStudyGroupId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setMessages((prev) => [...prev, d.message]);
      setInput("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const copyInviteCode = async () => {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
        <AlertCircle className="w-8 h-8 text-rose-500" />
        <p className="mt-2 text-sm text-rose-600">{error ?? "Group not found"}</p>
        <button onClick={() => setScreen("study")} className="mt-4 px-4 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold">
          Back to Study Room
        </button>
      </div>
    );
  }

  // Mini leaderboard: top 5 members by XP
  const topMembers = [...members].sort((a, b) => b.xp - a.xp).slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-2 sticky top-0 z-10">
        <button
          onClick={() => setScreen("study")}
          aria-label="Back"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{group.name}</p>
          <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> {members.length} members
            <button
              onClick={copyInviteCode}
              className="ml-2 text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
              title="Copy invite code"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span className="font-mono">{group.inviteCode}</span>
            </button>
          </p>
        </div>
      </header>

      {/* Top members mini leaderboard */}
      {topMembers.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2.5">
          <p className="text-[10px] font-bold uppercase text-gray-500 mb-1.5">Top members</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {topMembers.map((m, i) => (
              <div
                key={m.id}
                className={`flex-shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-full ${
                  i === 0 ? "bg-amber-50 border border-amber-200" : "bg-gray-100"
                }`}
              >
                <span className="text-[10px] font-bold text-gray-500">#{i + 1}</span>
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                  {(m.name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="text-[11px]">
                  <p className="font-semibold text-gray-900 truncate max-w-[80px]">
                    {m.name}{m.isYou && " (you)"}
                  </p>
                  <p className="text-gray-500 text-[9px]">Lvl {m.level} · {m.xp} XP</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Be the first to say hello 👋</p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = members.find((mem) => mem.id === m.userId)?.isYou ?? false;
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(m.userName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className={`max-w-[75%] ${isMe ? "items-end" : ""} flex flex-col`}>
                  <p className="text-[10px] text-gray-500 mb-0.5">
                    {isMe ? "You" : m.userName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm ${
                      isMe
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-white border border-gray-200 text-gray-900 rounded-bl-sm"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat input */}
      <div className="bg-white border-t border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message..."
            maxLength={1000}
            className="flex-1 h-10 rounded-full bg-gray-100 border border-gray-200 px-4 text-sm outline-none focus:border-indigo-400 focus:bg-white"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-indigo-700"
            aria-label="Send"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
