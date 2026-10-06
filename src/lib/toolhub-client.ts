/**
 * Tools Hub client — Phase 9
 *
 * Server-side wrapper around the external Tools Hub service
 * (https://toolhub.space-z.ai). Provides:
 *   - listTools() — fetch the list of tools the API key can call
 *   - runCode(language, code) — execute Python/JS in the Tools Hub sandbox
 *   - callTutor(messages, subject, level) — call the Tools Hub AI Tutor
 *
 * SECURITY:
 *   - The API key is stored ENCRYPTED in the ToolhubSettings DB table.
 *     It's decrypted only at call time, never logged, never sent to the browser.
 *   - All Tools Hub calls happen server-side. The frontend never sees the key.
 *   - When ToolhubSettings.enabled is false OR codeSandboxEnabled is false,
 *     runCode() returns an `unsupported` result (same as the local kill switch
 *     being off). This is the fail-safe default.
 *   - When a Tools Hub call fails (network, auth, 5xx), the result has
 *     `error` set. The caller (code-sandbox.ts) decides how to surface this.
 *
 * PHASE 0 INTERACTION:
 *   This module is the escape hatch for the Phase 0 security containment.
 *   When the local Python/JS kill switch is ON (server-side execution disabled),
 *   code-sandbox.ts routes to toolhub-client.runCode() instead. The code
 *   runs on Tools Hub infrastructure, not on Study Buddy's server. This keeps
 *   the security risk on a separate service the admin controls.
 */

import { db } from "./db";
import { decryptApiKey } from "./crypto";

// ============================================================
// Types
// ============================================================

export type ToolhubTool = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
};

export type ToolhubRunCodeResult = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  error?: string;
  /** When the request itself failed (network, auth, 5xx). */
  requestError?: string;
};

export type ToolhubTutorResult = {
  ok: boolean;
  reply?: string;
  error?: string;
  requestError?: string;
};

export type ToolhubSettings = {
  enabled: boolean;
  hasApiKey: boolean;
  baseUrl: string;
  codeSandboxEnabled: boolean;
  tutorEnabled: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
};

// ============================================================
// Settings loader (cached for ~10s to avoid DB hits on every code run)
// ============================================================

