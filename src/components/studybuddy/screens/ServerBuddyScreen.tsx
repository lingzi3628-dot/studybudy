"use client";

/**
 * ServerBuddyScreen — Phase 58
 *
 * ServerBuddy's workspace: a fully simulated DevOps lab.
 *
 *   TERMINAL — a bash-flavored simulated shell (fake filesystem with
 *     permissions, services with journals, docker build/run/compose).
 *     Everything runs client-side; nothing can break.
 *   NGINX — config editor with a live "nginx -t" validator, readable
 *     error/warning list, and a request-flow diagram of the proxy routes.
 *     Saving writes /etc/nginx/nginx.conf into the sim — where
 *     `systemctl restart nginx` will actually validate it.
 *   DEPLOY — guided runbooks (Vercel, Railway, VPS+Caddy) with checkable
 *     steps, generated artifacts (scripts, systemd units, Caddyfile) and
 *     a quiz gate before "deploy complete".
 *
 * Note: the terminal is a purpose-built component (scrollback + input
 * line + history) rather than xterm.js — it stays light, works with
 * mobile keyboards, and every keystroke is safe by construction.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  ChevronLeft, Terminal as TerminalIcon, Globe, Rocket, Loader2, Save,
  CheckCircle2, XCircle, AlertTriangle, Copy, Check, ChevronDown,
  FileCode2, Server, RotateCcw, Trash2, GraduationCap, Lock,
} from "lucide-react";
import { useApp } from "../store";
import { SimShell } from "@/lib/sim-shell";
import { validateNginxConfig, type NginxVerdict } from "@/lib/nginx-validator";
import {
  RUNBOOKS, gradeQuiz, type Runbook, type QuizQuestion,
} from "@/lib/deploy-runbooks";

type TerminalLine = { text: string; isError?: boolean; isCommand?: boolean };
type Tab = "terminal" | "nginx" | "deploy";

export function ServerBuddyScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;
  const [tab, setTab] = useState<Tab>("terminal");

  // Nginx tab state
  const [nginxConfig, setNginxConfig] = useState<string>("");
  const [nginxVerdict, setNginxVerdict] = useState<NginxVerdict | null>(null);
  const [nginxSavedAt, setNginxSavedAt] = useState<number | null>(null);

  // Terminal + nginx share one SimShell instance so edits and commands connect
  const shellRef = useRef<SimShell | null>(null);
  if (!shellRef.current) shellRef.current = new SimShell();
  const shell = shellRef.current;

  // Deploy tab state
  const [openRunbookId, setOpenRunbookId] = useState<string | null>(null);
  const [doneSteps, setDoneSteps] = useState<Record<string, Set<string>>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number[]>>({});
  const [quizResults, setQuizResults] = useState<Record<string, { passed: boolean; correct: number; total: number } | null>>({});
  const [savingProject, setSavingProject] = useState(false);
  const [projectSavedAt, setProjectSavedAt] = useState<number | null>(null);

  // Load the sim's nginx config when the nginx tab opens
  const openNginxTab = () => {
    try {
      setNginxConfig(shell.run("cat /etc/nginx/nginx.conf").output);
    } catch {
      setNginxConfig("");
    }
    setNginxVerdict(null);
    setTab("nginx");
  };

  const validateNginx = () => {
    setNginxVerdict(validateNginxConfig(nginxConfig));
  };

  const saveNginxToSim = () => {
    // Write directly through the shell's filesystem so the same
    // permission rules apply as in the terminal (root-owned config
    // needs elevation — grant it silently, like sudo)
    try {
      const fs = (shell as any).fs;
      fs.user.elevated = true;
      fs.writeFile("/etc/nginx/nginx.conf", nginxConfig);
      fs.user.elevated = false;
      setNginxSavedAt(Date.now());
      setTimeout(() => setNginxSavedAt(null), 2000);
      setNginxVerdict(validateNginxConfig(nginxConfig));
    } catch {
      // Make sure elevation never leaks after a failed write
      ((shell as any).fs as import("@/lib/sim-fs").SimFs).user.elevated = false;
      setNginxVerdict(validateNginxConfig(nginxConfig));
    }
  };

  // ---------------- Deploy helpers ----------------

  const toggleStep = (rb: Runbook, stepId: string) => {
    setDoneSteps((prev) => {
      const next = { ...prev };
      const set = new Set(next[rb.id] ?? []);
      if (set.has(stepId)) set.delete(stepId);
      else set.add(stepId);
      next[rb.id] = set;
      return next;
    });
  };

  const setAnswer = (rbId: string, qi: number, oi: number) => {
    setQuizAnswers((prev) => {
      const next = { ...prev };
      const arr = [...(next[rbId] ?? [])];
      arr[qi] = oi;
      next[rbId] = arr;
      return next;
    });
    setQuizResults((p) => ({ ...p, [rbId]: null }));
  };

  const checkQuiz = (rb: Runbook) => {
    const answers = quizAnswers[rb.id] ?? [];
    const g = gradeQuiz(rb, answers);
    setQuizResults((p) => ({ ...p, [rb.id]: { passed: g.passed, correct: g.correct, total: g.total } }));
  };

  const saveDeployProject = async (rb: Runbook) => {
    setSavingProject(true);
    try {
      const files: { path: string; language: string; content: string; isEntry?: boolean }[] = [];
      for (const s of rb.steps) {
        if (s.generates) {
          files.push({
            path: s.generates.path,
            language: s.generates.path.endsWith(".service") ? "ini" : s.generates.path.endsWith(".sh") ? "bash" : "text",
            content: s.generates.content,
          });
        }
      }
      files.push({
        path: "nginx.conf",
        language: "nginx",
        content: nginxConfig || "# edited in ServerBuddy → Nginx tab",
      });
      files.push({
        path: "RUNBOOK.md",
        language: "markdown",
        content: `# ${rb.platform} deploy runbook\n\nGenerated by ServerBuddy (Phase 58).\n\n## Steps\n\n${rb.steps.map((s, i) => `${i + 1}. **${s.title}** — ${s.body}`).join("\n\n")}\n\n## Quiz result\n\n${quizResults[rb.id] ? `${quizResults[rb.id]!.correct}/${quizResults[rb.id]!.total} correct${quizResults[rb.id]!.passed ? " — deploy complete ✓" : ""}` : "Quiz not taken yet"}\n`,
        isEntry: true,
      });

      const body = JSON.stringify({
        buddyId: "server",
        title: `${rb.platform} deploy`,
        description: `ServerBuddy runbook artifacts for ${rb.platform}`,
        tags: ["server", "devops", rb.id],
        files,
      });
      const r = activeProjectId && !activeProjectId.startsWith("temp-")
        ? await fetch(`/api/projects/${activeProjectId}/files`, { method: "PUT", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!r.ok) throw new Error(`Save failed: HTTP ${r.status}`);
      const d = await r.json();
      if (d.project?.id) setActiveProjectId(d.project.id);
      setProjectSavedAt(Date.now());
      setTimeout(() => setProjectSavedAt(null), 2000);
    } catch {
      // surfaced via UI state below
    } finally {
      setSavingProject(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => setScreen("projects")}
          aria-label="Back to projects"
          className="text-gray-400 hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Server className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        <h1 className="text-sm font-bold text-white flex-1">ServerBuddy Lab</h1>
        <span className="hidden sm:inline text-[10px] font-bold text-amber-500 bg-amber-500/10 rounded-full px-2 py-1">SIMULATED — SAFE</span>
      </header>

      {/* Tabs */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 flex gap-1">
        {([
          ["terminal", "Terminal", <TerminalIcon key="t" className="w-3.5 h-3.5" />],
          ["nginx", "Nginx", <Globe key="n" className="w-3.5 h-3.5" />],
          ["deploy", "Deploy", <Rocket key="d" className="w-3.5 h-3.5" />],
        ] as [Tab, string, JSX.Element][]).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => (id === "nginx" ? openNginxTab() : setTab(id))}
            className={`px-3.5 h-11 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              tab === id
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "terminal" && <TerminalView shell={shell} />}
      {tab === "nginx" && (
        <NginxPanel
          config={nginxConfig}
          setConfig={setNginxConfig}
          verdict={nginxVerdict}
          onValidate={validateNginx}
          onSave={saveNginxToSim}
          savedAt={nginxSavedAt}
        />
      )}
      {tab === "deploy" && (
        <DeployPanel
          openRunbookId={openRunbookId}
          setOpenRunbookId={setOpenRunbookId}
          doneSteps={doneSteps}
          toggleStep={toggleStep}
          quizAnswers={quizAnswers}
          setAnswer={setAnswer}
          quizResults={quizResults}
          checkQuiz={checkQuiz}
          onSaveProject={saveDeployProject}
          savingProject={savingProject}
          projectSavedAt={projectSavedAt}
        />
      )}
    </div>
  );
}

// __PART2__

// =====================================================================
// Terminal tab
// =====================================================================

const QUICK_COMMANDS = [
  "help", "ls -l", "cat ~/welcome.txt", "ps aux", "systemctl status nginx",
  "journalctl -u nginx -n 5", "nginx -t", "curl http://localhost/", "docker ps",
];

function TerminalView({ shell }: { shell: SimShell }) {
  const [lines, setLines] = useState<TerminalLine[]>([
    { text: "ServerBuddy simulated shell — Ubuntu 24.04 (fake). Type `help` to see what works." },
    { text: "Everything is client-side and safe. Nothing here can break anything." },
    { text: "" },
  ]);
  const [input, setInput] = useState("");
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prompt = `dev@webdev:${shell.cwd.replace("/home/dev", "~") || "/"}$`;

  // Autoscroll on new output
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const submit = () => {
    const cmd = input;
    setInput("");
    setHistoryIdx(null);
    if (!cmd.trim()) {
      setLines((prev) => [...prev, { text: `${prompt} `, isCommand: true }]);
      return;
    }
    const result = shell.run(cmd);
    const newLines: TerminalLine[] = [{ text: `${prompt} ${cmd}`, isCommand: true }];
    if (result.clear) {
      setLines([]);
      return;
    }
    if (result.output) {
      for (const l of result.output.split("\n")) {
        newLines.push({ text: l, isError: result.isError });
      }
    }
    setLines((prev) => [...prev, ...newLines]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      submit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = shell.history;
      if (h.length === 0) return;
      const idx = historyIdx === null ? h.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setInput(h[idx]);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const h = shell.history;
      if (historyIdx === null) return;
      const idx = historyIdx + 1;
      if (idx >= h.length) {
        setHistoryIdx(null);
        setInput("");
      } else {
        setHistoryIdx(idx);
        setInput(h[idx]);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="max-w-3xl w-full mx-auto w-full px-4 pt-4 flex-1 flex flex-col min-h-0">
        {/* Scrollback */}
        <div
          ref={scrollRef}
          onClick={() => inputRef.current?.focus()}
          className="flex-1 min-h-[45vh] max-h-[60vh] overflow-y-auto rounded-2xl bg-black/60 border border-gray-800 p-3 font-mono text-[11px] leading-4 cursor-text"
        >
          {lines.map((l, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${
                l.isCommand ? "text-emerald-300 font-semibold" : l.isError ? "text-rose-400" : "text-gray-300"
              }`}
            >
              {l.text || "\u00A0"}
            </div>
          ))}
        </div>

        {/* Input line */}
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-gray-900 border border-gray-700 px-3 py-2.5 focus-within:border-emerald-500 transition">
          <span className="font-mono text-[11px] text-emerald-400 flex-shrink-0 truncate max-w-[45%]">{prompt}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="try: help"
            className="flex-1 bg-transparent font-mono text-xs text-gray-100 outline-none placeholder:text-gray-600"
          />
        </div>

        {/* Quick commands */}
        <div className="flex flex-wrap gap-1.5 py-3">
          {QUICK_COMMANDS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setInput(c);
                inputRef.current?.focus();
              }}
              className="text-[10px] font-mono text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-full px-2.5 py-1 transition"
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => setLines([])}
            className="text-[10px] font-mono text-gray-500 bg-gray-800/50 hover:bg-gray-700 rounded-full px-2.5 py-1 transition flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> clear
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Nginx tab
// =====================================================================

