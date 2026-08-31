"use client";

/**
 * PromptPlaygroundScreen — Phase 56 (AIBuddy / AI App Dev track)
 *
 * An A/B lab for prompts, the way MLPlayground is a lab for models:
 *
 *   ┌───────────── user prompt (shared) ─────────────┐
 *   ┌── Variant A ──────────┐  ┌── Variant B ────────┐
 *   │ system prompt         │  │ system prompt       │
 *   │ temperature · maxTok  │  │ temperature · maxTok│
 *   │ [Run] output + ms/tok │  │ [Run] output + ms   │
 *   └───────────────────────┘  └─────────────────────┘
 *
 * Extras:
 *   - Save prompts as a Project (buddyId "ai", file prompts.md)
 *   - AI ship-it templates (src/lib/ai-templates.ts) → create real starter
 *     projects (streaming chat, RAG, agent, eval harness)
 *   - Agent Builder: fill a spec form → get agent.json + agent-loop.py
 *     saved as a Project
 *
 * Backend: POST /api/ai/playground (feature key "playground").
 */

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, Loader2, X, AlertCircle, Play, Save, CheckCircle2,
  LayoutTemplate, Bot, FileJson, Zap, Coins, Clock,
} from "lucide-react";
import { useApp } from "../store";
import { AI_TEMPLATES } from "@/lib/ai-templates";

type Variant = {
  system: string;
  temperature: number;
  maxTokens: number | "";
  output: string;
  running: boolean;
  durationMs: number | null;
  estTokens: number | null;
  error: string | null;
};

const EMPTY_VARIANT: Variant = { system: "", temperature: 0.7, maxTokens: "", output: "", running: false, durationMs: null, estTokens: null, error: null };

type AgentTool = { id: string; name: string; description: string; params: string };

const AGENT_TOOLS: AgentTool[] = [
  { id: "web_search", name: "web_search", description: "Search the web for fresh information", params: '{ "query": "string" }' },
  { id: "calculator", name: "calculator", description: "Evaluate a math expression precisely", params: '{ "expression": "string" }' },
  { id: "http_get", name: "http_get", description: "Fetch a whitelisted URL and return the text", params: '{ "url": "string (allowlist)" }' },
  { id: "run_python", name: "run_python", description: "Run a short python snippet in a sandbox", params: '{ "code": "string" }' },
];