let cachedSettings: { data: ToolhubSettings; apiKey: string | null; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10_000; // 10 seconds

async function loadSettings(): Promise<{
  settings: ToolhubSettings;
  apiKey: string | null;
}> {
  // Cache hit?
  if (cachedSettings && Date.now() - cachedSettings.fetchedAt < CACHE_TTL_MS) {
    return { settings: cachedSettings.data, apiKey: cachedSettings.apiKey };
  }

  let row: any = null;
  try {
    row = await db.toolhubSettings.findUnique({ where: { id: 1 } });
  } catch {
    // DB error — treat as disabled
    return {
      settings: {
        enabled: false,
        hasApiKey: false,
        baseUrl: "https://toolhub.space-z.ai",
        codeSandboxEnabled: false,
        tutorEnabled: false,
        lastTestedAt: null,
        lastTestOk: null,
        lastTestError: null,
      },
      apiKey: null,
    };
  }

  const settings: ToolhubSettings = {
    enabled: row?.enabled ?? false,
    hasApiKey: Boolean(row?.apiKeyEncrypted),
    baseUrl: row?.baseUrl ?? "https://toolhub.space-z.ai",
    codeSandboxEnabled: row?.codeSandboxEnabled ?? false,
    tutorEnabled: row?.tutorEnabled ?? false,
    lastTestedAt: row?.lastTestedAt ?? null,
    lastTestOk: row?.lastTestOk ?? null,
    lastTestError: row?.lastTestError ?? null,
  };

  let apiKey: string | null = null;
  if (row?.apiKeyEncrypted) {
    try {
      apiKey = decryptApiKey(row.apiKeyEncrypted);
    } catch {
      // Decryption failed — treat as no key. Admin will see the test fail.
      apiKey = null;
    }
  }

  cachedSettings = { data: settings, apiKey, fetchedAt: Date.now() };
  return { settings, apiKey };
}

/** Clear the settings cache. Called by /api/admin/toolhub-settings after PUT. */
export function clearToolhubSettingsCache(): void {
  cachedSettings = null;
}

/** Check whether code execution via Tools Hub is enabled + configured. */
export async function isToolhubCodeExecutionEnabled(): Promise<boolean> {
  const { settings, apiKey } = await loadSettings();
  return settings.enabled && settings.codeSandboxEnabled && Boolean(apiKey);
}

/** Check whether tutor routing via Tools Hub is enabled + configured. */
export async function isToolhubTutorEnabled(): Promise<boolean> {
  const { settings, apiKey } = await loadSettings();
  return settings.enabled && settings.tutorEnabled && Boolean(apiKey);
}

// ============================================================
// listTools() — GET /api/plugins
// ============================================================

export async function listTools(): Promise<{ tools: ToolhubTool[]; error?: string; rawBody?: string }> {
  const { settings, apiKey } = await loadSettings();
  if (!settings.enabled || !apiKey) {
    return { tools: [], error: "Tools Hub is not enabled or API key is missing." };
  }

  try {
    const res = await fetch(`${settings.baseUrl}/api/plugins`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Hub-Key": apiKey, // send both — Tools Hub accepts either
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { tools: [], error: `Tools Hub returned ${res.status}: ${text.slice(0, 500)}` };
    }
    const text = await res.text().catch(() => "");
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }

    // Tools Hub response shape is unknown — accept ANY of these field names.
    // Different Tools Hub versions/deployments use different shapes.
    const candidates: any[] = [];
    if (Array.isArray(data)) {
      candidates.push(...data);
    } else if (data && typeof data === "object") {
      for (const key of ["tools", "plugins", "data", "results", "items", "list"]) {
        if (Array.isArray(data[key])) {
          candidates.push(...data[key]);
          break;
        }
      }
      // If still nothing, maybe it's a single tool object (not a list).
      // Or maybe the response IS the tool list nested deeper.
      if (candidates.length === 0 && data.id && data.name) {
        candidates.push(data);
      }
    }

    // Normalize: each candidate should have at least an `id` or `name`.
    const tools: ToolhubTool[] = candidates
      .filter((t: any) => t && typeof t === "object" && (t.id || t.name || t.slug))
      .map((t: any) => ({
        id: String(t.id ?? t.slug ?? t.name ?? "unknown"),
        name: String(t.name ?? t.id ?? t.slug ?? "unknown"),
        description: typeof t.description === "string" ? t.description : undefined,
        category: typeof t.category === "string" ? t.category : (typeof t.type === "string" ? t.type : undefined),
        enabled: typeof t.enabled === "boolean" ? t.enabled : undefined,
      }));

    if (tools.length === 0) {
      // Surface the raw body so the admin can see what Tools Hub returned.
      // This makes it possible to debug response-shape mismatches without
      // server logs — the admin UI shows the first 500 chars.
      return {
        tools: [],
        error: `No tools found in response. Raw body (first 500 chars): ${text.slice(0, 500) || "(empty)"}`,
        rawBody: text.slice(0, 1000),
      };
    }
    return { tools };
  } catch (err: any) {
    return { tools: [], error: `Failed to reach Tools Hub: ${err?.message ?? err}` };
  }
}

// ============================================================
// runCode() — POST /api/tools/sandbox
// ============================================================

/**
 * Execute code in the Tools Hub sandbox.
 *
 * Returns { ok: true, stdout, stderr, exitCode } on success, or
 * { ok: false, error } on failure (code error, auth error, network error).
 *
 * The caller (code-sandbox.ts) maps this to the existing CodeResult shape.
 */
