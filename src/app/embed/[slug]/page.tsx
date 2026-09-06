import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /embed/[slug] — public chat widget for a deployed bot.
 *
 * This is the FIRST server-rendered public page in the codebase (Phase 70).
 * No auth — anyone with the slug can chat. Designed to be iframed into
 * WordPress sites, Notion pages, LMS courses, etc.
 *
 * The page renders a clean chat shell, then a client component takes over
 * to POST messages to /api/embed/[slug]/messages.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bot = await db.deployedBot.findUnique({
    where: { slug },
    select: { name: true, status: true },
  });
  return {
    title: bot ? `${bot.name} — Chatbot` : "Chatbot",
    description: "Powered by StudyBuddy AI",
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bot = await db.deployedBot.findUnique({
    where: { slug },
    select: {
      name: true,
      status: true,
      thinkingDelay: true,
      botMemory: true,
    },
  });

  if (!bot || bot.status === "draft") {
    return (
      <html>
        <body>
          <div style={{ padding: 32, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
            <h2>🤖 Bot not found</h2>
            <p style={{ color: "#6b7280" }}>This chatbot doesn&apos;t exist or has been removed.</p>
          </div>
        </body>
      </html>
    );
  }

  if (bot.status === "paused") {
    return (
      <html>
        <body>
          <div style={{ padding: 32, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
            <h2>⏸ Bot paused</h2>
            <p style={{ color: "#6b7280" }}>The owner has temporarily disabled this chatbot.</p>
          </div>
        </body>
      </html>
    );
  }

  const config = {
    slug,
    name: bot.name,
    thinkingDelay: bot.thinkingDelay,
    botMemory: bot.botMemory,
  };

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{bot.name} — Chatbot</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <div id="chat-root" data-config={JSON.stringify(config)} />
        <script dangerouslySetInnerHTML={{ __html: CLIENT_SCRIPT }} />
      </body>
    </html>
  );
}

// === Inline styles for the embed widget ===
const STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; height: 100vh; display: flex; flex-direction: column; }
  .header { background: linear-gradient(135deg, #7c3aed, #d946ef); color: white; padding: 14px 16px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .header .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.3); }
  .chat { flex: 1; overflow-y: auto; padding: 16px; max-width: 700px; margin: 0 auto; width: 100%; }
  .msg { margin-bottom: 12px; max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.45; }
  .user { background: #4f46e5; color: white; margin-left: auto; border-bottom-right-radius: 4px; }
  .bot { background: white; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }
  .bot .meta { font-size: 10px; color: #7c3aed; font-weight: 700; margin-bottom: 4px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .badge { padding: 1px 6px; border-radius: 999px; font-size: 9px; }
  .badge-retrieved { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  .badge-generative { background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd; }
  .badge-fallback { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
  .typing { color: #9ca3af; font-style: italic; font-size: 13px; padding: 4px 0; }
  .typing::after { content: '...'; animation: dots 1.5s infinite; }
  @keyframes dots { 0%,20% { content: '.'; } 40% { content: '..'; } 60%,100% { content: '...'; } }
  .input-area { padding: 12px; background: white; border-top: 1px solid #e5e7eb; max-width: 700px; margin: 0 auto; width: 100%; display: flex; gap: 8px; }
  input { flex: 1; padding: 11px 16px; border: 1px solid #e5e7eb; border-radius: 22px; font-size: 14px; outline: none; }
  input:focus { border-color: #7c3aed; }
  button { background: #7c3aed; color: white; border: none; padding: 11px 22px; border-radius: 22px; cursor: pointer; font-weight: 600; font-size: 14px; }
  button:hover { background: #6d28d9; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .watermark { text-align: center; padding: 8px; font-size: 10px; color: #9ca3af; }
  .watermark a { color: #7c3aed; text-decoration: none; font-weight: 600; }
  .error { color: #ef4444; font-size: 12px; padding: 8px 12px; background: #fef2f2; border-radius: 8px; margin: 8px 0; }
`;

// === Client-side script (vanilla JS — no React, so it works in any iframe) ===
const CLIENT_SCRIPT = `
(function() {
  var root = document.getElementById('chat-root');
  var config = JSON.parse(root.getAttribute('data-config'));
  var slug = config.slug;
  var thinkingDelay = config.thinkingDelay || 3;

  // Build UI
  root.innerHTML = ''
    + '<div class="header"><span class="dot"></span>' + escapeHtml(config.name) + '</div>'
    + '<div class="chat" id="chat"></div>'
    + '<div class="input-area">'
    + '<input type="text" id="input" placeholder="Type a message..." autocomplete="off" />'
    + '<button id="send">Send</button>'
    + '</div>'
    + '<div class="watermark">⚡ Powered by <a href="https://studybuddy.ai" target="_blank" rel="noopener">StudyBuddy AI</a></div>';

  var chat = document.getElementById('chat');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('send');

  input.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !sendBtn.disabled) send(); });
  sendBtn.addEventListener('click', send);

  function send() {
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;

    chat.innerHTML += '<div class="msg user">' + escapeHtml(text) + '</div>';
    var typingEl = document.createElement('div');
    typingEl.className = 'msg bot';
    typingEl.innerHTML = '<div class="typing">thinking</div>';
    chat.appendChild(typingEl);
    chat.scrollTop = chat.scrollHeight;

    // Respect the bot's configured thinking delay.
    setTimeout(function() {
      fetch('/api/embed/' + slug + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(res) {
        typingEl.remove();
        if (!res.ok) {
          chat.innerHTML += '<div class="msg bot"><div class="error">' + escapeHtml(res.data.error || 'Something went wrong') + '</div></div>';
        } else {
          var d = res.data;
          var badge = '';
          if (d.source === 'retrieval') badge = '<span class="badge badge-retrieved">RETRIEVED</span>';
          else if (d.source === 'generative') badge = '<span class="badge badge-generative">GENERATED</span>';
          else badge = '<span class="badge badge-fallback">FALLBACK</span>';
          var conf = d.confidence !== undefined ? ' ' + Math.round(d.confidence * 100) + '% match' : '';
          chat.innerHTML += '<div class="msg bot"><div class="meta">' + badge + conf + '</div>' + escapeHtml(d.reply) + '</div>';
        }
        chat.scrollTop = chat.scrollHeight;
        sendBtn.disabled = false;
        input.focus();
      })
      .catch(function(e) {
        typingEl.remove();
        chat.innerHTML += '<div class="msg bot"><div class="error">Network error. Please try again.</div></div>';
        sendBtn.disabled = false;
        input.focus();
      });
    }, thinkingDelay * 1000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Greeting message
  chat.innerHTML += '<div class="msg bot"><div class="meta"><span class="badge badge-retrieved">GREETING</span></div>Hi! I\\'m ' + escapeHtml(config.name) + '. Ask me anything!</div>';

  input.focus();
})();
`;
