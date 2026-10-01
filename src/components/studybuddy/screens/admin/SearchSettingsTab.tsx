"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Search, Check, Zap, Image as ImageIcon, Video, Youtube, TestTube, Settings } from "lucide-react";
import { Field, Spinner } from "./shared";

export function SearchSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  // Form state
  const [youtubeKey, setYoutubeKey] = useState("");
  const [youtubeKeyMasked, setYoutubeKeyMasked] = useState<string | null>(null);
  const [hasYoutubeKey, setHasYoutubeKey] = useState(false);
  const [pollinationsUrl, setPollinationsUrl] = useState("https://image.pollinations.ai/prompt/");
  const [imageEnabled, setImageEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [imageTokenCost, setImageTokenCost] = useState(10);
  const [videoTokenCost, setVideoTokenCost] = useState(50);
  const [freeDailyImageLimit, setFreeDailyImageLimit] = useState(5);
  const [freeDailyVideoLimit, setFreeDailyVideoLimit] = useState(3);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/search-settings");
      if (!r.ok) throw new Error("Failed to load");
      const d = await r.json();
      setHasYoutubeKey(Boolean(d.hasYoutubeKey));
      setYoutubeKeyMasked(d.youtubeKeyMasked ?? null);
      setPollinationsUrl(d.pollinationsBaseUrl ?? "https://image.pollinations.ai/prompt/");
      setImageEnabled(d.imageSearchEnabled ?? true);
      setVideoEnabled(d.videoSearchEnabled ?? true);
      setImageTokenCost(d.imageTokenCost ?? 10);
      setVideoTokenCost(d.videoTokenCost ?? 50);
      setFreeDailyImageLimit(d.freeDailyImageLimit ?? 5);
      setFreeDailyVideoLimit(d.freeDailyVideoLimit ?? 3);
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
        pollinationsBaseUrl: pollinationsUrl,
        imageSearchEnabled: imageEnabled,
        videoSearchEnabled: videoEnabled,
        imageTokenCost: Number(imageTokenCost),
        videoTokenCost: Number(videoTokenCost),
        freeDailyImageLimit: Number(freeDailyImageLimit),
        freeDailyVideoLimit: Number(freeDailyVideoLimit),
      };
      // Only update the key if admin typed a new one
      if (youtubeKey.trim()) body.youtubeApiKey = youtubeKey.trim();

      const r = await fetch("/api/admin/search-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setSuccess("Settings saved ✓");
      setYoutubeKey("");
      await load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const testKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/admin/search-settings/test", { method: "POST" });
      const d = await r.json();
      setTestResult(d);
    } catch (e: any) {
      setTestResult({ status: "error", error: e?.message ?? "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <Spinner label="Loading search settings…" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 p-4">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-gray-900">Search Settings</h2>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Configure multimodal search — AI image generation (Pollinations) and YouTube video search.
          The YouTube Data API key is encrypted at rest with AES-256-CBC.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}

      {/* YouTube API key */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Youtube className="w-4 h-4 text-rose-600" /> YouTube Data API v3 Key
        </h3>
        <p className="text-[11px] text-gray-500">
          Get a key from{" "}
          <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer"
             className="text-indigo-600 underline">
            Google Cloud Console → YouTube Data API v3
          </a>. Enable the API, create an API key, paste it below.
        </p>
        {hasYoutubeKey && youtubeKeyMasked && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs">
            <span className="text-emerald-700 font-semibold">Current key:</span>{" "}
            <code className="text-emerald-900 font-mono">{youtubeKeyMasked}</code>
          </div>
        )}
        <Field label="New YouTube API key (leave blank to keep current)">
          <input
            type="password"
            value={youtubeKey}
            onChange={(e) => setYoutubeKey(e.target.value)}
            placeholder="AIza…"
            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </Field>
        <div className="flex gap-2">
          <button
            onClick={testKey}
            disabled={testing || !hasYoutubeKey}
            className="flex-1 h-10 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            {testing ? "Testing…" : "Test Key"}
          </button>
        </div>
        {testResult && (
          <div className={`rounded-xl p-2.5 text-xs ${
            testResult.status === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-rose-50 border border-rose-200 text-rose-700"
          }`}>
            {testResult.status === "success"
              ? `✓ ${testResult.message} (${testResult.results} result(s) returned)`
              : `✗ ${testResult.error ?? "Test failed"}`}
          </div>
        )}
      </div>

      {/* Pollinations URL */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 text-indigo-600" /> Pollinations Image URL
        </h3>
        <Field label="Base URL (Pollinations-compatible)">
          <input
            type="text"
            value={pollinationsUrl}
            onChange={(e) => setPollinationsUrl(e.target.value)}
            placeholder="https://image.pollinations.ai/prompt/"
            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </Field>
        <p className="text-[11px] text-gray-500">
          Default: <code className="font-mono text-gray-700">https://image.pollinations.ai/prompt/</code>.
          The endpoint should accept <code className="font-mono">/&lt;prompt&gt;?width=&amp;height=&amp;seed=&amp;nologo=true</code>.
        </p>
      </div>

      {/* Feature toggles */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Feature Toggles</h3>
        <label className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 cursor-pointer">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Image Search</p>
              <p className="text-[10px] text-gray-500">Allow users to generate AI images</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={imageEnabled}
            onChange={(e) => setImageEnabled(e.target.checked)}
            className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
          />
        </label>
        <label className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 cursor-pointer">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-rose-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Video Search</p>
              <p className="text-[10px] text-gray-500">Allow users to search YouTube videos</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={videoEnabled}
            onChange={(e) => setVideoEnabled(e.target.checked)}
            className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
          />
        </label>
      </div>

      {/* Token costs + daily limits */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-500" /> Token Costs & Free Daily Limits
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Image cost (tokens)">
            <input
              type="number"
              min={0}
              value={imageTokenCost}
              onChange={(e) => setImageTokenCost(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </Field>
          <Field label="Video cost (tokens)">
            <input
              type="number"
              min={0}
              value={videoTokenCost}
              onChange={(e) => setVideoTokenCost(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </Field>
          <Field label="Free daily image limit">
            <input
              type="number"
              min={0}
              value={freeDailyImageLimit}
              onChange={(e) => setFreeDailyImageLimit(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </Field>
          <Field label="Free daily video limit">
            <input
              type="number"
              min={0}
              value={freeDailyVideoLimit}
              onChange={(e) => setFreeDailyVideoLimit(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </Field>
        </div>
        <p className="text-[11px] text-gray-500">
          Premium users have no daily limits. Token costs are multiplied by the user&apos;s selected model multiplier.
        </p>
      </div>

      {/* Save button */}
      <button
        onClick={save}
        disabled={saving}
        className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}


