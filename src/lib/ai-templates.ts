/**
 * ai-templates.ts — Phase 56 (AIBuddy "ship-it" templates)
 *
 * Four production-shaped starter projects the learner can export from the
 * Prompt Playground and grow outside StudyBuddy. Each template is a set of
 * project files (created via POST /api/projects with buddyId="ai").
 *
 * These mirror the in-browser tools so the learner has seen every pattern
 * already: streaming chat (our own Phase 52 SSE route, miniaturized),
 * RAG-with-citations (the %%rag notebook cells, productionized), a
 * tool-calling agent loop (the agent spec builder's output), and an
 * eval harness (prompt → assertions → score).
 */

export type AiTemplateFile = { path: string; content: string };

export type AiTemplate = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  files: AiTemplateFile[];
};

const STREAM_CHAT_JS = `// Streaming chat — tiny SSE server (Node 18+, no deps).
// Mirrors StudyBuddy's own Phase 52 /api/tutor/chat/stream route.
import http from "node:http";

const MODEL_URL = process.env.MODEL_URL ?? "https://api.openai.com/v1/chat/completions";
const MODEL_KEY = process.env.MODEL_KEY; // export MODEL_KEY=sk-...

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/chat") { res.writeHead(404); return res.end(); }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const { messages } = JSON.parse(Buffer.concat(chunks).toString());

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const upstream = await fetch(MODEL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${MODEL_KEY}\` },
    body: JSON.stringify({ model: process.env.MODEL_NAME ?? "gpt-4o-mini", messages, stream: true }),
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value)); // pass SSE frames straight through
  }
  res.end();
});

server.listen(3001, () => console.log("SSE chat server on :3001"));`;

const STREAM_CHAT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Streaming chat</title>
<style>
  body { font-family: system-ui; max-width: 640px; margin: 40px auto; padding: 0 16px; }
  #out { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; min-height: 120px; }
  form { display: flex; gap: 8px; margin-top: 12px; }
  input { flex: 1; padding: 10px 14px; border-radius: 999px; border: 1px solid #e5e7eb; }
  button { padding: 10px 18px; border-radius: 999px; border: 0; background: #6366f1; color: #fff; font-weight: 600; }
</style></head>
<body>
  <h1>Streaming chat</h1>
  <div id="out">(reply streams here…)</div>
  <form id="f"><input id="q" placeholder="Ask something…" autocomplete="off"><button>Send</button></form>
  <script type="module">
    const out = document.getElementById("out");
    document.getElementById("f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = document.getElementById("q").value;
      out.textContent = "";
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // OpenAI SSE frames: "data: {...}\\n\\n"
        for (const line of buf.split("\\n\\n")) {
          const payload = line.replace(/^data: /, "").trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
            if (delta) out.textContent += delta;
          } catch { /* partial frame — wait for more */ }
        }
        buf = buf.slice(buf.lastIndexOf("\\n\\n") + 2);
      }
    });
  </script>
</body>
</html>`;

const RAG_PIPELINE_PY = `# RAG with citations — production-shaped pipeline (deps: openai, pypdf).
# This is the "grown-up" version of NotebookScreen's %%rag cells:
#   chunk -> embed -> store -> retrieve -> answer WITH [chunkId] citations.
import os, re
from openai import OpenAI
from pypdf import PdfReader

client = OpenAI()  # OPENAI_API_KEY env var
EMBED_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4o-mini"

# ---------- 1. Load + chunk (300-800 tokens, ~15% overlap, split on paragraphs)
def chunk_text(text: str, size: int = 1200, overlap: int = 180) -> list[str]:
    paras = re.split(r"\\n\\s*\\n", text)
    chunks, buf = [], ""
    for p in paras:
        if len(buf) + len(p) > size and buf:
            chunks.append(buf.strip()); buf = buf[-overlap:]  # keep tail as overlap
        buf += p + "\\n\\n"
    if buf.strip(): chunks.append(buf.strip())
    return chunks

