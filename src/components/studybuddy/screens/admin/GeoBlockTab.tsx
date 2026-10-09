"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Check, Globe, ShieldAlert, Link as LinkIcon, Plus, X, Copy } from "lucide-react";
import { Field, Spinner } from "./shared";

/**
 * GeoBlockTab — admin controls for geo-blocking (IP blocker).
 *
 * When enabled, only visitors from allowed countries (default: Kenya) can
 * access the site. Visitors from other countries are redirected to /blocked.
 *
 * Admin can:
 *   - Toggle geo-blocking on/off
 *   - Add/remove allowed countries (ISO 3166-1 alpha-2 codes)
 *   - Customize the block message
 *   - Generate proxy tokens (links that bypass the block for specific users)
 *   - Revoke proxy tokens
 */
export function GeoBlockTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [allowedCountries, setAllowedCountries] = useState<string[]>(["KE"]);
  const [newCountry, setNewCountry] = useState("");
  const [blockTitle, setBlockTitle] = useState("Access Restricted");
  const [blockMessage, setBlockMessage] = useState("This service is currently only available in Kenya. If you believe this is an error, please contact support.");
  const [proxyTokens, setProxyTokens] = useState<any[]>([]);
  const [newProxyLabel, setNewProxyLabel] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/geo-block");
      if (!r.ok) throw new Error("Failed to load");
      const d = await r.json();
      setEnabled(d.enabled ?? false);
      setAllowedCountries(d.allowedCountries ?? ["KE"]);
      setBlockTitle(d.blockTitle ?? "Access Restricted");
      setBlockMessage(d.blockMessage ?? "");
      setProxyTokens(d.proxyTokens ?? []);
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
      const r = await fetch("/api/admin/geo-block", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, allowedCountries, blockTitle, blockMessage }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setSuccess("Settings saved ✓. Note: you must also set GEO_BLOCK_ENABLED=true and GEO_ALLOWED_COUNTRIES=KE in Vercel env vars for the middleware to pick up changes.");
      setTimeout(() => setSuccess(null), 8000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createProxy = async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/geo-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-proxy", label: newProxyLabel }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setProxyTokens([...proxyTokens, { token: d.token, label: d.label || newProxyLabel, createdAt: new Date().toISOString(), proxyUrl: d.proxyUrl }]);
      setNewProxyLabel("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create proxy");
    }
  };

  const revokeProxy = async (token: string) => {
    try {
      await fetch("/api/admin/geo-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke-proxy", token }),
      });
      setProxyTokens(proxyTokens.filter((t) => t.token !== token));
    } catch {}
  };

  const copyProxyUrl = (url: string, token: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (loading) return <Spinner />;

  // Country name mapping for common codes
  const COUNTRY_NAMES: Record<string, string> = {
    KE: "Kenya", UG: "Uganda", TZ: "Tanzania", NG: "Nigeria", GH: "Ghana",
    ZA: "South Africa", RW: "Rwanda", ET: "Ethiopia", EG: "Egypt",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          Geo-Blocking (IP Blocker)
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Restrict access to the site by country. Only visitors from allowed countries can access. Others get redirected to a block page.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <Check className="w-4 h-4 flex-shrink-0 mt-0.5" /> {success}
        </div>
      )}

      {/* Master toggle */}
      <div className={`rounded-2xl border-2 p-4 ${enabled ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-gray-50/40"}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Enable Geo-Blocking</span>
              {enabled ? (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Active</span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Disabled</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, only visitors from allowed countries can access the site. Others get redirected to /blocked.
            </p>
          </div>
        </label>
      </div>

      {/* Allowed countries */}
      <Field label="Allowed Countries" hint="ISO 3166-1 alpha-2 codes (e.g. KE, UG, TZ). Visitors from countries NOT in this list will be blocked.">
        <div className="flex flex-wrap gap-2 mb-2">
          {allowedCountries.map((code) => (
            <span key={code} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
              <Globe className="w-3 h-3" />
              {code} — {COUNTRY_NAMES[code] || "Unknown"}
              <button onClick={() => setAllowedCountries(allowedCountries.filter((c) => c !== code))}
                className="text-emerald-400 hover:text-red-500 ml-0.5" title="Remove">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {allowedCountries.length === 0 && (
            <span className="text-xs text-gray-400 italic">No countries — all access blocked!</span>
          )}
        </div>
        <div className="flex gap-2">
          <input type="text" value={newCountry} onChange={(e) => setNewCountry(e.target.value.toUpperCase())}
            placeholder="e.g. UG" maxLength={2}
            className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <button onClick={() => {
            if (newCountry.trim() && !allowedCountries.includes(newCountry.trim().toUpperCase())) {
              setAllowedCountries([...allowedCountries, newCountry.trim().toUpperCase()]);
              setNewCountry("");
            }
          }} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700">
            <Plus className="w-3 h-3 inline mr-1" /> Add
          </button>
        </div>
      </Field>

      {/* Block message */}
      <Field label="Block Page Title" hint="Shown to visitors who are blocked.">
        <input type="text" value={blockTitle} onChange={(e) => setBlockTitle(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </Field>
      <Field label="Block Page Message" hint="The message shown to blocked visitors.">
        <textarea value={blockMessage} onChange={(e) => setBlockMessage(e.target.value)} rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </Field>

      {/* Save button */}
      <button onClick={save} disabled={saving}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-amber-700 transition">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
        Save settings
      </button>

      {/* Proxy tokens */}
      <div className="rounded-xl border border-gray-200 p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <LinkIcon className="w-4 h-4 text-indigo-500" /> Proxy Access Links
            </div>
            <p className="text-xs text-gray-500">Generate bypass links for users in blocked countries.</p>
          </div>
        </div>

        {/* Create new proxy */}
        <div className="flex gap-2 mb-3">
          <input type="text" value={newProxyLabel} onChange={(e) => setNewProxyLabel(e.target.value)}
            placeholder="e.g. Ghana student — John Doe" className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={createProxy} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Generate
          </button>
        </div>

        {/* List of proxy tokens */}
        {proxyTokens.length > 0 && (
          <div className="space-y-2">
            {proxyTokens.map((t, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-700">{t.label || "Proxy access"}</div>
                  <div className="text-[10px] font-mono text-gray-400 truncate">
                    {t.proxyUrl || `?proxy=${t.token}`}
                  </div>
                </div>
                <button
                  onClick={() => copyProxyUrl(t.proxyUrl || `?proxy=${t.token}`, t.token)}
                  className="text-gray-400 hover:text-indigo-600 p-1" title="Copy link">
                  {copiedToken === t.token ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => revokeProxy(t.token)} className="text-red-400 hover:text-red-600 p-1" title="Revoke">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {proxyTokens.length === 0 && (
          <p className="text-xs text-gray-400 italic text-center py-2">No proxy links generated yet.</p>
        )}
      </div>

      {/* Architecture note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <div className="text-xs text-blue-900 space-y-1">
          <p className="font-bold">How this works:</p>
          <p>• Vercel provides the visitor's country via the <code className="font-mono bg-blue-100 px-1 rounded">x-vercel-ip-country</code> header</p>
          <p>• Middleware checks this header against the allowed countries list</p>
          <p>• Blocked visitors → redirected to <code className="font-mono bg-blue-100 px-1 rounded">/blocked</code></p>
          <p>• Proxy links set a cookie that bypasses the check for that session</p>
          <p className="mt-2 pt-2 border-t border-blue-200 font-bold">⚠️ Important:</p>
          <p>To activate geo-blocking, set these env vars in Vercel Settings → Environment Variables:</p>
          <p><code className="font-mono bg-blue-100 px-1 rounded">GEO_BLOCK_ENABLED</code> = true</p>
          <p><code className="font-mono bg-blue-100 px-1 rounded">GEO_ALLOWED_COUNTRIES</code> = KE</p>
        </div>
      </div>
    </div>
  );
}
