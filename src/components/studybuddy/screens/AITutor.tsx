"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Send,
  Trash2,
  Sparkles,
  Loader2,
  Bot,
  User,
  Save,
  Check,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../api";

type ChatMsg = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "Explain photosynthesis like I'm 10",
  "What is a quadratic equation?",
  "Give me 3 Swahili greetings",
  "Solve: 2x + 5 = 15",
];

export function AITutor() {
  const { setScreen } = useApp();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // initial AI greeting
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content:
          "Hi! I'm your AI tutor. Ask me anything — I'll break it down step by step. Try one of the suggestions below, or type your own question.",
      },
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    try {
      const r = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-10).map((m) => ({ role: m.role, content: m.content })), question: q }),
      });
      const d = await r.json();
      if (!r.ok) {
        // Show upgrade card ONLY when the server explicitly says needsUpgrade=true
        // OR status is 402 (genuine upgrade/limit/insufficient tokens scenario)
        const errMsg = d.error ?? d.detail ?? `HTTP ${r.status}`;
        const isUpgrade = d.needsUpgrade === true || r.status === 402;
        if (isUpgrade) {
          setError(errMsg);
          setShowUpgrade(true);
        } else {
          throw new Error(errMsg);
        }
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: d.reply }]);
    } catch (e: any) {
      setError(e?.message ?? "Tutor call failed");
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => {
    setMessages([
      { role: "assistant", content: "Chat cleared. What would you like to learn next?" },
    ]);
    setError(null);
    setShowUpgrade(false);
  };

  const saveAsNotes = async () => {
    // Convert chat to a study set (text-based, no AI re-gen)
    const text = messages
      .map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.content}`)
      .join("\n\n");
    try {
      const res = await api.createStudySet({
        title: `Tutor chat · ${new Date().toLocaleDateString()}`,
        sourceType: "text",
        sourceText: text,
        subject: "Tutor Notes",
        generate: false,
        cards: [
          {
            cardType: "flashcard",
            front: "Summary of my tutor chat",
            back: "Review the conversation below.",
            question: null,
            options: null,
            correctIndex: null,
            explanation: null,
          },
        ],
      });
      // Tiny success toast
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
      void res;
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-3xl mx-auto flex flex-col">
      {/* top bar */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => setScreen("home")}
          aria-label="Exit"
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-indigo-600" /> AI Tutor
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={saveAsNotes}
            aria-label="Save as notes"
            title="Save as study set"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            aria-label="Clear chat"
            title="Clear chat"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`flex items-start gap-2 max-w-[85%] ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-gradient-to-br from-indigo-500 to-violet-500 text-white"
                }`}
              >
                {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </span>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-gray-200 text-gray-900 shadow-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 max-w-[85%]">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center flex-shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </span>
              <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200 shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              </div>
            </div>
          </div>
        )}

        {/* suggested questions (only before user has typed) */}
        {messages.length === 1 && !busy && (
          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Try one of these
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && !showUpgrade && (
          <div className="text-xs text-rose-600 text-center p-2">{error}</div>
        )}

        {showUpgrade && (
          <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 p-4 text-center mx-2">
            <span className="text-3xl">🥲</span>
            <p className="mt-2 text-sm font-semibold text-gray-900">{error}</p>
            <button
              onClick={() => setScreen("premium")}
              className="mt-3 px-6 h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
            >
              Upgrade Now →
            </button>
          </div>
        )}
      </div>

      {/* input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 pb-safe">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask anything…"
            className="flex-1 p-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none max-h-32"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex-shrink-0"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>

      {/* saved toast */}
      {savedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-1.5 animate-in slide-in-from-bottom-4">
          <Check className="w-4 h-4" /> Saved as study set
        </div>
      )}
    </div>
  );
}