function NginxPanel({
  config, setConfig, verdict, onValidate, onSave, savedAt,
}: {
  config: string;
  setConfig: (v: string) => void;
  verdict: NginxVerdict | null;
  onValidate: () => void;
  onSave: () => void;
  savedAt: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  // Group routes for the flow diagram
  const routeGroups = useMemo(() => {
    if (!verdict?.routes.length) return [];
    const map = new Map<string, NginxVerdict["routes"]>();
    for (const r of verdict.routes) {
      const key = `${r.serverName}:${r.listenPort}`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [verdict]);

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-4 space-y-4">
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
            <FileCode2 className="w-4 h-4 text-emerald-400" /> /etc/nginx/nginx.conf
          </h2>
          <button
            onClick={copy}
            className="text-[10px] font-semibold text-gray-400 hover:text-white flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          spellCheck={false}
          rows={16}
          className="w-full font-mono text-[11px] leading-4 bg-black/50 text-gray-200 rounded-xl border border-gray-700 p-3 outline-none focus:border-emerald-500 transition"
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={onValidate}
            className="h-9 px-4 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 flex items-center gap-1.5"
          >
            <TerminalIcon className="w-3.5 h-3.5" /> nginx -t
          </button>
          <button
            onClick={onSave}
            className="h-9 px-4 rounded-full bg-gray-800 text-gray-100 text-xs font-semibold hover:bg-gray-700 flex items-center gap-1.5 border border-gray-700"
          >
            <Save className="w-3.5 h-3.5" /> Save to sim
          </button>
          <p className="text-[10px] text-gray-500 self-center">
            Saving writes it into the simulated server — then `systemctl restart nginx` in the Terminal will validate it for real.
          </p>
        </div>
        {savedAt && (
          <p className="text-xs text-emerald-400 mt-2">Saved to /etc/nginx/nginx.conf in the sim.</p>
        )}
      </section>

      {/* Verdict */}
      {verdict && (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            {verdict.ok ? (
              <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><p className="text-xs font-bold text-emerald-400">syntax is ok — test is successful</p></>
            ) : (
              <><XCircle className="w-4 h-4 text-rose-400" /><p className="text-xs font-bold text-rose-400">{verdict.errors.length} error(s) — nginx would refuse to start</p></>
            )}
          </div>
          {verdict.errors.map((e, i) => (
            <p key={`e${i}`} className="text-[11px] font-mono text-rose-300 bg-rose-500/10 rounded-lg px-2.5 py-1.5">{e}</p>
          ))}
          {verdict.warnings.map((w, i) => (
            <p key={`w${i}`} className="text-[11px] font-mono text-amber-300 bg-amber-500/10 rounded-lg px-2.5 py-1.5 flex gap-1.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </section>
      )}

      {/* Route diagram */}
      {verdict && routeGroups.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-emerald-400" /> Request flow
          </h2>
          <div className="space-y-3">
            {routeGroups.map(([key, routes]) => (
              <div key={key} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2 py-1.5 rounded-lg bg-gray-800 text-gray-300 font-mono">client</span>
                <span className="text-gray-500">→</span>
                <span className="px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/30">
                  nginx :{routes[0].listenPort} · {key.split(":")[0]}
                </span>
                {routes.map((r, i) => (
                  r.proxyPass ? (
                    <span key={i} className="flex items-center gap-2">
                      <span className="text-gray-500">→</span>
                      <span className="px-2 py-1.5 rounded-lg bg-sky-500/10 text-sky-300 font-mono border border-sky-500/30">
                        {r.location} → {r.proxyPass}
                      </span>
                    </span>
                  ) : r.root ? (
                    <span key={i} className="flex items-center gap-2">
                      <span className="text-gray-500">→</span>
                      <span className="px-2 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 font-mono border border-violet-500/30">
                        {r.location} → static {r.root}
                      </span>
                    </span>
                  ) : (
                    <span key={i} className="flex items-center gap-2">
                      <span className="text-gray-500">→</span>
                      <span className="px-2 py-1.5 rounded-lg bg-gray-800 text-gray-400 font-mono">{r.location} (no handler)</span>
                    </span>
                  )
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// =====================================================================
// Deploy tab
// =====================================================================

type DeployPanelProps = {
  openRunbookId: string | null;
  setOpenRunbookId: (id: string | null) => void;
  doneSteps: Record<string, Set<string>>;
  toggleStep: (rb: Runbook, stepId: string) => void;
  quizAnswers: Record<string, number[]>;
  setAnswer: (rbId: string, qi: number, oi: number) => void;
  quizResults: Record<string, { passed: boolean; correct: number; total: number } | null>;
  checkQuiz: (rb: Runbook) => void;
  onSaveProject: (rb: Runbook) => Promise<void>;
  savingProject: boolean;
  projectSavedAt: number | null;
};

function DeployPanel(p: DeployPanelProps) {
  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-4 space-y-3">
      <p className="text-xs text-gray-400">
        Guided runbooks with generated artifacts and a quiz gate — you deploy for real when <b>you</b> run the commands; this wizard makes sure you understand every step first.
      </p>
      {RUNBOOKS.map((rb) => (
        <RunbookCard key={rb.id} rb={rb} {...p} />
      ))}
    </div>
  );
}

function RunbookCard({
  rb, openRunbookId, setOpenRunbookId, doneSteps, toggleStep,
  quizAnswers, setAnswer, quizResults, checkQuiz, onSaveProject, savingProject, projectSavedAt,
}: DeployPanelProps & { rb: Runbook }) {
  const open = openRunbookId === rb.id;
  const done = doneSteps[rb.id] ?? new Set<string>();
  const allStepsDone = rb.steps.every((s) => done.has(s.id));
  const result = quizResults[rb.id];
  const answers = quizAnswers[rb.id] ?? [];

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpenRunbookId(open ? null : rb.id)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-800/50 transition"
      >
        <span className="text-2xl">{rb.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white flex items-center gap-2">
            {rb.platform}
            {result?.passed && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </p>
          <p className="text-[11px] text-gray-400 truncate">{rb.blurb}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-gray-800 p-4 space-y-3">
          <p className="text-[11px] text-gray-400">
            <span className="font-semibold text-gray-300">Requires:</span> {rb.requires}
          </p>

          {/* Steps */}
          <ol className="space-y-2">
            {rb.steps.map((s, i) => {
              const stepDone = done.has(s.id);
              return (
                <li key={s.id} className={`rounded-xl border transition ${stepDone ? "border-emerald-500/40 bg-emerald-500/5" : "border-gray-800 bg-gray-800/30"}`}>
                  <div className="flex items-start gap-2.5 p-3">
                    <button
                      onClick={() => toggleStep(rb, s.id)}
                      aria-label={stepDone ? "Mark step not done" : "Mark step done"}
                      className={`mt-0.5 w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center transition ${
                        stepDone ? "bg-emerald-500 border-emerald-500" : "border-gray-600 hover:border-emerald-400"
                      }`}
                    >
                      {stepDone && <Check className="w-3 h-3 text-gray-950" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${stepDone ? "text-emerald-300" : "text-gray-100"}`}>
                        {i + 1}. {s.title}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">{s.body}</p>
                      {s.code && (
                        <div className="mt-2 rounded-lg bg-black/60 border border-gray-800 p-2.5 group relative">
                          <pre className="text-[10px] font-mono text-gray-300 whitespace-pre-wrap break-words">{s.code}</pre>
                          <CopyCodeButton code={s.code} />
                        </div>
                      )}
                      {s.generates && (
                        <p className="text-[10px] text-sky-300 mt-1.5 flex items-center gap-1">
                          <FileCode2 className="w-3 h-3" /> Generates <b>{s.generates.path}</b> (saved with "Save files to a Project" below)
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Quiz gate */}
          <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-3 space-y-3">
            <p className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-amber-400" /> Quiz gate — answer all correctly to complete the deploy
              {!allStepsDone && <span className="text-[10px] font-normal text-amber-400">(finish the steps first)</span>}
            </p>
            {rb.quiz.map((q, qi) => (
              <QuizBlock key={qi} q={q} qi={qi} selected={answers[qi]} result={result} onPick={(oi) => setAnswer(rb.id, qi, oi)} />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => checkQuiz(rb)}
                className="h-9 px-4 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
              >
                Check answers
              </button>
              {result && (
                <p className={`text-xs font-semibold ${result.passed ? "text-emerald-400" : "text-amber-400"}`}>
                  {result.passed
                    ? "Deploy complete ✓ — every answer correct."
                    : `${result.correct}/${result.total} correct — read the explanations and retry.`}
                </p>
              )}
            </div>
          </div>

          {/* Save artifacts */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSaveProject(rb)}
              disabled={savingProject}
              className="h-9 px-4 rounded-full bg-gray-100 text-gray-900 text-xs font-semibold hover:bg-white disabled:opacity-50 flex items-center gap-1.5"
            >
              {savingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save files to a Project
            </button>
            {projectSavedAt && (
              <p className="text-xs text-emerald-400">Saved — find it in My Projects.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable
        }
      }}
      className="absolute top-1.5 right-1.5 text-gray-500 hover:text-gray-200"
      aria-label="Copy code"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function QuizBlock({
  q, qi, selected, result, onPick,
}: {
  q: QuizQuestion;
  qi: number;
  selected: number | undefined;
  result: { passed: boolean; correct: number; total: number } | null;
  onPick: (oi: number) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-200 mb-1.5">{qi + 1}. {q.question}</p>
      <div className="space-y-1">
        {q.options.map((opt, oi) => {
          const isSelected = selected === oi;
          return (
            <button
              key={oi}
              onClick={() => onPick(oi)}
              className={`w-full text-left text-[11px] rounded-lg px-2.5 py-1.5 border transition ${
                isSelected
                  ? "border-emerald-500/60 bg-emerald-500/10 text-gray-100"
                  : "border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-600"
              }`}
            >
              {String.fromCharCode(65 + oi)}. {opt}
            </button>
          );
        })}
      </div>
      {result && !result.passed && (
        <p className="text-[10px] text-gray-500 mt-1.5 flex items-start gap-1">
          <Lock className="w-3 h-3 flex-shrink-0 mt-0.5" /> {q.explanation}
        </p>
      )}
    </div>
  );
}