def load_pdf(path: str) -> list[str]:
    reader = PdfReader(path)
    return chunk_text("\\n\\n".join(page.extract_text() or "" for page in reader.pages))

# ---------- 2. Embed (batched) + tiny in-memory store
def embed(texts: list[str]) -> list[list[float]]:
    res = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [d.embedding for d in res.data]

class VectorStore:
    def __init__(self): self.chunks, self.vectors = [], []
    def add(self, chunks): self.chunks += chunks; self.vectors += embed(chunks)
    def top_k(self, query, k=5):
        q = embed([query])[0]
        sims = [sum(a*b for a, b in zip(q, v)) / (len(q) * len(v)) for v in self.vectors]
        ranked = sorted(range(len(sims)), key=lambda i: -sims[i])[:k]
        return [(self.chunks[i], round(sims[i], 3), i) for i in ranked]

# ---------- 3. Answer with citations
def answer(store: VectorStore, question: str) -> str:
    hits = store.top_k(question, k=5)
    context = "\\n\\n".join(f"[chunk {i}]\\n{c}" for c, _, i in hits)
    res = client.chat.completions.create(
        model=CHAT_MODEL, temperature=0.2,
        messages=[
            {"role": "system", "content": "Answer ONLY from the provided chunks. Cite every claim as [chunk N]. If the chunks don't contain the answer, say so."},
            {"role": "user", "content": f"Chunks:\\n\\n{context}\\n\\nQuestion: {question}"},
        ],
    )
    return res.choices[0].message.content

if __name__ == "__main__":
    store = VectorStore()
    store.add(load_pdf(os.environ.get("DOC_PATH", "doc.pdf")))
    print(answer(store, "What is this document about?"))`;

const AGENT_LOOP_PY = `# Tool-calling agent loop (deps: openai).
# Matches the Agent Builder spec: LLM -> tool_calls? -> execute -> repeat (cap steps).
import json
from openai import OpenAI

client = OpenAI()

# ---- Tools: the LLM only DESCRIBES calls; THIS code owns execution. ----
def get_weather(city: str) -> str:
    # Replace with a real API. Never let the LLM build URLs/shell directly.
    return f"{city}: 22C, sunny (stub)"

TOOLS = {
    "get_weather": get_weather,
}
SCHEMAS = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
}]

def run_agent(user_msg: str, system: str, max_steps: int = 6) -> str:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user_msg}]
    for step in range(max_steps):
        res = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages, tools=SCHEMAS,
        )
        msg = res.choices[0].message
        messages.append(msg)
        if not msg.tool_calls:
            return msg.content or ""
        for call in msg.tool_calls:
            fn = TOOLS.get(call.function.name)
            args = json.loads(call.function.arguments or "{}")
            try:
                result = fn(**args) if fn else f"Unknown tool: {call.function.name}"
            except Exception as e:
                result = f"Tool error: {e}"
            messages.append({"role": "tool", "tool_call_id": call.id, "content": str(result)})
    return "Reached max_steps without a final answer."

if __name__ == "__main__":
    print(run_agent("What's the weather in Nairobi?", "You are a helpful weather assistant."))`;

const EVAL_HARNESS_TS = `// Eval harness: prompts -> assertions -> score (Node 18+, no deps beyond fetch).
// Run: MODEL_KEY=sk-... npx tsx eval.ts
type Case = {
  name: string;
  user: string;
  mustInclude?: string[];   // substrings (case-insensitive)
  mustNotInclude?: string[];
  maxChars?: number;
};

const CASES: Case[] = [
  { name: "answers pricing question", user: "How much is the Pro plan?",
    mustInclude: ["12"], mustNotInclude: ["free forever"], maxChars: 600 },
  { name: "refunds are not promised", user: "Can I get a refund right now?",
    mustNotInclude: ["guaranteed refund"], maxChars: 600 },
  { name: "stays in scope", user: "Write a poem about dragons",
    mustNotInclude: ["as an ai language model"] },
];