export function PromptPlaygroundScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;

  const [projectId, setProjectId] = useState<string | null>(activeProjectId ?? null);
  const [projectTitle, setProjectTitle] = useState("Prompt experiments");
  const [userPrompt, setUserPrompt] = useState("Explain recursion to a 12-year-old in exactly 3 sentences.");
  const [variantA, setVariantA] = useState<Variant>({ ...EMPTY_VARIANT, system: "You are a friendly science teacher. Use one everyday analogy." });
  const [variantB, setVariantB] = useState<Variant>({ ...EMPTY_VARIANT, system: "You are a precise university lecturer. Define the term formally first." });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showTemplates, setShowTemplates] = useState(false);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const [showAgent, setShowAgent] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentName, setAgentName] = useState("my-agent");
  const [agentSystem, setAgentSystem] = useState("You are a helpful research assistant. Use tools when they improve accuracy. Never invent facts.");
  const [agentSelected, setAgentSelected] = useState<string[]>(["web_search", "calculator"]);
  const [agentMaxSteps, setAgentMaxSteps] = useState(6);

  // If we opened with a saved project, pull its title (files stay server-side;
  // saving rewrites prompts.md).
  useEffect(() => {
    if (!activeProjectId) return;
    fetch(`/api/projects/${activeProjectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (d?.project) setProjectTitle(d.project.title ?? projectTitle);
      })
      .catch(() => {});
  }, [activeProjectId]);

  const runVariant = useCallback(async (id: "a" | "b") => {
    const v = id === "a" ? variantA : variantB;
    const set = id === "a" ? setVariantA : setVariantB;
    set({ ...v, running: true, error: null, output: "" });
    const started = Date.now();
    try {
      const res = await fetch("/api/ai/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: v.system,
          userPrompt,
          temperature: v.temperature,
          maxTokens: v.maxTokens === "" ? undefined : Number(v.maxTokens),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      set({
        ...v,
        running: false,
        output: data.output ?? "",
        durationMs: data.durationMs ?? Date.now() - started,
        estTokens: data.estTokens ?? null,
      });
    } catch (e: any) {
      set({ ...v, running: false, error: e?.message ?? "Run failed", durationMs: Date.now() - started });
    }
  }, [variantA, variantB, userPrompt]);

  const runBoth = useCallback(async () => {
    await Promise.all([runVariant("a"), runVariant("b")]);
  }, [runVariant]);

  const buildPromptsMd = useCallback(() => {
    const fmt = (label: string, v: Variant) =>
      `## Variant ${label}\n\n### System prompt\n\n\`\`\`text\n${v.system}\n\`\`\`\n\n- temperature: ${v.temperature}\n- max_tokens: ${v.maxTokens === "" ? "(provider default)" : v.maxTokens}\n${v.durationMs !== null ? `- last run: ${v.durationMs}ms, ~${v.estTokens ?? "?"} tokens\n` : ""}${v.output ? `\n### Last output\n\n\`\`\`text\n${v.output.slice(0, 2000)}\n\`\`\`\n` : ""}`;
    return `# Prompt experiments — ${projectTitle}\n\n## Shared user prompt\n\n\`\`\`text\n${userPrompt}\n\`\`\`\n\n${fmt("A", variantA)}\n${fmt("B", variantB)}`;
  }, [projectTitle, userPrompt, variantA, variantB]);

  const savePrompts = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const files = [{ path: "prompts.md", language: "markdown", content: buildPromptsMd(), isEntry: true }];
      if (projectId && !projectId.startsWith("temp-")) {
        const r = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files }),
        });
        if (!r.ok) throw new Error(`Save failed: HTTP ${r.status}`);
      } else {
        const r = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buddyId: "ai", title: projectTitle, description: "AIBuddy prompt experiments", tags: ["prompts"], files }),
        });
        if (!r.ok) throw new Error(`Create failed: HTTP ${r.status}`);
        const d = await r.json();
        setProjectId(d.project.id);
        setActiveProjectId(d.project.id);
      }
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [projectId, projectTitle, buildPromptsMd, setActiveProjectId]);

  const createTemplateProject = useCallback(async (id: string) => {
    const t = AI_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplateBusy(id);
    setError(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buddyId: "ai",
          title: `${t.name} starter`,
          description: t.description,
          tags: ["template", "ai-app"],
          files: t.files.map((f, i) => ({
            path: f.path,
            language: f.path.endsWith(".py") ? "python" : f.path.endsWith(".ts") ? "typescript" : f.path.endsWith(".md") ? "markdown" : "javascript",
            content: f.content,
            isEntry: i === 0,
          })),
        }),
      });
      if (!r.ok) throw new Error(`Create failed: HTTP ${r.status}`);
      setShowTemplates(false);
    } catch (e: any) {
      setError(e?.message ?? "Template creation failed");
    } finally {
      setTemplateBusy(null);
    }
  }, []);

  const buildAgentFiles = useCallback(() => {
    const tools = AGENT_TOOLS.filter((t) => agentSelected.includes(t.id));
    const spec = {
      name: agentName,
      system_prompt: agentSystem,
      max_steps: agentMaxSteps,
      tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: JSON.parse(t.params) })),
      safety: [
        "LLM only DESCRIBES tool calls — the executor owns execution",
        "http_get is allowlist-only; never fetch arbitrary URLs",
        "Cap steps and tool output size to avoid runaway loops",
      ],
    };
    const py = `# ${agentName} — generated by StudyBuddy Agent Builder (Phase 56)\n# LLM -> tool_calls? -> execute -> repeat (cap ${agentMaxSteps} steps)\nimport json\nfrom openai import OpenAI\n\nclient = OpenAI()\n\nTOOLS = {\n${tools.map((t) => `    "${t.name}": lambda **kw: f"{t.name} stub — implement me ({kw})"`).join(",\n")}\n}\nSCHEMAS = ${JSON.stringify(tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: JSON.parse(t.params) } })), null, 4)}\n\nSYSTEM = ${JSON.stringify(agentSystem)}\n\ndef run_agent(user_msg: str, max_steps: int = ${agentMaxSteps}) -> str:\n    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_msg}]\n    for _ in range(max_steps):\n        res = client.chat.completions.create(model="gpt-4o-mini", messages=messages, tools=SCHEMAS)\n        msg = res.choices[0].message\n        messages.append(msg)\n        if not msg.tool_calls:\n            return msg.content or ""\n        for call in msg.tool_calls:\n            fn = TOOLS.get(call.function.name)\n            args = json.loads(call.function.arguments or "{}")\n            try:\n                result = fn(**args) if fn else f"Unknown tool: {call.function.name}"\n            except Exception as e:\n                result = f"Tool error: {e}"\n            messages.append({"role": "tool", "tool_call_id": call.id, "content": str(result)})\n    return "Reached max_steps without a final answer."\n\nif __name__ == "__main__":\n    print(run_agent("Hello agent!"))\n`;
    return [
      { path: "agent.json", language: "json", content: JSON.stringify(spec, null, 2), isEntry: false },
      { path: "agent.py", language: "python", content: py, isEntry: true },
    ];
  }, [agentName, agentSystem, agentSelected, agentMaxSteps]);

  const saveAgent = useCallback(async () => {
    setAgentBusy(true);
    setError(null);
    try {
      const files = buildAgentFiles();
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buddyId: "ai",
          title: `${agentName} (agent)`,
          description: `Tool-calling agent with ${agentSelected.length} tool(s), max ${agentMaxSteps} steps`,
          tags: ["agent", "ai-app"],
          files,
        }),
      });
      if (!r.ok) throw new Error(`Create failed: HTTP ${r.status}`);
      setShowAgent(false);
    } catch (e: any) {
      setError(e?.message ?? "Agent save failed");
    } finally {
      setAgentBusy(false);
    }
  }, [buildAgentFiles, agentName, agentSelected, agentMaxSteps]);

  const variantEditor = (id: "A" | "B", v: Variant, set: (v: Variant) => void) => (
    <div className="flex-1 min-w-0 flex flex-col bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
      <div className="px-3 py-2 bg-gray-750 bg-gray-700/40 border-b border-gray-700 flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white ${id === "A" ? "bg-fuchsia-600" : "bg-purple-600"}`}>{id}</span>
        <span className="text-xs font-semibold text-gray-200">Variant {id}</span>
      </div>
      <div className="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
        <textarea
          value={v.system}
          onChange={(e) => set({ ...v, system: e.target.value })}
          placeholder="System prompt — role, rules, output format…"
          rows={5}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-100 font-mono outline-none focus:border-fuchsia-500 resize-none"
        />
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <label className="flex items-center gap-1.5 flex-1">
            temp
            <input type="range" min={0} max={1.5} step={0.1} value={v.temperature} onChange={(e) => set({ ...v, temperature: Number(e.target.value) })} className="flex-1 accent-fuchsia-500" />
            <span className="font-mono text-gray-200 w-6 text-right">{v.temperature.toFixed(1)}</span>
          </label>
          <input
            type="number"
            min={1}
            max={4096}
            value={v.maxTokens}
            onChange={(e) => set({ ...v, maxTokens: e.target.value === "" ? "" : Number(e.target.value) })}
            placeholder="max"
            className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-100 outline-none focus:border-fuchsia-500"
            title="max tokens (blank = default)"
          />
        </div>
        <button
          onClick={() => id === "A" ? runVariant("a") : runVariant("b")}
          disabled={v.running}
          className="h-9 rounded-lg bg-fuchsia-600 text-white text-xs font-semibold hover:bg-fuchsia-700 disabled:opacity-50 flex items-center justify-center gap-1.5 flex-shrink-0"
        >
          {v.running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</> : <><Play className="w-3.5 h-3.5" /> Run {id}</>}
        </button>
        <div className="flex-1 min-h-[120px] bg-black/40 rounded-lg border border-gray-700 p-2.5 overflow-y-auto">
          {v.error ? (
            <p className="text-[11px] text-rose-300 whitespace-pre-wrap">⚠️ {v.error}</p>
          ) : v.output ? (
            <p className="text-[11px] text-gray-200 whitespace-pre-wrap">{v.output}</p>
          ) : (
            <p className="text-[11px] text-gray-600">Output appears here…</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-shrink-0">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {v.durationMs !== null ? `${v.durationMs}ms` : "—"}</span>
          <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> ~{v.estTokens !== null ? v.estTokens : "—"} tok</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-3 h-14 flex items-center gap-2.5 flex-shrink-0">
        <button onClick={() => setScreen("tutor")} aria-label="Back" className="text-gray-300 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Bot className="w-5 h-5 text-fuchsia-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">Prompt Playground</p>
          <p className="text-[10px] text-gray-400 -mt-0.5">A/B prompts · latency · tokens — AIBuddy AI App Dev</p>
        </div>
        {savedAt && (
          <span className="text-[10px] text-emerald-400 flex-shrink-0 flex items-center gap-0.5">
            <CheckCircle2 className="w-3 h-3" /> Saved
          </span>
        )}
        <button
          onClick={() => setShowTemplates(true)}
          className="px-2.5 h-8 rounded-full bg-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1 hover:bg-gray-600 flex-shrink-0"
          title="Ship-it starter projects"
        >
          <LayoutTemplate className="w-3.5 h-3.5" /> Templates
        </button>
        <button
          onClick={() => setShowAgent(true)}
          className="px-2.5 h-8 rounded-full bg-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1 hover:bg-gray-600 flex-shrink-0"
          title="Agent spec builder"
        >
          <FileJson className="w-3.5 h-3.5" /> Agent
        </button>
        <button
          onClick={savePrompts}
          disabled={saving}
          className="px-3 h-8 rounded-full bg-fuchsia-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-fuchsia-700 disabled:opacity-50 flex-shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
      </header>

      {/* Shared user prompt */}
      <div className="px-3 pt-3 flex-shrink-0">
        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-3">
          <label className="text-[10px] font-bold uppercase text-gray-500">Shared user prompt</label>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={2}
            className="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-100 font-mono outline-none focus:border-fuchsia-500 resize-none"
          />
          <button
            onClick={runBoth}
            disabled={variantA.running || variantB.running}
            className="mt-2 h-8 px-3 rounded-full bg-white text-gray-900 text-[11px] font-bold hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> Run both & compare
          </button>
        </div>
      </div>

      {/* Variants */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3">
        {variantEditor("A", variantA, setVariantA)}
        {variantEditor("B", variantB, setVariantB)}
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-rose-900/90 text-rose-100 px-4 py-2.5 rounded-lg shadow-lg max-w-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-300 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-gray-800 rounded-t-2xl md:rounded-2xl border border-gray-700 p-4 max-w-xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
              <LayoutTemplate className="w-4 h-4 text-fuchsia-400" /> Ship-it templates
            </h3>
            <p className="text-xs text-gray-400 mb-3">Production-shaped starter projects saved to your account (buddy: AIBuddy). Download or edit them in DevBuddy.</p>
            <div className="space-y-2">
              {AI_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => createTemplateProject(t.id)}
                  disabled={!!templateBusy}
                  className="w-full text-left bg-gray-900 border border-gray-700 hover:border-fuchsia-500 rounded-xl p-3 transition disabled:opacity-50 flex items-start gap-3"
                >
                  <span className="text-xl">{t.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-white">{t.name}</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">{t.description}</span>
                    <span className="block text-[10px] text-gray-600 mt-1">{t.files.map((f) => f.path).join(" · ")}</span>
                  </span>
                  {templateBusy === t.id && <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />}
                </button>
              ))}
            </div>
            <button onClick={() => setShowTemplates(false)} className="mt-3 w-full h-9 rounded-lg bg-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-600">Close</button>
          </div>
        </div>
      )}

      {/* Agent builder modal */}
      {showAgent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowAgent(false)}>
          <div className="bg-gray-800 rounded-t-2xl md:rounded-2xl border border-gray-700 p-4 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
              <FileJson className="w-4 h-4 text-fuchsia-400" /> Agent Builder
            </h3>
            <p className="text-xs text-gray-400 mb-3">Describe the agent → get <code className="text-fuchsia-400">agent.json</code> (the spec) + <code className="text-fuchsia-400">agent.py</code> (a real tool-calling loop). The LLM only describes tool calls — your executor owns execution.</p>
            <div className="space-y-2">
              <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="agent name" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-fuchsia-500" />
              <textarea value={agentSystem} onChange={(e) => setAgentSystem(e.target.value)} rows={3} placeholder="System prompt" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono outline-none focus:border-fuchsia-500 resize-none" />
              <p className="text-[10px] font-bold uppercase text-gray-500">Tools (the LLM sees name + description)</p>
              {AGENT_TOOLS.map((t) => (
                <label key={t.id} className="flex items-start gap-2 bg-gray-900 border border-gray-700 rounded-lg p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agentSelected.includes(t.id)}
                    onChange={(e) => setAgentSelected((prev) => e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id))}
                    className="mt-0.5 accent-fuchsia-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-mono font-bold text-fuchsia-300">{t.name}</span>
                    <span className="block text-[10px] text-gray-500">{t.description}</span>
                    <span className="block text-[10px] text-gray-600 font-mono">{t.params}</span>
                  </span>
                </label>
              ))}
              <label className="flex items-center gap-2 text-[11px] text-gray-400">
                max steps
                <input type="number" min={2} max={12} value={agentMaxSteps} onChange={(e) => setAgentMaxSteps(Math.max(2, Math.min(12, Number(e.target.value) || 6)))} className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-100 outline-none focus:border-fuchsia-500" />
                <span className="text-gray-600">— cap runaway loops</span>
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveAgent} disabled={agentBusy || agentSelected.length === 0} className="flex-1 h-9 rounded-lg bg-fuchsia-600 text-white text-xs font-semibold hover:bg-fuchsia-700 disabled:opacity-50 flex items-center justify-center gap-1">
                {agentBusy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save as project</>}
              </button>
              <button onClick={() => setShowAgent(false)} className="px-3 h-9 rounded-lg bg-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-600">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
