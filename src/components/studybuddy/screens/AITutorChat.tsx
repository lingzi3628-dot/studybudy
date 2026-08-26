"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  ChevronLeft,
  Send,
  Loader2,
  Trash2,
  Plus,
  MessageSquare,
  X,
  Video,
  Image as ImageIcon,
  GitBranch,
  Brain,
  Bot,
  User as UserIcon,
} from "lucide-react";
import { useApp } from "../store";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ type: string; url: string | null; caption: string }>;
  createdAt: string;
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages?: ChatMsg[];
};

/**
 * AITutorChat — Phase 28
 *
 * ChatGPT-style persistent AI Tutor:
 * - Conversations saved to DB (never lost)
 * - Scroll back through past messages
 * - Multiple conversations (like ChatGPT sidebar)
 * - AI can fetch videos, images, graphs, concept maps
 * - Curriculum context injected per grade level
 */
export function AITutorChat() {
  const { setScreen } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch("/api/tutor/conversations");
      const d = await r.json();
      setConversations(d.conversations ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Load a conversation's messages
  const openConversation = async (id: string) => {
    try {
      const r = await fetch(`/api/tutor/conversations?id=${id}`);
      const d = await r.json();
      if (d.conversation) {
        setActiveConversation(d.conversation);
        setMessages(d.conversation.messages ?? []);
      }
    } catch {}
    setShowSidebar(false);
  };

  // Start a new conversation
  const newConversation = () => {
    setActiveConversation(null);
    setMessages([]);
    setShowSidebar(false);
  };

  // Delete a conversation
  const deleteConversation = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/tutor/conversations?id=${id}`, { method: "DELETE" });
    if (activeConversation?.id === id) {
      setActiveConversation(null);
      setMessages([]);
    }
    await loadConversations();
  };

  // Send a message
  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setError(null);

    // Add user message to UI immediately
    const tempUserMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: q,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg]);

    try {
      const r = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversation?.id ?? null,
          message: q,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setError(d.error);
        } else {
          throw new Error(d.error ?? "Failed");
        }
        return;
      }

      // Add AI reply
      const aiMsg: ChatMsg = {
        id: d.conversationId ? `ai-${Date.now()}` : `ai-${Date.now()}`,
        role: "assistant",
        content: d.reply,
        attachments: d.attachments,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, aiMsg]);

      // If this was a new conversation, reload the list
      if (!activeConversation) {
        // Set the conversation ID so subsequent messages use the same conversation
        setActiveConversation({ id: d.conversationId, title: q.slice(0, 50), updatedAt: new Date().toISOString() });
        await loadConversations();
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to send message");
      // Remove the temp user message on error
      setMessages((m) => m.filter((msg) => msg.id !== tempUserMsg.id));
    } finally {
      setBusy(false);
    }
  };

  const suggestedQuestions = [
    "Explain photosynthesis like I'm 10",
    "Show me a video about the water cycle",
    "Draw a graph of y = x²",
    "Make a concept map of the human digestive system",
    "What's the difference between mitosis and meiosis?",
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setScreen("home")} className="text-gray-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <Bot className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-gray-900">AI Tutor</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={newConversation}
              className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center"
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center"
              title="Chat history"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative">
        {/* Sidebar — conversation history */}
        {showSidebar && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowSidebar(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-gray-200 z-50 overflow-y-auto">
              <div className="p-3 flex items-center justify-between border-b border-gray-100">
                <p className="text-xs font-bold uppercase text-gray-500">Chat History</p>
                <button onClick={() => setShowSidebar(false)} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={newConversation}
                className="w-full p-3 flex items-center gap-2 hover:bg-indigo-50 text-indigo-600 text-sm font-semibold border-b border-gray-100"
              >
                <Plus className="w-4 h-4" /> New chat
              </button>
              {loading ? (
                <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
              ) : conversations.length === 0 ? (
                <p className="p-4 text-xs text-gray-400 text-center">No conversations yet.</p>
              ) : (
                conversations.map((conv) => (
                  <div key={conv.id} className="flex items-center group border-b border-gray-50">
                    <button
                      onClick={() => openConversation(conv.id)}
                      className={`flex-1 p-3 text-left text-xs hover:bg-gray-50 transition ${
                        activeConversation?.id === conv.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"
                      }`}
                    >
                      <p className="truncate">{conv.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </button>
                    <button
                      onClick={() => deleteConversation(conv.id)}
                      className="p-2 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && !busy ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">AI Tutor</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Ask anything — I can search the web for videos, draw graphs, and make concept maps.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 justify-center">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <MessageBubble key={msg.id || i} msg={msg} />
              ))
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                </div>
              </div>
            )}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3">
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="flex items-center gap-2 max-w-3xl mx-auto"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything… (try 'show me a video about photosynthesis')"
                className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-indigo-700 transition flex-shrink-0"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isUser ? "" : "flex gap-2"}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
        <div>
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              isUser
                ? "bg-indigo-600 text-white rounded-br-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
            }`}
          >
            <MarkdownContent content={msg.content} />
          </div>

          {/* Attachments */}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {msg.attachments.map((att, i) => (
                <Attachment key={i} attachment={att} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Attachment({ attachment }: { attachment: { type: string; url: string | null; caption: string } }) {
  if (attachment.type === "video" && attachment.url) {
    // Extract YouTube video ID
    const ytMatch = attachment.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    const videoId = ytMatch?.[1];
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white p-2">
        <p className="text-[10px] font-bold uppercase text-rose-500 flex items-center gap-1 mb-1">
          <Video className="w-3 h-3" /> Video
        </p>
        {videoId ? (
          <div className="aspect-video rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              className="w-full h-full"
              allowFullScreen
              title={attachment.caption}
            />
          </div>
        ) : (
          <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
            {attachment.caption} →
          </a>
        )}
        <p className="text-[10px] text-gray-500 mt-1">{attachment.caption}</p>
      </div>
    );
  }

  if (attachment.type === "graph") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[10px] font-bold uppercase text-indigo-500 flex items-center gap-1 mb-1">
          <GitBranch className="w-3 h-3" /> Graph
        </p>
        <p className="text-xs text-gray-600">{attachment.caption}</p>
      </div>
    );
  }

  if (attachment.type === "conceptmap") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[10px] font-bold uppercase text-violet-500 flex items-center gap-1 mb-1">
          <Brain className="w-3 h-3" /> Concept Map
        </p>
        <p className="text-xs text-gray-600">{attachment.caption}</p>
      </div>
    );
  }

  return null;
}

// Simple markdown renderer
function MarkdownContent({ content }: { content: string }) {
  // Basic markdown: **bold**, *italic*, line breaks, links, code blocks
  const lines = content.split("\n");
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdownLine(line) }} />
      ))}
    </div>
  );
}

function renderMarkdownLine(line: string): string {
  let html = line;
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" style="color:#4F46E5;text-decoration:underline;">$1</a>'
  );
  // Code `code`
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background:#f3f4f6;padding:2px 4px;border-radius:4px;font-family:monospace;font-size:0.85em;">$1</code>'
  );
  return html || "&nbsp;";
}
