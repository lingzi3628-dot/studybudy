"use client";

import { useState } from "react";
import {
  Search as SearchIcon,
  X,
  Clock,
  BookOpen,
  ListChecks,
  Layers,
  BookText,
  ChevronRight,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  Video,
  Play,
  Download,
  RefreshCw,
  Coins,
} from "lucide-react";
import { useApp } from "../store";
import { api, type SearchResult } from "../api";

const filters = ["All", "Math", "English", "Kiswahili", "Chinese", "Science"];
const recent = ["photosynthesis", "quadratic equations", "swahili greetings", "world war 2"];

type SearchTab = "all" | "images" | "videos";

export function Search() {
  const { setScreen, setActiveTopicId } = useApp();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SearchTab>("all");

  // Images state
  const [images, setImages] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  // Videos state
  const [videos, setVideos] = useState<any[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  const doSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.search(trimmed);
      setResult(r);
      if (r.tokenBalance !== undefined) setTokenBalance(r.tokenBalance);
      // Also fetch images and videos if on "all" tab
      if (tab === "all" || tab === "images") fetchImages(trimmed);
      if (tab === "all" || tab === "videos") fetchVideos(trimmed);
    } catch (e: any) {
      const errMsg = e?.message ?? "Search failed";
      // Show upgrade button only when the server explicitly marked it as an upgrade case
      // (We do NOT have access to the needsUpgrade flag here because api.search throws on !r.ok,
      // so we still use the regex — but the server only returns upgrade-style messages on 402.)
      const isUpgrade = /upgrade|premium|subscription|tokens?|limit|plan|daily/i.test(errMsg);
      if (isUpgrade) {
        setError(errMsg + "|UPGRADE");
      } else {
        setError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchImages = async (prompt: string) => {
    setImageLoading(true);
    setImageError(null);
    setImages([]);  // clear any previous images
    try {
      const r = await fetch("/api/search/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count: 2 }),
      });
      const d = await r.json();
      if (!r.ok) {
        const errMsg = d.error ?? "Failed to generate images";
        const isUpgrade = d.needsUpgrade === true || r.status === 402;
        setImageError(errMsg + (isUpgrade ? "|UPGRADE" : ""));
        return;
      }
      // Set all images at once — server has already fetched them sequentially
      // with retry-on-429 logic, so they're guaranteed to be loadable data URLs.
      setImages(d.images ?? []);
      setTokenBalance(d.remaining);
    } catch {
      setImageError("Failed to fetch images");
    } finally {
      setImageLoading(false);
    }
  };

  const fetchVideos = async (q: string) => {
    setVideoLoading(true);
    setVideoError(null);
    try {
      const r = await fetch("/api/search/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, maxResults: 5 }),
      });
      const d = await r.json();
      if (!r.ok) {
        const errMsg = d.error ?? "Failed to search videos";
        const isUpgrade = d.needsUpgrade === true || r.status === 402;
        setVideoError(errMsg + (isUpgrade ? "|UPGRADE" : ""));
        return;
      }
      setVideos(d.videos ?? []);
      setTokenBalance(d.remaining);
    } catch {
      setVideoError("Failed to fetch videos");
    } finally {
      setVideoLoading(false);
    }
  };

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 md:pb-8">
        {/* search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); doSearch(query); }}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 h-11 shadow-sm"
        >
          <SearchIcon className="w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics, questions, or skills..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setSubmitted(null); setResult(null); setImages([]); setVideos([]); }} aria-label="Clear">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </form>

        {/* filter chips */}
        <div className="mt-3 -mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${activeFilter === f ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Tabs */}
        {submitted && (
          <div className="mt-3 flex gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium sticky top-0 z-10">
            {[
              { key: "all" as const, label: "All" },
              { key: "images" as const, label: "🖼️ Images" },
              { key: "videos" as const, label: "📺 Videos" },
            ].map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-1.5 rounded-lg transition ${tab === t.key ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* recent searches */}
        {!submitted && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent searches</h3>
            <div className="space-y-1.5">
              {recent.map((r) => (
                <button key={r} onClick={() => { setQuery(r); doSearch(r); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 text-left">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{r}</span>
                </button>
              ))}
            </div>
            <p className="mt-6 text-xs text-gray-400">
              Try: <button onClick={() => { setQuery("photosynthesis"); doSearch("photosynthesis"); }} className="text-indigo-600 underline">photosynthesis</button>
            </p>
          </section>
        )}

        {/* loading */}
        {loading && (
          <div className="mt-10 flex flex-col items-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="mt-3 text-sm">Searching…</p>
          </div>
        )}

        {/* error */}
        {error && !loading && (
          <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span>{error.replace(/\|UPGRADE$/, "")}</span>
              {error.endsWith("|UPGRADE") && (
                <button onClick={() => useApp.getState().setScreen("premium")} className="ml-2 text-indigo-600 font-semibold underline">Upgrade →</button>
              )}
            </div>
          </div>
        )}

        {/* RESULTS */}
        {submitted && !loading && (
          <div className="mt-5 space-y-4">
            {/* TEXT (All + implicit) */}
            {(tab === "all") && result && (
              <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">AI Summary</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">{activeFilter}</span>
                </div>
                <h2 className="text-base font-bold text-gray-900 capitalize">{result.query}</h2>
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{result.summary}</p>
                {result.keyPoints?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Key points</p>
                    <ul className="space-y-1">
                      {result.keyPoints.map((kp, i) => (
                        <li key={i} className="text-sm text-gray-600 flex gap-2">
                          <span className="text-indigo-500 font-bold flex-shrink-0">•</span>
                          <span>{kp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.relatedTopics?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Related topics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.relatedTopics.map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <button onClick={() => { setQuery(""); setSubmitted(null); }} className="text-xs text-gray-500">Clear</button>
                  {tokenBalance !== null && (
                    <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-semibold">
                      <Coins className="w-3 h-3" /> {tokenBalance.toLocaleString()} tokens left
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* IMAGES (All + Images tab) */}
            {(tab === "all" || tab === "images") && (
              <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> AI Images
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold">FREE</span>
                    {images.length > 0 && (
                      <button onClick={() => fetchImages(submitted!)} className="text-[10px] text-indigo-600 font-medium flex items-center gap-1 hover:underline">
                        <RefreshCw className="w-3 h-3" /> Regenerate
                      </button>
                    )}
                  </div>
                </div>

                {imageLoading && (
                  <div className="grid grid-cols-2 gap-2">
                    {[1,2].map((i) => (
                      <div key={i} className="h-40 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 animate-pulse flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                        <span className="text-[10px] font-medium text-indigo-600">Generating image {i}…</span>
                        <span className="text-[9px] text-gray-400">AI generation takes 5-15s</span>
                      </div>
                    ))}
                  </div>
                )}

                {imageError && !imageLoading && (
                  <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p>{imageError.replace(/\|UPGRADE$/, "")}</p>
                      {(imageError.includes("token") || imageError.includes("limit") || imageError.endsWith("|UPGRADE")) && (
                        <button onClick={() => useApp.getState().setScreen("premium")} className="mt-1 text-indigo-600 font-semibold underline">Upgrade →</button>
                      )}
                    </div>
                  </div>
                )}

                {!imageLoading && !imageError && images.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No images yet. Search to generate.</p>
                )}

                {!imageLoading && images.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((url, i) => (
                      <button key={i} onClick={() => setEnlargedImage(url)} className="relative group">
                        <img
                          src={url}
                          alt={`Generated ${i+1}`}
                          className="w-full h-40 object-cover rounded-xl"
                        />
                        <span className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center pointer-events-none">
                          <Play className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VIDEOS (All + Videos tab) */}
            {(tab === "all" || tab === "videos") && (
              <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600 flex items-center gap-1">
                    <Video className="w-3.5 h-3.5" /> Videos
                  </span>
                  <span className="text-[10px] text-gray-400">Cost: 50 tokens</span>
                </div>

                {videoLoading && (
                  <div className="space-y-2">
                    {[1,2,3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-24 h-16 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
                        <div className="flex-1 h-4 bg-gray-100 rounded animate-pulse mt-2" />
                      </div>
                    ))}
                  </div>
                )}

                {videoError && !videoLoading && (
                  <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p>{videoError.replace(/\|UPGRADE$/, "")}</p>
                      {(videoError.includes("token") || videoError.includes("limit") || videoError.endsWith("|UPGRADE")) && (
                        <button onClick={() => useApp.getState().setScreen("premium")} className="mt-1 text-indigo-600 font-semibold underline">Upgrade →</button>
                      )}
                    </div>
                  </div>
                )}

                {!videoLoading && !videoError && videos.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No videos yet. Search to find.</p>
                )}

                {!videoLoading && videos.length > 0 && (
                  <div className="space-y-2">
                    {videos.map((v) => (
                      <button key={v.videoId} onClick={() => setPlayingVideo(v.videoId)}
                        className="w-full flex gap-3 p-2 rounded-xl hover:bg-gray-50 text-left">
                        <div className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-gray-100">
                          <img src={v.thumbnail} alt={v.title} className="w-24 h-16 object-cover" loading="eager" referrerPolicy="no-referrer" />
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white drop-shadow" />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 line-clamp-2">{v.title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{v.channel}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image enlarger modal */}
      {enlargedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setEnlargedImage(null)}>
          <div className="relative max-w-md" onClick={(e) => e.stopPropagation()}>
            <img src={enlargedImage} alt="Enlarged" className="w-full rounded-2xl" />
            <a href={enlargedImage} download="studybuddy-image.jpg" target="_blank" rel="noreferrer"
              className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white">
              <Download className="w-4 h-4 text-gray-700" />
            </a>
            <button onClick={() => setEnlargedImage(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
              <X className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>
      )}

      {/* Video player modal */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPlayingVideo(null)}>
          <div className="relative w-full max-w-lg">
            <div className="aspect-video rounded-2xl overflow-hidden bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${playingVideo}?autoplay=1`}
                title="YouTube video player"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <button onClick={() => setPlayingVideo(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg">
              <X className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
