"use client";

import { useEffect, useState, useRef, useCallback, type ReactElement } from "react";
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
  Copy,
  Check,
  RotateCw,
  Download,
  Code,
} from "lucide-react";
import { useApp } from "../store";
import { GraphRenderer, type GraphSpec } from "./GraphRenderers";

type Attachment = {
  type: "video" | "image" | "graph" | "conceptmap" | string;
  url: string | null;
  caption: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  createdAt: string;
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages?: ChatMsg[];
};

type ConceptMapSpec = {
  title?: string;
  nodes: Array<{ id: string; label: string; color?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};

/**
 * AITutorChat — Phase 28+
 *
 * ChatGPT-style persistent AI Tutor:
 * - Conversations saved to DB (never lost on refresh)
 * - Scroll back through past messages
 * - Multiple conversations (like ChatGPT sidebar)
 * - AI can fetch YouTube videos, images, graphs, concept maps
 * - Curriculum context injected per grade level
 * - Markdown rendering (code blocks, lists, tables, links)
 * - SVG-rendered graphs (function plotters) and concept maps (node/edge diagrams)
 * - Copy / retry buttons on AI messages
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
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, busy]);

  // Load a conversation's messages
  const openConversation = async (id: string) => {
    try {
      const r = await fetch(`/api/tutor/conversations?id=${id}`);
      const d = await r.json();
      if (d.conversation) {
        setActiveConversation(d.conversation);
        // Map DB messages to client ChatMsg shape
        const convMessages: ChatMsg[] = (d.conversation.messages ?? []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
          createdAt: m.createdAt,
        }));
        setMessages(convMessages);
      }
    } catch {}
    setShowSidebar(false);
  };

  // Start a new conversation
  const newConversation = () => {
    setActiveConversation(null);
    setMessages([]);
    setError(null);
    setShowUpgrade(false);
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
    setShowUpgrade(false);

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
        if (d.needsUpgrade || r.status === 402) {
          setError(d.error ?? "Limit reached");
          setShowUpgrade(true);
        } else {
          throw new Error(d.error ?? "Failed");
        }
        return;
      }

      const aiMsg: ChatMsg = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: d.reply,
        attachments: d.attachments,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, aiMsg]);

      if (!activeConversation) {
        setActiveConversation({ id: d.conversationId, title: q.slice(0, 50), updatedAt: new Date().toISOString() });
        await loadConversations();
      } else {
        // Update the conversation list to refresh last message preview
        await loadConversations();
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to send message");
      setMessages((m) => m.filter((msg) => msg.id !== tempUserMsg.id));
    } finally {
      setBusy(false);
    }
  };

  // Retry last failed message
  const retry = () => {
    // Find last user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Remove last AI message (if any)
    setMessages((m) => {
      const copy = [...m];
      // If the last message is from the assistant with no content / error, drop it
      if (copy[copy.length - 1]?.role === "assistant" && !copy[copy.length - 1]?.content) {
        copy.pop();
      }
      return copy;
    });
    send(lastUser.content);
  };

  const copyMessage = (msg: ChatMsg) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const suggestedQuestions = [
    { icon: "🎓", text: "Explain photosynthesis like I'm 10", category: "Science" },
    { icon: "📺", text: "Show me a video about the water cycle", category: "Video" },
    { icon: "📈", text: "Plot these data points: (0,0) (1,5) (2,10) (3,15) and draw a line of best fit", category: "Scatter" },
    { icon: "📊", text: "Make a bar chart of class scores: Math 85, English 72, Science 90, History 68", category: "Bar" },
    { icon: "🥧", text: "Draw a pie chart of budget: Rent 40%, Food 25%, Transport 15%, Savings 20%", category: "Pie" },
    { icon: "⭕", text: "Show a Venn diagram of sets A, B, and C with their intersection", category: "Venn" },
    { icon: "➖", text: "Draw -2 ≤ x ≤ 3 on a number line", category: "Number Line" },
    { icon: "🌳", text: "Make a probability tree diagram for two coin flips", category: "Tree" },
    { icon: "📐", text: "Draw triangle ABC with vertices at (0,0), (4,0), (2,3) — label sides", category: "Geometry" },
    { icon: "📦", text: "Draw a box plot comparing class A and class B test scores", category: "Statistics" },
    { icon: "➡️", text: "Draw vectors F1 = (3,4) and F2 = (-2,1) on a coordinate plane", category: "Vectors" },
    { icon: "🧠", text: "Make a concept map of the human digestive system", category: "Concept" },
    { icon: "🌀", text: "Draw a slope field for dy/dx = x - y", category: "Differential Eq" },
    { icon: "🌿", text: "Make a stem-and-leaf plot of: 23 25 28 31 32 35 38 42 45 48", category: "Statistics" },
    { icon: "🧊", text: "Draw a 3D cube with dashed hidden edges", category: "3D Solid" },
    { icon: "🪢", text: "Draw a trefoil knot diagram", category: "Topology" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen("home")}
              aria-label="Back"
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">AI Tutor</p>
              <p className="text-[10px] text-gray-500 leading-tight">
                {activeConversation ? activeConversation.title : "New chat"}
              </p>
            </div>
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
                <div className="p-4 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                </div>
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
                <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                  Ask anything — I can <span className="text-indigo-600 font-medium">fetch videos</span>,{" "}
                  <span className="text-emerald-600 font-medium">draw 16 kinds of graphs</span> (scatter, bar, pie, Venn, slope fields, stem-leaf, 3D solids, knots & more),{" "}
                  <span className="text-violet-600 font-medium">build concept maps</span>, and{" "}
                  <span className="text-amber-600 font-medium">render any custom SVG drawing</span>. Your chat history is saved automatically.
                </p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q.text}
                      onClick={() => send(q.text)}
                      className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-left hover:border-indigo-300 hover:bg-indigo-50/40 transition flex items-start gap-2"
                    >
                      <span className="text-lg">{q.icon}</span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-700">{q.text}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{q.category}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id || i}
                  msg={msg}
                  onCopy={() => copyMessage(msg)}
                  onRetry={msg.role === "user" && i === messages.length - 1 ? retry : undefined}
                  copied={copiedId === msg.id}
                />
              ))
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                </div>
              </div>
            )}
            {error && !showUpgrade && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                <span>{error}</span>
                <button onClick={retry} className="text-rose-600 hover:text-rose-800 underline font-semibold">
                  Retry
                </button>
              </div>
            )}
            {showUpgrade && (
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 p-4 text-center">
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

          {/* Input bar */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3 pb-safe">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 max-w-3xl mx-auto"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask anything… (try 'plot (0,0) (1,5) (2,10)' or 'draw a 3D cube' or 'draw a trefoil knot')"
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
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              Messages saved to your account · Try: scatter, bar, pie, Venn, number line, tree, vector, polygon, box plot, slope field, stem-leaf, frequency polygon, 3D solid, knot, or any custom SVG drawing
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  onCopy,
  onRetry,
  copied,
}: {
  msg: ChatMsg;
  onCopy: () => void;
  onRetry?: () => void;
  copied: boolean;
}) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className={`max-w-[85%] ${isUser ? "" : "flex gap-2 w-full sm:max-w-[85%]"}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              isUser
                ? "bg-indigo-600 text-white rounded-br-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
            }`}
          >
            <MarkdownContent content={msg.content} isUser={isUser} />
          </div>

          {/* Attachments */}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mt-2 space-y-3">
              {msg.attachments.map((att, i) => (
                <AttachmentRenderer key={i} attachment={att} />
              ))}
            </div>
          )}

          {/* Action buttons on AI messages */}
          {!isUser && (
            <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={onCopy}
                className="px-2 py-1 rounded-md hover:bg-gray-100 text-gray-500 text-[10px] flex items-center gap-1"
                title="Copy"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-2 py-1 rounded-md hover:bg-gray-100 text-gray-500 text-[10px] flex items-center gap-1"
                  title="Regenerate"
                >
                  <RotateCw className="w-3 h-3" /> Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentRenderer({ attachment }: { attachment: Attachment }) {
  if (attachment.type === "video" && attachment.url) {
    const ytMatch = attachment.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    const videoId = ytMatch?.[1];
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-[10px] font-bold uppercase text-rose-500">Video</span>
        </div>
        {videoId ? (
          <div className="aspect-video bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              className="w-full h-full"
              allowFullScreen
              title={attachment.caption}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        ) : (
          <div className="p-3">
            <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
              {attachment.caption} →
            </a>
          </div>
        )}
        <p className="text-[11px] text-gray-600 px-3 pb-2 pt-1">{attachment.caption}</p>
      </div>
    );
  }

  if (attachment.type === "image" && attachment.url) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[10px] font-bold uppercase text-emerald-500">Image</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.url} alt={attachment.caption} className="w-full max-h-80 object-contain bg-gray-50" />
        <p className="text-[11px] text-gray-600 px-3 py-2">{attachment.caption}</p>
      </div>
    );
  }

  if (attachment.type === "graph") {
    let spec: GraphSpec | null = null;
    try {
      spec = JSON.parse(attachment.caption);
    } catch {
      spec = null;
    }
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase text-indigo-500">Graph</span>
        </div>
        {spec ? <GraphRenderer spec={spec} /> : <p className="text-xs text-gray-600">{attachment.caption}</p>}
      </div>
    );
  }

  if (attachment.type === "conceptmap") {
    let spec: ConceptMapSpec | null = null;
    try {
      spec = JSON.parse(attachment.caption);
    } catch {
      spec = null;
    }
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Brain className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-[10px] font-bold uppercase text-violet-500">Concept Map</span>
        </div>
        {spec ? (
          // Route concept maps through the unified graph renderer (network type)
          <GraphRenderer spec={{ ...spec, type: "network" }} />
        ) : (
          <p className="text-xs text-gray-600">{attachment.caption}</p>
        )}
      </div>
    );
  }

  return null;
}