export async function runCode(
  language: "python" | "javascript",
  code: string,
): Promise<ToolhubRunCodeResult> {
  const { settings, apiKey } = await loadSettings();
  if (!settings.enabled || !settings.codeSandboxEnabled || !apiKey) {
    return {
      ok: false,
      error: "Tools Hub is not enabled.",
      requestError: "Tools Hub code execution is disabled.",
    };
  }

  // Tools Hub sandbox endpoint expects `language` + `code`.
  // Some Tools Hub deploys use X-Hub-Key, others use Authorization: Bearer.
  // We send BOTH — Tools Hub will accept whichever one it's configured for.
  // (Sending both is safe; the other is just ignored.)
  const body = JSON.stringify({ language, code });

  try {
    const res = await fetch(`${settings.baseUrl}/api/tools/sandbox`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Hub-Key": apiKey,
      },
      body,
      signal: AbortSignal.timeout(30_000), // 30s timeout — matches Vercel function limit
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Tools Hub returned ${res.status}: ${text.slice(0, 500)}`,
        requestError: `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    // Tools Hub sandbox response shape (per the cURL snippet):
    //   { output?: string, stdout?: string, stderr?: string, exitCode?: number, error?: string }
    // Different Tools Hub versions use slightly different field names.
    // Be defensive: accept any of the common shapes.
    const stdout: string =
      typeof data?.stdout === "string" ? data.stdout :
      typeof data?.output === "string" ? data.output :
      "";
    const stderr: string =
      typeof data?.stderr === "string" ? data.stderr :
      typeof data?.error === "string" ? data.error :
      "";
    const exitCode: number | undefined =
      typeof data?.exitCode === "number" ? data.exitCode :
      typeof data?.returncode === "number" ? data.returncode :
      undefined;
    const durationMs: number | undefined =
      typeof data?.durationMs === "number" ? data.durationMs :
      typeof data?.duration === "number" ? data.duration :
      undefined;
    const ok: boolean =
      typeof data?.ok === "boolean" ? data.ok :
      exitCode === 0 || (exitCode === undefined && !stderr);

    return {
      ok,
      stdout,
      stderr,
      exitCode,
      durationMs,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to reach Tools Hub: ${err?.message ?? err}`,
      requestError: err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "Request timed out (Tools Hub took >30s to respond)."
        : `Network error: ${err?.message ?? err}`,
    };
  }
}

// ============================================================
// callTutor() — POST /api/tools/tutor
// ============================================================

/**
 * Call the Tools Hub AI Tutor endpoint.
 *
 * NOTE: This is wired but NOT used by default. The existing tutor pipeline
 * (ZAI SDK, plugin orchestration, etc.) stays intact. The admin can enable
 * this via ToolhubSettings.tutorEnabled if they want to route tutor traffic
 * through Tools Hub (e.g. for A/B testing or fallback).
 */
export async function callTutor(opts: {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  subject?: string;
  level?: string;
}): Promise<ToolhubTutorResult> {
  const { settings, apiKey } = await loadSettings();
  if (!settings.enabled || !settings.tutorEnabled || !apiKey) {
    return {
      ok: false,
      error: "Tools Hub tutor routing is not enabled.",
      requestError: "Disabled.",
    };
  }

  try {
    const res = await fetch(`${settings.baseUrl}/api/tools/tutor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: opts.messages,
        subject: opts.subject,
        level: opts.level,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Tools Hub returned ${res.status}: ${text.slice(0, 500)}`,
        requestError: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    // Tools Hub tutor response shape: { reply?: string, content?: string, message?: {...} }
    const reply: string | undefined =
      typeof data?.reply === "string" ? data.reply :
      typeof data?.content === "string" ? data.content :
      typeof data?.message?.content === "string" ? data.message.content :
      undefined;
    if (!reply) {
      return { ok: false, error: "Tools Hub returned no reply content." };
    }
    return { ok: true, reply };
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to reach Tools Hub: ${err?.message ?? err}`,
      requestError: err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "Request timed out (Tools Hub took >60s to respond)."
        : `Network error: ${err?.message ?? err}`,
    };
  }
}

// ============================================================
// testConnection() — used by the admin "Test connection" button
// ============================================================

/**
 * Test the Tools Hub connection by listing tools.
 * Updates ToolhubSettings.lastTestedAt / lastTestOk / lastTestError.
 * Returns the result so the admin UI can display it immediately.
 */
export async function testConnection(): Promise<{
  ok: boolean;
  error?: string;
  tools?: ToolhubTool[];
  rawBody?: string;
}> {
  // Bypass the cache so we test the CURRENT key, not a stale cached one.
  cachedSettings = null;
  const { tools, error, rawBody } = await listTools();

  // Persist the test result (best-effort — don't block on DB write).
  try {
    await db.toolhubSettings.update({
      where: { id: 1 },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: tools.length > 0,
        lastTestError: error ?? null,
      },
    }).catch(() => null);
    clearToolhubSettingsCache();
  } catch {}

  if (tools.length > 0) {
    return { ok: true, tools };
  }
  return { ok: false, error: error ?? "No tools returned.", rawBody };
}