async function callModel(system: string, user: string): Promise<string> {
  const res = await fetch(process.env.MODEL_URL ?? "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${process.env.MODEL_KEY}\` },
    body: JSON.stringify({
      model: process.env.MODEL_NAME ?? "gpt-4o-mini", temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const SYSTEM = process.env.SYSTEM_PROMPT ?? "You are the support bot for StudyWidgets. Be concise.";

let passed = 0;
for (const c of CASES) {
  const out = await callModel(SYSTEM, c.user);
  const lower = out.toLowerCase();
  const failures: string[] = [];
  if (c.mustInclude?.some((s) => !lower.includes(s.toLowerCase()))) failures.push("missing required text: " + c.mustInclude.join("|"));
  if (c.mustNotInclude?.some((s) => lower.includes(s.toLowerCase()))) failures.push("contains forbidden text: " + c.mustNotInclude.join("|"));
  if (c.maxChars && out.length > c.maxChars) failures.push(\`too long: \${out.length} > \${c.maxChars}\`);
  if (failures.length === 0) { passed++; console.log("PASS", c.name); }
  else console.log("FAIL", c.name, "->", failures.join("; "));
}
console.log(\`\\n\${passed}/\${CASES.length} cases passed\`);
if (passed < CASES.length) process.exit(1);`;

export const AI_TEMPLATES: AiTemplate[] = [
  {
    id: "streaming-chat",
    name: "Streaming chat app",
    emoji: "💬",
    description: "Node SSE server + browser client — token-by-token streaming (mirrors our Phase 52 route).",
    files: [
      { path: "server.js", content: STREAM_CHAT_JS },
      { path: "public/index.html", content: STREAM_CHAT_HTML },
      { path: "README.md", content: "# Streaming Chat Starter\n\n1. `export MODEL_KEY=sk-...`\n2. `node server.js`\n3. Open http://localhost:3001\n\nThe server streams OpenAI-format SSE frames straight to the browser; the client parses `data:` frames and appends deltas.\n" },
    ],
  },
  {
    id: "rag-citations",
    name: "RAG with citations",
    emoji: "🔍",
    description: "Chunk → embed → retrieve → answer with [chunk N] citations, in ~100 lines of Python.",
    files: [
      { path: "rag.py", content: RAG_PIPELINE_PY },
      { path: "README.md", content: "# RAG Starter\n\n`pip install openai pypdf` then `export OPENAI_API_KEY=...` and `python rag.py`.\n\nTuning knobs to try (see AIBuddy's decision table):\n- chunk size 300-800 tokens, overlap 10-20%\n- top_k 3-8, rerank if quality matters\n- temperature 0.2 for factual answers\n" },
    ],
  },
  {
    id: "agent-loop",
    name: "Tool-calling agent",
    emoji: "🤖",
    description: "The agent loop from the Agent Builder: LLM → tool_calls → execute → repeat, step-capped.",
    files: [
      { path: "agent.py", content: AGENT_LOOP_PY },
      { path: "README.md", content: "# Agent Starter\n\n`pip install openai` + `export OPENAI_API_KEY=...` + `python agent.py`.\n\nKey safety rule: the LLM only DESCRIBES tool calls — this code owns execution. Add tools to TOOLS + SCHEMAS in pairs.\n" },
    ],
  },
  {
    id: "eval-harness",
    name: "Prompt eval harness",
    emoji: "🧪",
    description: "Test cases with assertions (must-include / must-not / length) and a pass count — CI-ready.",
    files: [
      { path: "eval.ts", content: EVAL_HARNESS_TS },
      { path: "README.md", content: "# Eval Harness Starter\n\n`export MODEL_KEY=sk-... SYSTEM_PROMPT=\"...\"` then `npx tsx eval.ts`.\n\nAdd a Case per regression you never want to see again. Wire into CI: a failing eval blocks the merge, exactly like a unit test.\n" },
    ],
  },
];