// =====================================================================
// Markdown Renderer — handles code blocks, lists, bold/italic, links
// =====================================================================
function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  // Split content into blocks: code blocks vs. inline content
  const blocks: Array<{ type: "code" | "text"; lang?: string; content: string }> = [];
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    blocks.push({
      type: "code",
      lang: match[1] || "text",
      content: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    blocks.push({ type: "text", content: content.slice(lastIndex) });
  }
  // If no blocks were created (no code blocks), use the entire content as text
  if (blocks.length === 0) {
    blocks.push({ type: "text", content });
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === "code") {
          // Skip mathgraph/conceptmap code blocks — they are rendered as attachments
          if (block.lang === "mathgraph" || block.lang === "conceptmap") return null;
          // Also skip JSON / text blocks that look like graph specs (since the
          // server has parsed them into attachments already). Check if the
          // block content starts with `{"type": "..."` where type is one of
          // our known graph types.
          const graphTypeMatch = block.content.match(/^\{\s*"type"\s*:\s*"(\w+)"/);
          const KNOWN_GRAPH_TYPES = new Set([
            "function", "scatter", "bar", "histogram", "pie", "venn",
            "numberline", "tree", "network", "vector", "polygon", "boxplot",
            "slopefield", "stemleaf", "frequency_polygon", "freeform",
          ]);
          if (
            (block.lang === "json" || block.lang === "text" || block.lang === "") &&
            graphTypeMatch && KNOWN_GRAPH_TYPES.has(graphTypeMatch[1])
          ) {
            return null;
          }
          return <CodeBlock key={i} code={block.content} lang={block.lang} />;
        }
        return <TextBlock key={i} content={block.content} isUser={isUser} />;
      })}
    </div>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-lg bg-gray-900 text-gray-100 p-3 my-2 overflow-x-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase text-gray-400 font-mono">{lang}</span>
        <button onClick={copy} className="text-gray-400 hover:text-white">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">{code}</pre>
    </div>
  );
}

