"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  RefreshCw,
  Bot,
  Zap,
  Key,
} from "lucide-react";

type Diagnosis = {
  timestamp: string;
  providers: Array<{
    id: string;
    name: string;
    providerType: string;
    enabled: boolean;
    isDefault: boolean;
    priority: number;
    model: string | null;
    baseUrl: string | null;
    keyStatus: string;
    keyPrefix: string | null;
  }>;
  enabledProviderCount: number;
  enabledProviders: Array<{ name: string; type: string; model: string | null }>;
  zaiPlatform: {
    envBaseUrl: string;
    envApiKey: string;
    clientStatus: string;
    error?: string;
  };
  recentErrors: Array<{
    providerType: string;
    model: string | null;
    errorMessage: string;
    route: string | null;
    createdAt: string;
  }>;
  summary: {
    totalProviders: number;
    enabledProviders: number;
    workingProviders: number;
    zaiConfigured: boolean;
  };
  recommendation: string;
};

export function AiDiagnosticsTab() {
  const [data, setData] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/providers/diagnose");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyToClipboard = () => {
    if (!data) return;
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const statusColor = (status: string) => {
    switch (status) {
      case "ok": return "text-emerald-600 bg-emerald-50";
      case "keyless_ok": return "text-blue-600 bg-blue-50";
      case "decryption_failed": return "text-rose-600 bg-rose-50";
      case "missing": return "text-amber-600 bg-amber-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "ok": return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case "keyless_ok": return <CheckCircle2 className="w-4 h-4 text-blue-600" />;
      case "decryption_failed": return <XCircle className="w-4 h-4 text-rose-600" />;
      case "missing": return <AlertCircle className="w-4 h-4 text-amber-600" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const httpStatusColor = (msg: string) => {
    if (msg.includes("429")) return "text-amber-600 bg-amber-50";
    if (msg.includes("402")) return "text-rose-600 bg-rose-50";
    if (msg.includes("401")) return "text-rose-600 bg-rose-50";
    if (msg.includes("not configured") || msg.includes("Z-AI")) return "text-purple-600 bg-purple-50";
    return "text-gray-600 bg-gray-50";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            AI Diagnostics
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Live status of all AI providers + recent errors. Copy the JSON to paste in chat for support.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyToClipboard}
            className="h-8 px-3 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold flex items-center gap-1 hover:bg-gray-200"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <button
            onClick={load}
            className="h-8 px-3 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-indigo-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className={`p-4 rounded-xl border ${
        data.summary.workingProviders > 0
          ? "bg-emerald-50 border-emerald-200"
          : "bg-rose-50 border-rose-200"
      }`}>
        <div className="flex items-center gap-2 mb-2">
          {data.summary.workingProviders > 0
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            : <XCircle className="w-5 h-5 text-rose-600" />
          }
          <p className="text-sm font-semibold text-gray-900">
            {data.recommendation}
          </p>
        </div>
        <div className="flex gap-4 text-xs text-gray-600">
          <span>📊 {data.summary.totalProviders} total providers</span>
          <span>✅ {data.summary.workingProviders} working</span>
          <span>🔑 Z-AI fallback: {data.summary.zaiConfigured ? "✅ configured" : "❌ NOT SET"}</span>
        </div>
      </div>

      {/* Provider cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Bot className="w-4 h-4" /> Providers
        </h3>
        <div className="space-y-2">
          {data.providers.map((p) => (
            <div key={p.id} className="p-3 rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{p.providerType}</span>
                  {p.isDefault && (
                    <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Default</span>
                  )}
                  {!p.enabled && (
                    <span className="text-[9px] font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">Disabled</span>
                  )}
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${statusColor(p.keyStatus)}`}>
                  {statusIcon(p.keyStatus)}
                  {p.keyStatus}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                <span>Model: {p.model ?? "—"}</span>
                {p.keyPrefix && <span className="font-mono">Key: {p.keyPrefix}</span>}
              </div>
              {p.keyStatus === "decryption_failed" && (
                <div className="mt-2 p-2 rounded-lg bg-rose-50 text-[11px] text-rose-700">
                  ⚠️ API key can't be decrypted (the API_KEY_ENCRYPTION_SECRET changed).
                  Click "Edit" on this provider in the AI Providers tab → paste the key → Save.
                </div>
              )}
            </div>
          ))}
          {data.providers.length === 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs text-center">
              No providers configured. Go to AI Providers → Add Provider.
            </div>
          )}
        </div>
      </div>

      {/* Z-AI Platform fallback */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Zap className="w-4 h-4" /> Z-AI Platform Fallback (Free Study Buddy)
        </h3>
        <div className={`p-3 rounded-xl border ${
          data.zaiPlatform.clientStatus === "ok"
            ? "bg-emerald-50 border-emerald-200"
            : "bg-rose-50 border-rose-200"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {data.zaiPlatform.clientStatus === "ok"
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                : <XCircle className="w-4 h-4 text-rose-600" />
              }
              <span className="text-sm font-medium">
                {data.zaiPlatform.clientStatus === "ok" ? "Configured ✓" : "NOT CONFIGURED"}
              </span>
            </div>
            <div className="flex gap-3 text-[11px] text-gray-500">
              <span>ZAI_BASE_URL: {data.zaiPlatform.envBaseUrl}</span>
              <span>ZAI_API_KEY: {data.zaiPlatform.envApiKey}</span>
            </div>
          </div>
          {data.zaiPlatform.clientStatus !== "ok" && (
            <div className="mt-2 p-2 rounded-lg bg-rose-100 text-[11px] text-rose-700">
              Set these env vars in Vercel → Settings → Environment Variables:
              <br />
              <code className="text-rose-900">ZAI_BASE_URL=https://api.z.ai/api/paas/v4</code>
              <br />
              <code className="text-rose-900">ZAI_API_KEY=your-z-ai-api-key</code>
              <br />
              Without these, the free Study Buddy model won't work for users who haven't selected a custom buddy.
            </div>
          )}
          {data.zaiPlatform.error && (
            <div className="mt-2 p-2 rounded-lg bg-rose-100 text-[11px] text-rose-600 font-mono break-all">
              {data.zaiPlatform.error}
            </div>
          )}
        </div>
      </div>

      {/* Recent errors */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" /> Recent AI Errors (last 10)
        </h3>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {data.recentErrors.length === 0 ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs text-center">
              ✅ No recent errors! All providers working.
            </div>
          ) : (
            data.recentErrors.map((err, i) => (
              <div key={i} className="p-2 rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${httpStatusColor(err.errorMessage)}`}>
                      {err.providerType}
                    </span>
                    <span className="text-[10px] text-gray-400">{err.model ?? "—"}</span>
                    <span className="text-[10px] text-gray-400">{err.route ?? "—"}</span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(err.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 mt-1 break-all font-mono">
                  {err.errorMessage.slice(0, 200)}
                  {err.errorMessage.length > 200 ? "…" : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Copy full JSON */}
      <div>
        <details className="group">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <Key className="w-3 h-3" />
            Show full JSON (paste in chat for support)
          </summary>
          <pre className="mt-2 p-3 rounded-xl bg-gray-900 text-gray-100 text-[10px] overflow-x-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
