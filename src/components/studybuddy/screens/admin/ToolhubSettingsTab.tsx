"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Check, Zap, Settings, Server, KeyRound, TestTube } from "lucide-react";
import { Field, Spinner } from "./shared";

/**
 * ToolhubSettingsTab — admin controls for the external Tools Hub integration.
 *
 * Tools Hub is an external service that provides:
 *   - Sandboxed code execution (Python + JavaScript) — runs on Tools Hub
 *     infrastructure, NOT on Study Buddy's server. This is the escape hatch
 *     for the Phase 0 security containment (local code execution kill switch).
 *   - AI Tutor endpoint (optional — not used by default).
 *
 * When Tools Hub is enabled + code sandbox is on, code-sandbox.ts routes
 * runCode() calls to Tools Hub instead of returning `unsupported`. The
 * local Phase 0 kill switch stays ON — no code runs on Study Buddy's server.
 *
 * When Tools Hub is disabled, behavior is unchanged (AI explains code but
 * doesn't run it).
 */
export function ToolhubSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://toolhub.space-z.ai");
  const [codeSandboxEnabled, setCodeSandboxEnabled] = useState(true);
  const [tutorEnabled, setTutorEnabled] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastTestOk, setLastTestOk] = useState<boolean | null>(null);
  const [lastTestError, setLastTestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/toolhub-settings");
      if (!r.ok) throw new Error("Failed to load");
      const d = await r.json();
      setEnabled(d.enabled ?? false);
      setHasApiKey(Boolean(d.hasApiKey));
      setApiKeyMasked(d.apiKeyMasked ?? null);
      setBaseUrl(d.baseUrl ?? "https://toolhub.space-z.ai");
      setCodeSandboxEnabled(d.codeSandboxEnabled ?? true);
      setTutorEnabled(d.tutorEnabled ?? false);
      setLastTestedAt(d.lastTestedAt ?? null);
      setLastTestOk(d.lastTestOk ?? null);
      setLastTestError(d.lastTestError ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: any = {
        enabled,
        baseUrl,
        codeSandboxEnabled,
        tutorEnabled,
      };
      // Only update the key if admin typed a new one
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      const r = await fetch("/api/admin/toolhub-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setSuccess("Settings saved ✓");
      setApiKey("");
      await load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/admin/toolhub-settings", { method: "POST" });
      const d = await r.json();
      setTestResult(d);
      // Reload to pick up lastTestedAt/lastTestOk/lastTestError updates
      await load();
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message ?? "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Server className="w-5 h-5 text-indigo-600" />
          Tools Hub Integration
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          External service for sandboxed code execution. When enabled, learners can run Python + JavaScript in the workspace — code executes on Tools Hub infrastructure, never on Study Buddy's server.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Master enable toggle */}
      <div className={`rounded-2xl border-2 p-4 ${enabled ? "border-indigo-300 bg-indigo-50/40" : "border-gray-200 bg-gray-50/40"}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Enable Tools Hub</span>
              {enabled ? (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Disabled</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, code execution routes to Tools Hub. When disabled, learners see "code execution not available" (current behavior).
            </p>
          </div>
        </label>
      </div>

      {/* API key */}
      <Field label="Tools Hub API Key" hint="Get this from your Tools Hub dashboard. Stored encrypted — never sent to the browser.">
        <div className="space-y-2">
          {hasApiKey && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-mono text-emerald-700">{apiKeyMasked}</span>
              <span className="text-[10px] text-emerald-500 ml-auto">saved ✓</span>
            </div>
          )}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? "Enter new key to replace" : "sbth_..."}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>
      </Field>

      {/* Base URL */}
      <Field label="Base URL" hint="The Tools Hub instance URL. Change this to point at a staging/self-hosted instance.">
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://toolhub.space-z.ai"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        />
      </Field>

      {/* Per-tool toggles */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase text-gray-500">Tool scopes</div>
        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={codeSandboxEnabled}
            onChange={(e) => setCodeSandboxEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-900">Code Sandbox</div>
            <p className="text-xs text-gray-500">Run Python + JavaScript in the Tools Hub sandbox. This is what enables "Run" buttons in the workspace.</p>
          </div>
        </label>
        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={tutorEnabled}
            onChange={(e) => setTutorEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-900">AI Tutor routing</div>
            <p className="text-xs text-gray-500">Route tutor chat through Tools Hub instead of the built-in ZAI pipeline. Off by default — only enable if you want to A/B test.</p>
          </div>
        </label>
      </div>

      {/* Test connection */}
      <div className="rounded-xl border border-gray-200 p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold text-gray-900">Connection test</div>
            <p className="text-xs text-gray-500">Verifies the API key is valid + Tools Hub is reachable.</p>
          </div>
          <button
            onClick={testConn}
            disabled={testing || !enabled || !hasApiKey}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 hover:bg-indigo-700 transition"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
            Test connection
          </button>
        </div>

        {/* Last test result */}
        {lastTestedAt && (
          <div className={`text-xs p-2 rounded-lg ${lastTestOk ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            <div className="flex items-center gap-1.5">
              {lastTestOk ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              <span className="font-semibold">{lastTestOk ? "Connection OK" : "Connection failed"}</span>
              <span className="opacity-60">· {new Date(lastTestedAt).toLocaleString()}</span>
            </div>
            {lastTestError && <p className="mt-1 font-mono text-[11px] break-all">{lastTestError}</p>}
          </div>
        )}

        {/* Live test result (most recent) */}
        {testResult && (
          <div className={`text-xs p-2 rounded-lg mt-2 ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {testResult.ok ? (
              <div>
                <div className="flex items-center gap-1.5 font-semibold">
                  <Check className="w-3 h-3" /> Connected — {testResult.tools?.length ?? 0} tools available
                </div>
                {testResult.tools && testResult.tools.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {testResult.tools.slice(0, 8).map((t: any, i: number) => (
                      <li key={i} className="text-[11px] flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-emerald-500" />
                        <span className="font-semibold">{t.id || t.name}</span>
                        {t.description && <span className="opacity-60 truncate">— {t.description}</span>}
                      </li>
                    ))}
                    {testResult.tools.length > 8 && (
                      <li className="text-[11px] opacity-60">+ {testResult.tools.length - 8} more</li>
                    )}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                <span className="font-semibold">Failed:</span>
                <span className="font-mono break-all">{testResult.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-indigo-700 transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Save settings
        </button>
      </div>

      {/* Architecture note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <div className="flex items-start gap-2">
          <Settings className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900 space-y-1">
            <p className="font-bold">How this works</p>
            <p>• Learner writes Python/JS in the workspace → clicks "Run"</p>
            <p>• Frontend calls <code className="font-mono bg-blue-100 px-1 rounded">/api/tools/sandbox</code></p>
            <p>• Backend checks: Tools Hub enabled? Key set? Code sandbox on?</p>
            <p>• If yes → routes to <code className="font-mono bg-blue-100 px-1 rounded">{baseUrl}/api/tools/sandbox</code></p>
            <p>• If no → returns "code execution not available" (current behavior)</p>
            <p className="mt-2 pt-2 border-t border-blue-200">
              <span className="font-bold">Security:</span> The local Phase 0 kill switch stays ON. No code runs on Study Buddy's server — it runs on Tools Hub infrastructure which you control separately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
