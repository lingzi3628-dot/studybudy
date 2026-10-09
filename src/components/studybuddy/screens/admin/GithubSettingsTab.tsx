"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Check, Github, Zap } from "lucide-react";
import { Field, Spinner } from "./shared";

export function GithubSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [allowedOrgs, setAllowedOrgs] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/github-settings");
      if (!r.ok) throw new Error("Failed to load");
      const d = await r.json();
      setEnabled(d.enabled ?? false);
      setClientId(d.clientId ?? "");
      setHasSecret(Boolean(d.hasClientSecret));
      setAllowedOrgs(d.allowedOrgs ?? "");
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
      const body: any = { enabled, clientId, allowedOrgs };
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
      const r = await fetch("/api/admin/github-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setSuccess("Settings saved ✓");
      setClientSecret("");
      await load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Github className="w-5 h-5 text-gray-900" />
          GitHub Integration
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Connect Study Buddy to GitHub so users can fork projects to their repos, clone repos into the workspace, and push code back.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Master toggle */}
      <div className={`rounded-2xl border-2 p-4 ${enabled ? "border-gray-800 bg-gray-50/40" : "border-gray-200 bg-gray-50/40"}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-gray-800 focus:ring-gray-800" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Enable GitHub Integration</span>
              {enabled ? (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Disabled</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, users can connect their GitHub account, fork projects to real repos, and clone repos into the workspace.
            </p>
          </div>
        </label>
      </div>

      {/* OAuth credentials */}
      <Field label="GitHub OAuth Client ID" hint="Create at https://github.com/settings/developers → OAuth Apps → New OAuth App">
        <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)}
          placeholder="Iv1.1234567890abcdef"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 font-mono" />
      </Field>

      <Field label="GitHub OAuth Client Secret" hint={hasSecret ? "Secret is saved. Enter a new one to replace." : "From your GitHub OAuth App settings"}>
        <div className="space-y-2">
          {hasSecret && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-mono text-emerald-700">Secret saved ✓</span>
            </div>
          )}
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
            placeholder={hasSecret ? "Enter new secret to replace" : "••••••••••••••••••••••••"}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 font-mono" />
        </div>
      </Field>

      <Field label="Allowed Organizations (optional)" hint="Comma-separated GitHub org names. Leave empty to allow all users.">
        <input type="text" value={allowedOrgs} onChange={(e) => setAllowedOrgs(e.target.value)}
          placeholder="e.g. my-school, studybuddy-org"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800" />
      </Field>

      {/* Save */}
      <button onClick={save} disabled={saving}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-900 text-white text-sm font-bold disabled:opacity-50 hover:bg-gray-800 transition">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        Save settings
      </button>

      {/* Instructions */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <div className="text-xs text-blue-900 space-y-1">
          <p className="font-bold">Setup instructions:</p>
          <p>1. Go to <a href="https://github.com/settings/developers" target="_blank" rel="noopener" className="text-blue-600 underline">github.com/settings/developers</a></p>
          <p>2. Click "New OAuth App"</p>
          <p>3. Set Homepage URL to your Study Buddy URL</p>
          <p>4. Set Authorization callback URL to: <code className="font-mono bg-blue-100 px-1 rounded">https://your-app.com/github/callback</code></p>
          <p>5. Copy the Client ID + generate a Client Secret</p>
          <p>6. Paste them above → Save</p>
          <p>7. Users will see a "Connect GitHub" button in their profile</p>
        </div>
      </div>
    </div>
  );
}
