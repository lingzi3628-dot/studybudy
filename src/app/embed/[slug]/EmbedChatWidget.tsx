"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/**
 * EmbedChatWidget — the actual chat UI for a deployed bot.
 *
 * Client component (uses hooks). Renders the chat header, message list,
 * and input area. POSTs messages to /api/embed/[slug]/messages.
 *
 * Styling is inline (no Tailwind dependency in the embed context) so it
 * works in any iframe without inheriting parent styles.
 */

type Message = {
  role: "user" | "bot";
  text: string;
  source?: "retrieval" | "generative" | "fallback";
  confidence?: number;
  error?: boolean;
};

export function EmbedChatWidget({
  slug,
  name,
  thinkingDelay,
  botMemory: _botMemory,
}: {
  slug: string;
  name: string;
  thinkingDelay: number;
  botMemory: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: `Hi! I'm ${name}. Ask me anything!`,
      source: "retrieval",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", text }]);

    // Respect the bot's configured thinking delay.
    await new Promise((r) => setTimeout(r, (thinkingDelay || 3) * 1000));

    try {
      const r = await fetch(`/api/embed/${slug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMessages((prev) => [...prev, {
          role: "bot",
          text: data.error || "Something went wrong. Please try again.",
          error: true,
        }]);
      } else {
        setMessages((prev) => [...prev, {
          role: "bot",
          text: data.reply,
          source: data.source,
          confidence: data.confidence,
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "bot",
        text: "Network error. Please try again.",
        error: true,
      }]);
    }
    setSending(false);
    inputRef.current?.focus();
  }, [input, sending, slug, thinkingDelay]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.dot} />
        <span>{name}</span>
      </div>

      {/* Chat */}
      <div style={styles.chat}>
        {messages.map((msg, i) => (
          <div key={i} style={{ ...styles.msg, ...(msg.role === "user" ? styles.user : styles.bot) }}>
            {msg.role === "bot" && !msg.error && (
              <div style={styles.meta}>
                {msg.source === "retrieval" && (
                  <span style={{ ...styles.badge, ...styles.badgeRetrieved }}>Retrieved</span>
                )}
                {msg.source === "generative" && (
                  <span style={{ ...styles.badge, ...styles.badgeGenerative }}>Generated</span>
                )}
                {msg.source === "fallback" && (
                  <span style={{ ...styles.badge, ...styles.badgeFallback }}>Fallback</span>
                )}
                {typeof msg.confidence === "number" && msg.source !== "fallback" && (
                  <span style={styles.confidence}>{Math.round(msg.confidence * 100)}% match</span>
                )}
              </div>
            )}
            <div>{msg.text}</div>
          </div>
        ))}
        {sending && (
          <div style={{ ...styles.msg, ...styles.bot }}>
            <div style={styles.typing}>thinking<span style={styles.dots}>...</span></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Type a message..."
          style={styles.input}
          disabled={sending}
          autoFocus
        />
        <button onClick={send} disabled={sending || !input.trim()} style={styles.button}>
          {sending ? "..." : "Send"}
        </button>
      </div>

      {/* Watermark */}
      <div style={styles.watermark}>
        Powered by <a href="https://studybuddy.ai" target="_blank" rel="noopener noreferrer" style={styles.watermarkLink}>StudyBuddy AI</a>
      </div>
    </div>
  );
}

// === Inline styles (no Tailwind — works in any iframe) ===
const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: "#f9fafb",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
  },
  header: {
    background: "linear-gradient(135deg, #7c3aed, #d946ef)",
    color: "white",
    padding: "14px 16px",
    fontWeight: 600,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#10b981",
    boxShadow: "0 0 0 3px rgba(16,185,129,0.3)",
  },
  chat: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    maxWidth: 700,
    margin: "0 auto",
    width: "100%",
  },
  msg: {
    marginBottom: 12,
    maxWidth: "80%",
    padding: "10px 14px",
    borderRadius: 16,
    fontSize: 14,
    lineHeight: 1.45,
  },
  user: {
    background: "#4f46e5",
    color: "white",
    marginLeft: "auto",
    borderBottomRightRadius: 4,
  },
  bot: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderBottomLeftRadius: 4,
    color: "#1f2937",
  },
  meta: {
    fontSize: 10,
    color: "#7c3aed",
    fontWeight: 700,
    marginBottom: 4,
    display: "flex",
    gap: 6,
    alignItems: "center",
    flexWrap: "wrap",
  },
  badge: {
    padding: "1px 6px",
    borderRadius: 999,
    fontSize: 9,
  },
  badgeRetrieved: {
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
  },
  badgeGenerative: {
    background: "#f0f9ff",
    color: "#0369a1",
    border: "1px solid #bae6fd",
  },
  badgeFallback: {
    background: "#f3f4f6",
    color: "#6b7280",
    border: "1px solid #e5e7eb",
  },
  confidence: {
    color: "#9ca3af",
    fontSize: 10,
  },
  typing: {
    color: "#9ca3af",
    fontStyle: "italic",
    fontSize: 13,
    padding: "4px 0",
  },
  dots: {
    letterSpacing: 2,
  },
  inputArea: {
    padding: 12,
    background: "white",
    borderTop: "1px solid #e5e7eb",
    maxWidth: 700,
    margin: "0 auto",
    width: "100%",
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    padding: "11px 16px",
    border: "1px solid #e5e7eb",
    borderRadius: 22,
    fontSize: 14,
    outline: "none",
  },
  button: {
    background: "#7c3aed",
    color: "white",
    border: "none",
    padding: "11px 22px",
    borderRadius: 22,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  },
  watermark: {
    textAlign: "center",
    padding: 8,
    fontSize: 10,
    color: "#9ca3af",
    background: "white",
    borderTop: "1px solid #f3f4f6",
  },
  watermarkLink: {
    color: "#7c3aed",
    textDecoration: "none",
    fontWeight: 600,
  },
};
