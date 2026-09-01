"use client";
/**
 * BackendBuddyScreen — Phase 55 (backend track).
 *
 * Workspace layout (mirrors WebBuilderScreen):
 *   CHAT (SSE stream with buddyId "backend") | TABS:
 *
 *   SQL     — sql.js WASM playground: schema/seed/queries files, one-tap
 *             sample schemas (blog, e-commerce, school), Run + Rebuild DB,
 *             result tables with per-statement row counts, live schema sidebar.
 *   API     — endpoint designer → live OpenAPI 3.1 YAML (validated), one-tap
 *             Express / FastAPI scaffold generation into project files.
 *   Test    — SSRF-guarded HTTP client via POST /api/tools/http
 *             (status, timing, headers, pretty JSON body).
 *   Schema  — ER visualization from the sql.js database or a pasted
 *             Prisma schema (parsePrismaModels).
 *   Files   — full project file editor (scaffolds land here too).
 *
 * Persistence mirrors DevBuddy/WebBuilder: POST /api/projects on first save
 * (buddyId "backend"), PUT /api/projects/:id/files afterwards.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, Save, Loader2, Play, RefreshCw, Plus, Trash2, Copy, Check,
  Send, Database, Table2, ShieldAlert, FileCode2, Braces,
} from "lucide-react";
import { useApp } from "../store";
import { CodeEditor, detectLanguageFromPath } from "./CodeEditor";
import { extractCodeFiles } from "@/lib/code-extract";
import { SQL_SAMPLES, DEFAULT_QUERIES, getSample } from "@/lib/sql-samples";
import {
  specToYaml, validateEndpoints, scaffoldExpress, scaffoldFastApi,
  methodHasBody, HTTP_METHODS,
  type ApiEndpoint, type ApiSpecInfo, type ApiParam, type ApiBodyField, type ApiResponseDef,
} from "@/lib/openapi-designer";
import { parsePrismaModels } from "@/lib/prisma-erd";
import type { RunReport, SqlSandbox, SchemaSummary } from "@/lib/sql-sandbox";

type ProjectFile = { id: string; path: string; language: string; content: string; isEntry: boolean };
type Project = {
  id: string; buddyId: string; title: string; description: string | null;
  tags: string[]; conversationId: string | null; files: ProjectFile[];
};
type ChatMsg = { role: "user" | "assistant"; text: string; files?: number };

const STARTER_INFO: ApiSpecInfo = {
  title: "Todos API",
  version: "1.0.0",
  description: "Starter spec — edit endpoints in the API tab.",
};

const STARTER_ENDPOINTS: ApiEndpoint[] = [
  { id: "ep-1", method: "get", path: "/todos", summary: "List todos", tag: "todos",
    params: [{ name: "limit", in: "query", type: "integer", required: false }],
    bodyFields: [], responses: [{ status: 200, description: "OK" }] },
  { id: "ep-2", method: "post", path: "/todos", summary: "Create a todo", tag: "todos",
    params: [], bodyFields: [{ name: "title", type: "string", required: true }],
    responses: [{ status: 201, description: "Created" }] },
  { id: "ep-3", method: "get", path: "/todos/{id}", summary: "Get one todo", tag: "todos",
    params: [{ name: "id", in: "path", type: "integer", required: true }],
    bodyFields: [], responses: [{ status: 200, description: "OK" }] },
  { id: "ep-4", method: "delete", path: "/todos/{id}", summary: "Delete a todo", tag: "todos",
    params: [{ name: "id", in: "path", type: "integer", required: true }],
    bodyFields: [], responses: [{ status: 204, description: "Deleted" }] },
];

const STARTER_YAML = specToYaml(STARTER_INFO, STARTER_ENDPOINTS);

const STARTER_PRISMA = `model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String
  posts Post[]
}

model Post {
  id     Int    @id @default(autoincrement())
  title  String
  userId Int
  user   User   @relation(fields: [userId], references: [id])
}`;

function starterFiles(): ProjectFile[] {
  const blog = getSample("blog")!;
  return [
    { id: "temp-0", path: "schema.sql", language: "sql", content: blog.schemaSql, isEntry: true },
    { id: "temp-1", path: "seed.sql", language: "sql", content: blog.seedSql, isEntry: false },
    { id: "temp-2", path: "queries.sql", language: "sql", content: DEFAULT_QUERIES, isEntry: false },
    { id: "temp-3", path: "openapi.yaml", language: "text", content: STARTER_YAML, isEntry: false },
  ];
}

function parseHeadersText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function mergeReports(a: RunReport, b: RunReport): RunReport {
  return {
    results: [...a.results, ...b.results],
    error: a.error ?? b.error,
    statementsRun: a.statementsRun + b.statementsRun,
    totalRows: a.totalRows + b.totalRows,
  };
}

export function BackendBuddyScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;

  // ---------- project state ----------
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------- workspace ----------
  const [tab, setTab] = useState<"sql" | "api" | "test" | "schema" | "files">("sql");
  const [pane, setPane] = useState<"chat" | "work">("chat");

  // SQL playground
  const sandboxRef = useRef<SqlSandbox | null>(null);
  const [sqlFile, setSqlFile] = useState<"schema.sql" | "seed.sql" | "queries.sql">("schema.sql");
  const [runReport, setRunReport] = useState<RunReport | null>(null);
  const [running, setRunning] = useState(false);
  const [dbSummary, setDbSummary] = useState<SchemaSummary | null>(null);

  // API designer
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>(STARTER_ENDPOINTS);
  const [specInfo, setSpecInfo] = useState<ApiSpecInfo>(STARTER_INFO);
  const [copied, setCopied] = useState(false);
  const [scaffoldNote, setScaffoldNote] = useState<string | null>(null);

  // API tester
  const [reqMethod, setReqMethod] = useState("GET");
  const [reqUrl, setReqUrl] = useState("https://api.github.com/zen");
  const [reqHeaders, setReqHeaders] = useState("Accept: application/json");
  const [reqBody, setReqBody] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Schema / ER
  const [erdSource, setErdSource] = useState<"sql" | "prisma">("sql");
  const [prismaText, setPrismaText] = useState(STARTER_PRISMA);

  // Files tab
  const [activeFilePath, setActiveFilePath] = useState("schema.sql");

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ---------- project load ----------
  useEffect(() => {
    if (activeProjectId) {
      setLoading(true);
      fetch(`/api/projects/${activeProjectId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          const p = d.project;
          if (!p) throw new Error("Project not found");
          setProject(p);
          setFiles(p.files ?? []);
          setActiveFilePath(p.files?.[0]?.path ?? "schema.sql");
        })
        .catch((e) => setError(e?.message ?? "Failed to load project"))
        .finally(() => setLoading(false));
    } else {
      const starter = starterFiles();
      setProject({
        id: "temp-" + Date.now(), buddyId: "backend", title: "Untitled API project",
        description: null, tags: [], conversationId: null, files: starter,
      });
      setFiles(starter);
      setActiveFilePath("schema.sql");
      setLoading(false);
    }
  }, [activeProjectId]);

  // Keep the designer as the single source of truth for openapi.yaml.
  const specYaml = useMemo(() => specToYaml(specInfo, endpoints), [specInfo, endpoints]);
  useEffect(() => {
    setFiles((prev) => prev.map((f) => (f.path === "openapi.yaml" ? { ...f, content: specYaml } : f)));
  }, [specYaml]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuf]);

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
    setDirty(true);
  }, []);

  // ---------- save (mirrors WebBuilderScreen) ----------
  const saveProject = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      let projectId = project.id;
      const payload = {
        files: files.map((f) => ({ path: f.path, language: f.language, content: f.content, isEntry: f.isEntry })),
      };
      if (project.id.startsWith("temp-")) {
        const createRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buddyId: "backend", title: project.title, description: project.description, tags: project.tags, ...payload }),
        });
        if (!createRes.ok) throw new Error(`Create failed: HTTP ${createRes.status}`);
        const created = await createRes.json();
        projectId = created.project.id;
        setProject((p) => (p ? { ...p, id: projectId } : p));
        setActiveProjectId(projectId);
      } else {
        const updateRes = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!updateRes.ok) throw new Error(`Save failed: HTTP ${updateRes.status}`);
      }
      setDirty(false);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [project, files, setActiveProjectId]);

  // ---------- SQL playground ----------
  const ensureSandbox = useCallback(async (): Promise<SqlSandbox> => {
    if (!sandboxRef.current) {
      const { createSqlSandbox } = await import("@/lib/sql-sandbox");
      sandboxRef.current = await createSqlSandbox();
    }
    return sandboxRef.current;
  }, []);

  const runSql = useCallback(async (opts?: { fresh?: boolean; scriptOverride?: string }) => {
    setRunning(true);
    setError(null);
    try {
      let box: SqlSandbox;
      if (opts?.fresh) {
        const { createSqlSandbox } = await import("@/lib/sql-sandbox");
        box = await createSqlSandbox();
        sandboxRef.current = box;
      } else {
        box = await ensureSandbox();
      }
      const find = (p: string) => files.find((f) => f.path === p)?.content ?? "";
      const script = opts?.scriptOverride ?? find(sqlFile);
      const report = box.run(script);
      if (!report.error && (sqlFile === "schema.sql" || sqlFile === "seed.sql" || opts?.fresh)) {
        setDbSummary(box.schema());
      }
      setRunReport(report);
    } catch (e: any) {
      setError(e?.message ?? "Failed to run SQL");
    } finally {
      setRunning(false);
    }
  }, [files, sqlFile, ensureSandbox]);

  const rebuildDb = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const { createSqlSandbox } = await import("@/lib/sql-sandbox");
      const box = await createSqlSandbox();
      sandboxRef.current = box;
      const find = (p: string) => files.find((f) => f.path === p)?.content ?? "";
      const schemaReport = box.run(find("schema.sql"));
      const seedReport = schemaReport.error ? { results: [], error: null, statementsRun: 0, totalRows: 0 } : box.run(find("seed.sql"));
      setRunReport(mergeReports(schemaReport, seedReport));
      setDbSummary(box.schema());
    } catch (e: any) {
      setError(e?.message ?? "Failed to rebuild database");
    } finally {
      setRunning(false);
    }
  }, [files]);

  const loadSample = useCallback(async (id: string) => {
    const sample = getSample(id);
    if (!sample) return;
    setFiles((prev) =>
      prev.map((f) =>
        f.path === "schema.sql" ? { ...f, content: sample.schemaSql }
        : f.path === "seed.sql" ? { ...f, content: sample.seedSql }
        : f
      )
    );
    setSqlFile("schema.sql");
    setDirty(true);
    setRunning(true);
    try {
      const { createSqlSandbox } = await import("@/lib/sql-sandbox");
      const box = await createSqlSandbox();
      sandboxRef.current = box;
      const r1 = box.run(sample.schemaSql);
      const r2 = r1.error ? { results: [], error: null, statementsRun: 0, totalRows: 0 } : box.run(sample.seedSql);
      setRunReport(mergeReports(r1, r2));
      setDbSummary(box.schema());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sample");
    } finally {
      setRunning(false);
    }
  }, []);

  // ---------- chat with BackendBuddy (mirrors WebBuilderScreen) ----------
  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setStreaming(true);
    setStreamBuf("");
    const ac = new AbortController();
    abortRef.current = ac;
    let accumulated = "";
    try {
      const res = await fetch("/api/tutor/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, buddyId: "backend", conversationId: project?.conversationId ?? null }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const evType = ev.match(/^event: (.+)$/m)?.[1];
          const dataLine = ev.match(/^data: (.+)$/m)?.[1];
          if (!evType || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (evType === "delta") {
            accumulated += data.text ?? "";
            setStreamBuf(accumulated);
          } else if (evType === "done") {
            const extracted = extractCodeFiles(accumulated);
            setMessages((m) => [...m, { role: "assistant", text: data.reply ?? accumulated, files: extracted?.length ?? 0 }]);
            setStreamBuf("");
          } else if (evType === "error") {
            throw new Error(data.error ?? "AI error");
          }
        }
      }
      if (accumulated && !messages.some((m) => m.role === "assistant" && m.text === (streamBuf || accumulated))) {
        const extracted = extractCodeFiles(accumulated);
        setMessages((m) => [...m, { role: "assistant", text: accumulated, files: extracted?.length ?? 0 }]);
        setStreamBuf("");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${e?.message ?? "Chat failed. Try again."}` }]);
        setStreamBuf("");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, project?.conversationId, messages, streamBuf]);

  const loadReplyIntoFiles = useCallback((replyText: string) => {
    const extracted = extractCodeFiles(replyText);
    if (!extracted || extracted.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const f of extracted) {
        const existing = next.findIndex((x) => x.path === f.path);
        const entry = {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          path: f.path,
          language: f.language || detectLanguageFromPath(f.path) || "text",
          content: f.content,
          isEntry: false,
        };
        if (existing >= 0) next[existing] = { ...next[existing], ...entry, id: next[existing].id };
        else next.push(entry);
      }
      return next;
    });
    setDirty(true);
    setTab("files");
    setPane("work");
  }, []);

  // ---------- API designer ----------
  const validationErrors = useMemo(() => validateEndpoints(endpoints), [endpoints]);

  const TABS: { id: "sql" | "api" | "test" | "schema" | "files"; label: string; icon: any }[] = [
    { id: "sql", label: "SQL", icon: Database },
    { id: "api", label: "API Designer", icon: Braces },
    { id: "test", label: "API Tester", icon: Send },
    { id: "schema", label: "Schema ER", icon: Table2 },
    { id: "files", label: "Files", icon: FileCode2 },
  ];

  const updateEndpoint = (id: string, patch: Partial<ApiEndpoint>) => {
    setEndpoints((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const addEndpoint = () => {
    setEndpoints((prev) => [
      ...prev,
      {
        id: `ep-${Date.now()}`,
        method: "get",
        path: prev.length === 0 ? "/resource" : `/resource-${prev.length + 1}`,
        summary: "",
        tag: "default",
        params: [],
        bodyFields: [],
        responses: [{ status: 200, description: "OK" }],
      },
    ]);
  };

  const removeEndpoint = (id: string) => setEndpoints((prev) => prev.filter((e) => e.id !== id));

  const updateParam = (epId: string, index: number, patch: Partial<ApiParam>) => {
    setEndpoints((prev) =>
      prev.map((e) =>
        e.id === epId ? { ...e, params: e.params.map((p, i) => (i === index ? { ...p, ...patch } : p)) } : e
      )
    );
  };

  const addParam = (epId: string, location: "path" | "query") =>
    setEndpoints((prev) =>
      prev.map((e) =>
        e.id === epId
          ? { ...e, params: [...e.params, { name: "", in: location, type: "string", required: location === "path" }] }
          : e
      )
    );

  const removeParam = (epId: string, index: number) =>
    setEndpoints((prev) =>
      prev.map((e) => (e.id === epId ? { ...e, params: e.params.filter((_, i) => i !== index) } : e))
    );

  const updateBodyField = (epId: string, index: number, patch: Partial<ApiBodyField>) => {
    setEndpoints((prev) =>
      prev.map((e) =>
        e.id === epId ? { ...e, bodyFields: e.bodyFields.map((f, i) => (i === index ? { ...f, ...patch } : f)) } : e
      )
    );
  };

  const addBodyField = (epId: string) =>
    setEndpoints((prev) =>
      prev.map((e) => (e.id === epId ? { ...e, bodyFields: [...e.bodyFields, { name: "", type: "string", required: false }] } : e))
    );

  const removeBodyField = (epId: string, index: number) =>
    setEndpoints((prev) =>
      prev.map((e) => (e.id === epId ? { ...e, bodyFields: e.bodyFields.filter((_, i) => i !== index) } : e))
    );

  const updateResponse = (epId: string, index: number, patch: Partial<ApiResponseDef>) => {
    setEndpoints((prev) =>
      prev.map((e) =>
        e.id === epId ? { ...e, responses: e.responses.map((r, i) => (i === index ? { ...r, ...patch } : r)) } : e
      )
    );
  };

  const addResponse = (epId: string) =>
    setEndpoints((prev) =>
      prev.map((e) => (e.id === epId ? { ...e, responses: [...e.responses, { status: 200, description: "OK" }] } : e))
    );

  const removeResponse = (epId: string, index: number) =>
    setEndpoints((prev) =>
      prev.map((e) => (e.id === epId ? { ...e, responses: e.responses.filter((_, i) => i !== index) } : e))
    );

  const copyYaml = async () => {
    try {
      await navigator.clipboard.writeText(specYaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const generateScaffold = (framework: "express" | "fastapi") => {
    const generated = framework === "express" ? scaffoldExpress(specInfo, endpoints) : scaffoldFastApi(specInfo, endpoints);
    setFiles((prev) => {
      const next = [...prev];
      for (const f of generated) {
        const idx = next.findIndex((x) => x.path === f.path);
        const entry: ProjectFile = {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          path: f.path,
          language: f.path.endsWith(".py") ? "python" : "javascript",
          content: f.content,
          isEntry: false,
        };
        if (idx >= 0) next[idx] = { ...next[idx], ...entry, id: next[idx].id };
        else next.push(entry);
      }
      return next;
    });
    setDirty(true);
    setScaffoldNote(
      `${framework === "express" ? "Express" : "FastAPI"} scaffold: ${generated.length} file(s) added — open the Files tab.`
    );
    setTimeout(() => setScaffoldNote(null), 5000);
  };

  // ---------- API tester ----------
  const sendTest = useCallback(async () => {
    if (!reqUrl.trim() || sending) return;
    setSending(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/tools/http", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: reqUrl.trim(),
          method: reqMethod,
          headers: parseHeadersText(reqHeaders),
          body: methodHasBody(reqMethod.toLowerCase() as any) ? reqBody : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setTestError(j?.error ?? `HTTP ${res.status}`);
      else setTestResult(j);
    } catch (e: any) {
      setTestError(e?.message ?? "Request failed");
    } finally {
      setSending(false);
    }
  }, [reqUrl, reqMethod, reqHeaders, reqBody, sending]);

  const prettyTestBody = useMemo(() => {
    if (!testResult) return "";
    if ((testResult.contentType ?? "").includes("json")) {
      try {
        return JSON.stringify(JSON.parse(testResult.body), null, 2);
      } catch {
        /* not JSON after all */
      }
    }
    return testResult.body ?? "";
  }, [testResult]);

  const statusColor = (status: number) =>
    status < 300 ? "bg-emerald-100 text-emerald-700"
    : status < 400 ? "bg-amber-100 text-amber-700"
    : status < 500 ? "bg-orange-100 text-orange-700"
    : "bg-red-100 text-red-700";

  // ---------- files ----------
  const addFile = () => {
    const path = prompt("New file path (e.g. queries.sql, notes.md):")?.trim();
    if (!path) return;
    if (files.some((f) => f.path === path)) {
      setError(`File already exists: ${path}`);
      return;
    }
    setFiles((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, path, language: detectLanguageFromPath(path) as string, content: "", isEntry: false },
    ]);
    setActiveFilePath(path);
    setDirty(true);
  };

  const deleteFile = (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    setFiles((prev) => prev.filter((f) => f.path !== path));
    if (activeFilePath === path) setActiveFilePath(files.find((f) => f.path !== path)?.path ?? "");
    setDirty(true);
  };

  // ---------- ER model ----------
  const prismaErd = useMemo(() => parsePrismaModels(prismaText), [prismaText]);
  const erdTables = erdSource === "sql" ? dbSummary?.tables ?? [] : prismaErd.tables;
  const erdRelations = erdSource === "sql" ? dbSummary?.relations ?? [] : prismaErd.relations;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ---------- header ---------- */}
      <header className="h-14 shrink-0 border-b bg-white flex items-center gap-2 px-3">
        <button onClick={() => setScreen("projects")} className="p-2 rounded-lg hover:bg-gray-100" title="Back to projects">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-lg">⚙️</span>
        <input
          value={project?.title ?? ""}
          onChange={(e) => {
            setProject((p) => (p ? { ...p, title: e.target.value } : p));
            setDirty(true);
          }}
          className="flex-1 min-w-0 text-sm font-semibold bg-transparent outline-none"
          placeholder="Project title"
        />
        {savedAt && <span className="hidden sm:inline text-xs text-emerald-600 font-medium">Saved ✓</span>}
        {dirty && !saving && !savedAt && <span className="hidden sm:inline text-xs text-gray-400">Unsaved</span>}
        <button
          onClick={saveProject}
          disabled={saving}
          className="h-8 px-3 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {/* ---------- mobile pane switch ---------- */}
      <div className="md:hidden flex border-b bg-white shrink-0">
        {(["chat", "work"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPane(p)}
            className={`flex-1 h-9 text-xs font-semibold ${pane === p ? "text-rose-600 border-b-2 border-rose-500" : "text-gray-500"}`}
          >
            {p === "chat" ? "💬 Chat" : "🛠 Workspace"}
          </button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ---------- chat pane ---------- */}
        <aside className={`${pane === "chat" ? "flex" : "hidden"} md:flex w-full md:w-[350px] shrink-0 border-r bg-white flex-col`}>
          <div className="h-9 shrink-0 px-3 flex items-center gap-2 border-b">
            <span className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center text-xs">⚙️</span>
            <p className="text-xs font-semibold text-gray-700">BackendBuddy</p>
            <p className="text-[10px] text-gray-400 ml-auto">APIs · SQL · servers</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs text-gray-500 bg-rose-50 rounded-xl p-3 leading-relaxed">
                Ask me to <b>design a schema</b> (<code>path=&quot;schema.sql&quot;</code>), <b>write an OpenAPI spec</b> (<code>path=&quot;openapi.yaml&quot;</code>), or <b>scaffold an Express/FastAPI server</b>. Replies containing file blocks can be loaded straight into your project.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap break-words ${m.role === "user" ? "bg-rose-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                  {m.text}
                  {m.role === "assistant" && !!m.files && m.files > 0 && (
                    <button
                      onClick={() => loadReplyIntoFiles(m.text)}
                      className="mt-2 block w-full text-left text-[11px] font-semibold text-rose-600 hover:underline"
                    >
                      ⬇ Load {m.files} file{m.files > 1 ? "s" : ""} into project
                    </button>
                  )}
                </div>
              </div>
            ))}
            {streaming && streamBuf && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-3 py-2 text-xs bg-gray-100 text-gray-800 whitespace-pre-wrap break-words">
                  {streamBuf}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-2 border-t flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              rows={1}
              placeholder="Design a blog schema…"
              className="flex-1 resize-none text-xs border rounded-xl px-3 py-2 outline-none focus:border-rose-400"
            />
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="w-9 h-9 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs"
                title="Stop"
              >
                ■
              </button>
            ) : (
              <button
                onClick={sendChat}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-full bg-rose-600 text-white flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </aside>

        {/* ---------- workspace ---------- */}
        <main className={`${pane === "work" ? "flex" : "hidden"} md:flex flex-1 min-w-0 flex-col`}>
          <div className="h-10 shrink-0 border-b bg-white flex items-stretch px-2 gap-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-3 my-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${tab === id ? "bg-rose-50 text-rose-700" : "text-gray-500 hover:bg-gray-50"}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {/* ============ SQL TAB ============ */}
            {tab === "sql" && (
              <div className="p-3 space-y-3 max-w-5xl mx-auto">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => runSql()}
                    disabled={running}
                    className="h-8 px-3 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-700 disabled:opacity-50"
                  >
                    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Run {sqlFile}
                  </button>
                  <button
                    onClick={rebuildDb}
                    disabled={running}
                    className="h-8 px-3 rounded-full border border-gray-300 text-gray-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Rebuild DB (schema + seed)
                  </button>
                  <span className="text-[10px] text-gray-400 ml-auto hidden sm:block">In-memory SQLite (WASM) — persisted into project files on Save</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Samples:</span>
                  {SQL_SAMPLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => loadSample(s.id)}
                      className="h-7 px-2.5 rounded-full bg-white border border-gray-200 text-[11px] font-medium text-gray-700 hover:border-rose-300 hover:text-rose-600"
                      title={s.description}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3 items-start">
                  <div className="hidden lg:block w-56 shrink-0 bg-white border rounded-xl p-2 max-h-[440px] overflow-y-auto">
                    <p className="text-[10px] font-bold text-gray-400 uppercase px-1 pb-1">Database</p>
                    {!dbSummary?.tables.length && <p className="text-[11px] text-gray-400 px-1">Run the schema to see tables.</p>}
                    {dbSummary?.tables.map((t) => (
                      <div key={t.name} className="mb-1.5">
                        <p className="text-[11px] font-bold text-gray-800 px-1">
                          {t.name} <span className="text-gray-400 font-normal">({t.columns.length})</span>
                        </p>
                        {t.columns.slice(0, 8).map((c) => (
                          <p key={c.name} className="text-[10px] text-gray-500 px-2 truncate">
                            {c.pk ? "🔑 " : ""}{c.name} <span className="text-gray-300">{c.type}</span>
                          </p>
                        ))}
                        {t.columns.length > 8 && <p className="text-[10px] text-gray-300 px-2">+{t.columns.length - 8} more…</p>}
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex gap-1">
                      {(["schema.sql", "seed.sql", "queries.sql"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setSqlFile(p)}
                          className={`h-7 px-2.5 rounded-lg text-[11px] font-mono ${sqlFile === p ? "bg-rose-100 text-rose-700" : "bg-white border border-gray-200 text-gray-600"}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <div className="bg-white border rounded-xl overflow-hidden">
                      <CodeEditor
                        value={files.find((f) => f.path === sqlFile)?.content ?? ""}
                        onChange={(v) => updateFileContent(sqlFile, v)}
                        language="sql"
                        minHeight="220px"
                      />
                    </div>

                    {runReport && (
                      <div className="space-y-2">
                        {runReport.error && (
                          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700">
                            <b>SQL error:</b> {runReport.error.message}
                            <div className="text-[10px] text-red-400 font-mono mt-1 break-all">{runReport.error.sql}</div>
                          </div>
                        )}
                        {!runReport.error && (
                          <p className="text-[11px] text-emerald-700 font-semibold">
                            ✓ {runReport.statementsRun} statement{runReport.statementsRun !== 1 ? "s" : ""} · {runReport.totalRows} row{runReport.totalRows !== 1 ? "s" : ""} returned
                          </p>
                        )}
                        {runReport.results.filter((r) => r.columns.length > 0).map((r, i) => (
                          <div key={i} className="bg-white border rounded-xl overflow-hidden">
                            <div className="px-3 py-1.5 bg-gray-50 border-b flex items-center gap-2">
                              <span className="text-[10px] font-mono text-gray-500 truncate flex-1">
                                {r.sql.slice(0, 90)}{r.sql.length > 90 ? "…" : ""}
                              </span>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                {r.rowCount} rows{r.rowsModified > 0 ? ` · ${r.rowsModified} modified` : ""}
                              </span>
                            </div>
                            <div className="overflow-x-auto max-h-56">
                              <table className="text-[11px] w-full">
                                <thead>
                                  <tr className="bg-gray-50">
                                    {r.columns.map((c) => (
                                      <th key={c} className="text-left px-2 py-1 font-semibold text-gray-600 border-b whitespace-nowrap">{c}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.rows.slice(0, 50).map((row, ri) => (
                                    <tr key={ri} className="odd:bg-white even:bg-gray-50/50">
                                      {r.columns.map((_c, ci) => (
                                        <td key={ci} className="px-2 py-1 text-gray-700 border-b border-gray-50 whitespace-nowrap max-w-[240px] truncate">
                                          {row[ci] === null ? <span className="text-gray-300 italic">NULL</span> : typeof row[ci] === "object" ? <span className="text-gray-400">BLOB</span> : String(row[ci])}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {r.rows.length > 50 && <p className="px-2 py-1 text-[10px] text-gray-400">+{r.rows.length - 50} more rows…</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ============ API DESIGNER TAB ============ */}
            {tab === "api" && (
              <div className="p-3 grid gap-3 lg:grid-cols-2 max-w-6xl mx-auto">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-700">Endpoints</p>
                    <button
                      onClick={addEndpoint}
                      className="h-7 px-2 rounded-full bg-rose-600 text-white text-[11px] font-semibold flex items-center gap-1 hover:bg-rose-700"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                    <span className="ml-auto text-[10px] text-gray-400">{endpoints.length} endpoint(s)</span>
                  </div>

                  {validationErrors.length > 0 && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-[11px] text-amber-800 space-y-0.5">
                      {validationErrors.map((e, i) => <p key={i}>⚠️ {e}</p>)}
                    </div>
                  )}

                  {endpoints.map((ep) => (
                    <div key={ep.id} className="bg-white border rounded-xl p-2.5 space-y-2">
                      <div className="flex gap-1.5 items-center">
                        <select
                          value={ep.method}
                          onChange={(e) => updateEndpoint(ep.id, { method: e.target.value as any })}
                          className="h-7 text-[11px] font-bold rounded-md border border-gray-200 bg-gray-50 text-rose-700 uppercase"
                        >
                          {HTTP_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                        </select>
                        <input
                          value={ep.path}
                          onChange={(e) => updateEndpoint(ep.id, { path: e.target.value })}
                          placeholder="/todos/{id}"
                          className="flex-1 min-w-0 h-7 text-[11px] font-mono rounded-md border border-gray-200 px-2 outline-none focus:border-rose-400"
                        />
                        <button onClick={() => removeEndpoint(ep.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        value={ep.summary}
                        onChange={(e) => updateEndpoint(ep.id, { summary: e.target.value })}
                        placeholder="Summary (required)"
                        className="w-full h-7 text-[11px] rounded-md border border-gray-200 px-2 outline-none focus:border-rose-400"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">tag</span>
                        <input
                          value={ep.tag}
                          onChange={(e) => updateEndpoint(ep.id, { tag: e.target.value })}
                          className="h-6 w-28 text-[11px] rounded-md border border-gray-200 px-2 outline-none"
                        />
                      </div>

                      {ep.params.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase">Parameters</p>
                          {ep.params.map((p, i) => (
                            <div key={i} className="flex gap-1 items-center">
                              <input
                                value={p.name}
                                onChange={(e) => updateParam(ep.id, i, { name: e.target.value })}
                                placeholder="name"
                                className="w-24 h-6 text-[11px] font-mono rounded border border-gray-200 px-1.5 outline-none"
                              />
                              <select
                                value={p.in}
                                onChange={(e) => updateParam(ep.id, i, { in: e.target.value as any })}
                                className="h-6 text-[10px] rounded border border-gray-200 bg-gray-50"
                              >
                                <option value="path">path</option>
                                <option value="query">query</option>
                              </select>
                              <select
                                value={p.type}
                                onChange={(e) => updateParam(ep.id, i, { type: e.target.value as any })}
                                className="h-6 text-[10px] rounded border border-gray-200 bg-gray-50"
                              >
                                {["string", "number", "integer", "boolean"].map((t) => <option key={t}>{t}</option>)}
                              </select>
                              <label className="text-[10px] text-gray-500 flex items-center gap-1">
                                <input type="checkbox" checked={p.required} onChange={(e) => updateParam(ep.id, i, { required: e.target.checked })} /> req
                              </label>
                              <button onClick={() => removeParam(ep.id, i)} className="ml-auto p-1 text-gray-300 hover:text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => addParam(ep.id, "path")} className="text-[10px] text-rose-600 font-semibold hover:underline">+ path param</button>
                        <button onClick={() => addParam(ep.id, "query")} className="text-[10px] text-rose-600 font-semibold hover:underline">+ query param</button>
                      </div>

                      {methodHasBody(ep.method) && (
                        <div className="space-y-1 bg-gray-50 rounded-lg p-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase">JSON body</p>
                            <button onClick={() => addBodyField(ep.id)} className="text-[10px] text-rose-600 font-semibold hover:underline">+ field</button>
                          </div>
                          {ep.bodyFields.length === 0 && <p className="text-[10px] text-gray-400">No fields (empty body).</p>}
                          {ep.bodyFields.map((f, i) => (
                            <div key={i} className="flex gap-1 items-center">
                              <input
                                value={f.name}
                                onChange={(e) => updateBodyField(ep.id, i, { name: e.target.value })}
                                placeholder="field"
                                className="w-28 h-6 text-[11px] font-mono rounded border border-gray-200 px-1.5 outline-none"
                              />
                              <select
                                value={f.type}
                                onChange={(e) => updateBodyField(ep.id, i, { type: e.target.value as any })}
                                className="h-6 text-[10px] rounded border border-gray-200 bg-white"
                              >
                                {["string", "number", "integer", "boolean", "string[]"].map((t) => <option key={t}>{t}</option>)}
                              </select>
                              <label className="text-[10px] text-gray-500 flex items-center gap-1">
                                <input type="checkbox" checked={f.required} onChange={(e) => updateBodyField(ep.id, i, { required: e.target.checked })} /> req
                              </label>
                              <button onClick={() => removeBodyField(ep.id, i)} className="ml-auto p-1 text-gray-300 hover:text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-1">
                        {ep.responses.map((r, i) => (
                          <div key={i} className="flex gap-1 items-center">
                            <input
                              type="number"
                              value={r.status}
                              onChange={(e) => updateResponse(ep.id, i, { status: Number(e.target.value) })}
                              className="w-16 h-6 text-[11px] font-mono rounded border border-gray-200 px-1.5 outline-none"
                            />
                            <input
                              value={r.description}
                              onChange={(e) => updateResponse(ep.id, i, { description: e.target.value })}
                              placeholder="description"
                              className="flex-1 min-w-0 h-6 text-[11px] rounded border border-gray-200 px-1.5 outline-none"
                            />
                            {ep.responses.length > 1 && (
                              <button onClick={() => removeResponse(ep.id, i)} className="p-1 text-gray-300 hover:text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button onClick={() => addResponse(ep.id)} className="text-[10px] text-rose-600 font-semibold hover:underline">+ response</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 lg:sticky lg:top-0 self-start">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-700">OpenAPI 3.1</p>
                    <button
                      onClick={copyYaml}
                      className="h-7 px-2 rounded-full border border-gray-200 text-[11px] font-semibold text-gray-600 flex items-center gap-1 hover:bg-gray-50"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
                    </button>
                    <span className="ml-auto text-[10px] text-gray-400">auto-synced into openapi.yaml</span>
                  </div>
                  {scaffoldNote && (
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">✓ {scaffoldNote}</p>
                  )}
                  <div className="bg-white border rounded-xl overflow-hidden">
                    <CodeEditor value={specYaml} readOnly language="text" minHeight="340px" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => generateScaffold("express")}
                      className="h-8 px-3 rounded-full bg-gray-900 text-white text-[11px] font-semibold hover:bg-black"
                    >
                      🚂 Scaffold Express
                    </button>
                    <button
                      onClick={() => generateScaffold("fastapi")}
                      className="h-8 px-3 rounded-full bg-teal-600 text-white text-[11px] font-semibold hover:bg-teal-700"
                    >
                      🐍 Scaffold FastAPI
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Scaffolds land in the Files tab (express/server.js + express/routes-*.js, or fastapi/main.py) and are saved with the project — open them in DevBuddy to keep building.
                  </p>
                </div>
              </div>
            )}

            {/* ============ API TESTER TAB ============ */}
            {tab === "test" && (
              <div className="p-3 space-y-3 max-w-3xl mx-auto">
                <div className="bg-white border rounded-xl p-3 space-y-2">
                  <div className="flex gap-1.5">
                    <select
                      value={reqMethod}
                      onChange={(e) => setReqMethod(e.target.value)}
                      className="h-8 text-[11px] font-bold rounded-md border border-gray-200 bg-gray-50 text-rose-700"
                    >
                      {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <input
                      value={reqUrl}
                      onChange={(e) => setReqUrl(e.target.value)}
                      placeholder="https://api.example.com/v1/…"
                      className="flex-1 min-w-0 h-8 text-xs font-mono rounded-md border border-gray-200 px-2 outline-none focus:border-rose-400"
                    />
                    <button
                      onClick={sendTest}
                      disabled={sending || !reqUrl.trim()}
                      className="h-8 px-3 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-700 disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Headers (one per line, Key: value)</p>
                      <textarea
                        value={reqHeaders}
                        onChange={(e) => setReqHeaders(e.target.value)}
                        rows={3}
                        className="w-full text-[11px] font-mono rounded-md border border-gray-200 p-2 outline-none focus:border-rose-400 resize-y"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Body (JSON, POST/PUT/PATCH)</p>
                      <textarea
                        value={reqBody}
                        onChange={(e) => setReqBody(e.target.value)}
                        rows={3}
                        disabled={!methodHasBody(reqMethod.toLowerCase() as any)}
                        placeholder='{"title": "hello"}'
                        className="w-full text-[11px] font-mono rounded-md border border-gray-200 p-2 outline-none focus:border-rose-400 resize-y disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 flex items-start gap-1">
                    <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
                    Requests go through an SSRF-guarded server proxy — private/loopback IPs, obfuscated addresses and internal hostnames are blocked. Limit: 12 requests/min.
                  </p>
                </div>

                {testError && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> {testError}
                  </div>
                )}

                {testResult && (
                  <div className="bg-white border rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusColor(testResult.status)}`}>
                        {testResult.status} {testResult.statusText}
                      </span>
                      <span className="text-[10px] text-gray-500">{testResult.durationMs} ms</span>
                      {testResult.redirects > 0 && <span className="text-[10px] text-amber-600">{testResult.redirects} redirect(s)</span>}
                      <span className="text-[10px] text-gray-400 truncate max-w-[240px] ml-auto" title={testResult.finalUrl}>
                        {testResult.finalUrl}
                      </span>
                    </div>
                    {Object.keys(testResult.headers ?? {}).length > 0 && (
                      <div className="px-3 py-2 border-b space-y-0.5 max-h-32 overflow-y-auto">
                        {Object.entries(testResult.headers).map(([k, v]) => (
                          <p key={k} className="text-[10px] font-mono text-gray-500 truncate">
                            <b className="text-gray-600">{k}:</b> {v as string}
                          </p>
                        ))}
                      </div>
                    )}
                    <pre className="p-3 text-[11px] font-mono text-gray-800 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
                      {prettyTestBody || <span className="text-gray-300 italic">(empty body)</span>}
                    </pre>
                    {testResult.truncated && <p className="px-3 pb-2 text-[10px] text-amber-600">Response truncated (1 MB cap).</p>}
                  </div>
                )}
              </div>
            )}

            {/* ============ SCHEMA ER TAB ============ */}
            {tab === "schema" && (
              <div className="p-3 space-y-3 max-w-5xl mx-auto">
                <div className="flex items-center gap-2">
                  {(["sql", "prisma"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setErdSource(s)}
                      className={`h-7 px-2.5 rounded-full text-[11px] font-semibold ${erdSource === s ? "bg-rose-100 text-rose-700" : "bg-white border border-gray-200 text-gray-500"}`}
                    >
                      {s === "sql" ? "From SQL sandbox" : "Paste Prisma schema"}
                    </button>
                  ))}
                </div>
                {erdSource === "prisma" && (
                  <div className="bg-white border rounded-xl overflow-hidden">
                    <CodeEditor value={prismaText} onChange={setPrismaText} language="text" minHeight="140px" />
                  </div>
                )}
                {erdSource === "sql" && erdTables.length === 0 && (
                  <p className="text-xs text-gray-400 bg-white border rounded-xl p-3">
                    Run a schema in the SQL tab first — tables and FK relations will appear here.
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {erdTables.map((t) => (
                    <div key={t.name} className="bg-white border rounded-xl overflow-hidden">
                      <div className="px-3 py-1.5 bg-rose-50 border-b">
                        <p className="text-xs font-bold text-rose-800">{t.name}</p>
                      </div>
                      <div className="p-2 space-y-0.5">
                        {t.columns.map((c) => (
                          <div key={c.name} className="flex items-center gap-1.5 text-[11px]">
                            {c.pk && <span title="primary key">🔑</span>}
                            <span className={`truncate ${c.pk ? "font-semibold text-gray-800" : "text-gray-700"}`}>{c.name}</span>
                            <span className="text-gray-300 ml-auto shrink-0">{c.type || "—"}</span>
                          </div>
                        ))}
                        {t.columns.length === 0 && <p className="text-[10px] text-gray-400">(no columns parsed)</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {erdRelations.length > 0 && (
                  <div className="bg-white border rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase pb-1.5">Relationships</p>
                    <div className="flex flex-wrap gap-1.5">
                      {erdRelations.map((r, i) => (
                        <span key={i} className="text-[11px] font-mono bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1 text-gray-700">
                          {r.from}.{r.fromColumn} → <b>{r.to}.{r.toColumn}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============ FILES TAB ============ */}
            {tab === "files" && (
              <div className="p-3 space-y-2 max-w-4xl mx-auto">
                <div className="flex flex-wrap items-center gap-1.5">
                  {files.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setActiveFilePath(f.path)}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-mono flex items-center gap-1 ${activeFilePath === f.path ? "bg-rose-100 text-rose-700" : "bg-white border border-gray-200 text-gray-600"}`}
                    >
                      <FileCode2 className="w-3 h-3" /> {f.path}
                    </button>
                  ))}
                  <button
                    onClick={addFile}
                    className="h-7 px-2 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                  {files.some((f) => f.path === activeFilePath) && (
                    <button
                      onClick={() => deleteFile(activeFilePath)}
                      className="h-7 px-2 rounded-lg text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
                {files.find((f) => f.path === activeFilePath) ? (
                  <div className="bg-white border rounded-xl overflow-hidden">
                    <CodeEditor
                      value={files.find((f) => f.path === activeFilePath)!.content}
                      onChange={(v) => updateFileContent(activeFilePath, v)}
                      language={(files.find((f) => f.path === activeFilePath)!.language as any) || "text"}
                      minHeight="420px"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No file selected — add one to start.</p>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