function TextBlock({ content, isUser }: { content: string; isUser: boolean }) {
  // Render line-by-line with markdown inline formatting
  const lines = content.split("\n");
  const elements: ReactElement[] = [];
  let listBuffer: Array<{ type: "ul" | "ol"; items: string[] }> = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (listBuffer.length > 0) {
      // Combine all consecutive lists of same type
      const ulItems: string[] = [];
      const olItems: string[] = [];
      for (const l of listBuffer) {
        if (l.type === "ul") ulItems.push(...l.items);
        else olItems.push(...l.items);
      }
      if (ulItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc pl-5 my-1 space-y-0.5">
            {ulItems.map((it, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(it, isUser) }} />
            ))}
          </ul>
        );
      }
      if (olItems.length > 0) {
        elements.push(
          <ol key={`ol-${elements.length}`} className="list-decimal pl-5 my-1 space-y-0.5">
            {olItems.map((it, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(it, isUser) }} />
            ))}
          </ol>
        );
      }
      listBuffer = [];
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Unordered list item: "- " or "* "
    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (ulMatch) {
      currentList = { type: "ul", items: [ulMatch[1]] };
      listBuffer.push(currentList);
      continue;
    }
    // Ordered list item: "1. "
    const olMatch = line.match(/^\s*\d+\.\s+(.*)/);
    if (olMatch) {
      currentList = { type: "ol", items: [olMatch[1]] };
      listBuffer.push(currentList);
      continue;
    }
    // Empty line — flush list
    if (line.trim() === "") {
      flushList();
      continue;
    }
    // Regular paragraph
    flushList();
    elements.push(
      <p
        key={`p-${i}`}
        className="leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line, isUser) }}
      />
    );
  }
  flushList();

  return <div className="space-y-1">{elements}</div>;
}

function renderInlineMarkdown(line: string, isUser: boolean): string {
  // Escape HTML
  let html = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    `<code style="background:${isUser ? "rgba(255,255,255,0.2)" : "#f3f4f6"};padding:2px 4px;border-radius:4px;font-family:monospace;font-size:0.85em;">$1</code>`
  );
  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener" style="color:${isUser ? "#bfdbfe" : "#4F46E5"};text-decoration:underline;">$1</a>`
  );
  return html || "&nbsp;";
}
