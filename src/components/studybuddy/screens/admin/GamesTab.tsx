"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2, AlertCircle, Trash2, Star, UploadCloud, FileArchive,
  CheckCircle2, Gamepad2, Eye, EyeOff, Power, RefreshCw,
} from "lucide-react";

type Game = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  thumbnailUrl: string | null;
  gameUrl: string;
  fileSize: number;
  version: string;
  isFeatured: boolean;
  isActive: boolean;
  playCount: number;
  rating: number;
  minStudyMinutes: number;
  playTimeMinutes: number;
  createdAt: string;
  updatedAt: string;
};

const CATEGORIES = ["Arcade", "Puzzle", "Strategy", "Racing", "Adventure", "Educational", "Sports"];

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function GamesTab() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Arcade");
  const [isFeatured, setIsFeatured] = useState(false);
  const [minStudy, setMinStudy] = useState(30);
  const [playTime, setPlayTime] = useState(10);
  const [entryFile, setEntryFile] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/games");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setGames(d.games || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load games");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  // Auto-fill title from filename
  useEffect(() => {
    if (file && !title) {
      const name = file.name.replace(/\.zip$/i, "").replace(/[-_]/g, " ");
      setTitle(name.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }, [file, title]);

  // Clear success/error after delay
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const handleFileSelect = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setError("Please select a .zip file");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("File too large (max 4MB)");
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const onUpload = async () => {
    if (!file) {
      setError("Pick a zip file first");
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      if (description) fd.append("description", description.trim());
      fd.append("category", category);
      fd.append("isFeatured", String(isFeatured));
      fd.append("minStudyMinutes", String(minStudy));
      fd.append("playTimeMinutes", String(playTime));
      if (entryFile.trim()) fd.append("entryFile", entryFile.trim());

      // Use XHR for progress reporting
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/games/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      const responseText: string = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
          else reject(new Error(`Upload failed: HTTP ${xhr.status} — ${xhr.responseText.slice(0, 200)}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(fd);
      });

      const data = JSON.parse(responseText);
      setSuccess(`✓ "${data.game.title}" uploaded and is now live in the Game Hub!`);
      // Reset form
      setFile(null);
      setTitle("");
      setDescription("");
      setCategory("Arcade");
      setIsFeatured(false);
      setMinStudy(30);
      setPlayTime(10);
      setEntryFile("");
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadGames();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleFeatured = async (g: Game) => {
    try {
      await fetch("/api/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: g.id, action: g.isFeatured ? "unfeature" : "feature" }),
      });
      await loadGames();
    } catch {
      setError("Failed to toggle featured");
    }
  };

  const toggleActive = async (g: Game) => {
    try {
      await fetch("/api/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: g.id, action: g.isActive ? "deactivate" : "activate" }),
      });
      await loadGames();
    } catch {
      setError("Failed to toggle active");
    }
  };

  const removeGame = async (g: Game) => {
    if (!confirm(`Delete "${g.title}"? This removes the Game record AND deletes the extracted files from /public/games/${slugify(g.title)}/. This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/admin/games/${g.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSuccess(`"${g.title}" deleted.`);
      await loadGames();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-indigo-600" /> Games Hub Manager
        </h2>
        <button
          onClick={loadGames}
          className="px-3 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Upload card */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-indigo-600" /> Upload New Game (ZIP)
        </h3>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
            dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            className="hidden"
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileArchive className="w-10 h-10 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <UploadCloud className="w-10 h-10 text-gray-300" />
              <p className="text-sm font-semibold text-gray-700">Drop your game ZIP here</p>
              <p className="text-xs text-gray-500">or click to browse — max 4MB</p>
            </div>
          )}
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Uploading & extracting…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Metadata form */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Awesome Game"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description shown to players"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Min study minutes (unlock)</label>
            <input
              type="number"
              min={0}
              max={300}
              value={minStudy}
              onChange={(e) => setMinStudy(Number(e.target.value))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Play time granted (min)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={playTime}
              onChange={(e) => setPlayTime(Number(e.target.value))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              Entry file (optional) — relative path inside ZIP, e.g. <code>index.html</code>
            </label>
            <input
              type="text"
              value={entryFile}
              onChange={(e) => setEntryFile(e.target.value)}
              placeholder="Auto-detected if left blank (looks for index.html)"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400 font-mono"
            />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-600"
            />
            <span className="text-sm text-gray-700">Show as Featured game in the hub</span>
          </label>
        </div>

        <button
          onClick={onUpload}
          disabled={!file || uploading || !title.trim()}
          className="mt-4 w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading ? "Uploading…" : "Upload & Publish Game"}
        </button>
      </div>

      {/* Existing games list */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Existing Games ({games.length})
        </h3>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        )}

        {!loading && games.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Gamepad2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No games yet. Upload your first game above.</p>
            <p className="text-xs mt-1">Or call <code className="bg-gray-100 px-1 rounded">POST /api/games/seed</code> to add the starter games.</p>
          </div>
        )}

        {!loading && games.length > 0 && (
          <div className="space-y-2">
            {games.map((g) => (
              <div
                key={g.id}
                className={`rounded-xl border p-3 flex items-center gap-3 ${g.isActive ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-60"}`}
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {g.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.thumbnailUrl} alt={g.title} className="w-full h-full object-cover" />
                  ) : (
                    <Gamepad2 className="w-6 h-6 text-gray-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{g.title}</p>
                    {g.isFeatured && (
                      <span className="flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                        <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> FEATURED
                      </span>
                    )}
                    {!g.isActive && (
                      <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-bold">HIDDEN</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{g.description || "—"}</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-0.5">
                    <span>{g.category}</span>
                    <span>{g.playCount} plays</span>
                    <span>{formatBytes(g.fileSize)}</span>
                    <span className="truncate">{g.gameUrl}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleFeatured(g)}
                    title={g.isFeatured ? "Unfeature" : "Feature"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${g.isFeatured ? "text-amber-600 hover:bg-amber-50" : "text-gray-400 hover:bg-gray-100"}`}
                  >
                    <Star className={`w-4 h-4 ${g.isFeatured ? "fill-amber-500" : ""}`} />
                  </button>
                  <button
                    onClick={() => toggleActive(g)}
                    title={g.isActive ? "Hide from users" : "Show to users"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${g.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-100"}`}
                  >
                    {g.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <a
                    href={g.gameUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Preview game"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
                  >
                    <Power className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => removeGame(g)}
                    title="Delete game"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-700">
        <p className="font-semibold mb-1">How it works</p>
        <ol className="list-decimal list-inside space-y-0.5 text-indigo-600">
          <li>Zip your game's HTML/JS/CSS assets. The zip must contain at least one <code>.html</code> file (typically <code>index.html</code>).</li>
          <li>If your zip has a top-level folder (e.g. <code>my-game/</code>), it's automatically stripped — files go to <code>/public/games/&lt;slug&gt;/</code>.</li>
          <li>If your game has a thumbnail image at the root (<code>thumbnail.png</code> or <code>cover.jpg</code>), it's auto-detected and used as the game's cover.</li>
          <li>After upload, the game is immediately visible in the user-facing Game Hub (no rebuild required — files are served from <code>/public</code>).</li>
        </ol>
      </div>
    </div>
  );
}
