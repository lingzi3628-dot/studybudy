"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  Map as MapIcon,
  RefreshCw,
  Download,
  Share2,
  Edit3,
  Save,
  Trash2,
  Coins,
  Crown,
  Sparkles,
  Send,
} from "lucide-react";
import { useApp } from "../store";
import { ConceptMapDynamic } from "../concept-map/ConceptMapDynamic";
import { ConceptNodeData } from "../concept-map/node-types";
import { toPng } from "html-to-image";

type CmNode = { id: string; label: string; description?: string; type?: string };
type CmEdge = { source: string; target: string; label?: string };
type ConceptMapData = {
  id?: string;
  title: string;
  nodes: CmNode[];
  edges: CmEdge[];
  isPublic?: boolean;
  isOwner?: boolean;
  cached?: boolean;
};

type Mode = "view" | "edit";

export function ConceptMapScreen() {
  const { setScreen, activeConceptMapId, setActiveConceptMapId, activeTopicId, setActiveTopicId } = useApp() as any;
  const mapId = activeConceptMapId as string | null;

  const [map, setMap] = useState<ConceptMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [selectedNode, setSelectedNode] = useState<ConceptNodeData | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [editingNodes, setEditingNodes] = useState<CmNode[]>([]);
  const [editingEdges, setEditingEdges] = useState<CmEdge[]>([]);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Create-new state (when no mapId is set)
  const [createTopic, setCreateTopic] = useState("");
  const [createText, setCreateText] = useState("");
  const [creating, setCreating] = useState(false);
  const [conceptMapCost, setConceptMapCost] = useState<number>(300);
  // User-permission flags from /api/concept-maps/settings
  const [canEditFeature, setCanEditFeature] = useState(false);
  const [canExportFeature, setCanExportFeature] = useState(false);
  const [isPremiumUser, setIsPremiumUser] = useState(false);

  // Fetch concept-map cost + user permissions
  useEffect(() => {
    fetch("/api/concept-maps/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        if (typeof d.tokenCost === "number") setConceptMapCost(d.tokenCost);
        if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
        setCanEditFeature(d.canEdit === true);
        setCanExportFeature(d.canExport === true);
        setIsPremiumUser(d.isPremium === true);
      })
      .catch(() => {});
  }, []);

  // Pre-fill the topic field from activeTopicId (when navigated to from Study Room)
  useEffect(() => {
    if (!activeTopicId || mapId) return;
    fetch(`/api/topics/${activeTopicId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.topic?.name) {
          setCreateTopic(d.topic.name);
        }
      })
      .catch(() => {});
  }, [activeTopicId, mapId]);

  // Load the map (only if mapId is set)
  const loadMap = useCallback(async () => {
    if (!mapId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/concept-maps/${mapId}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setMap(d.conceptMap);
      setEditingNodes(d.conceptMap.nodes ?? []);
      setEditingEdges(d.conceptMap.edges ?? []);
      if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
      if (d.conceptMap.isPublic) {
        setShareUrl(`${window.location.origin}/shared/concept-map/${mapId}`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [mapId]);

  useEffect(() => {
    loadMap();
  }, [loadMap]);

  // Generate a new concept map from a topic or text
  const generateNew = useCallback(async () => {
    const topic = createTopic.trim();
    const text = createText.trim();
    if (!topic && !text) {
      setError("Please enter a topic or some text.");
      return;
    }
    setCreating(true);
    setError(null);
    setShowUpgrade(false);
    try {
      const r = await fetch("/api/generate/concept-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic || undefined, text: text || undefined }),
      });
      const d = await r.json();
      if (!r.ok) {
        const isUpgrade = d.needsUpgrade === true || r.status === 402;
        if (isUpgrade) {
          setError(d.error ?? "Token limit reached");
          setShowUpgrade(true);
        } else {
          throw new Error(d.error ?? `HTTP ${r.status}`);
        }
        return;
      }
      // Set the new map as active and load it
      setActiveConceptMapId(d.conceptMap.id);
      setMap(d.conceptMap);
      setEditingNodes(d.conceptMap.nodes ?? []);
      setEditingEdges(d.conceptMap.edges ?? []);
      if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
      setCreateTopic("");
      setCreateText("");
      setToast("Concept map created 🗺️");
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate");
    } finally {
      setCreating(false);
    }
  }, [createTopic, createText, setActiveConceptMapId]);

  // Regenerate (calls /api/generate/concept-map with the same topic)
  const regenerate = useCallback(async () => {
    if (!map) return;
    setLoading(true);
    setError(null);
    setShowUpgrade(false);
    try {
      const r = await fetch("/api/generate/concept-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: map.title }),
      });
      const d = await r.json();
      if (!r.ok) {
        const isUpgrade = d.needsUpgrade === true || r.status === 402;
        if (isUpgrade) {
          setError(d.error ?? "Token limit reached");
          setShowUpgrade(true);
        } else {
          throw new Error(d.error ?? `HTTP ${r.status}`);
        }
        return;
      }
      setActiveConceptMapId(d.conceptMap.id);
      setMap(d.conceptMap);
      setEditingNodes(d.conceptMap.nodes ?? []);
      setEditingEdges(d.conceptMap.edges ?? []);
      if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
      setToast("Concept map regenerated 🗺️");
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Failed to regenerate");
    } finally {
      setLoading(false);
    }
  }, [map, setActiveConceptMapId]);

  // Save edits
  const saveEdits = useCallback(async () => {
    if (!map?.id) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/concept-maps/${map.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: editingNodes, edges: editingEdges }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setError(d.error);
          setShowUpgrade(true);
        } else {
          throw new Error(d.error ?? `HTTP ${r.status}`);
        }
        return;
      }
      setMap((m) => m ? { ...m, ...d.conceptMap } : m);
      setMode("view");
      setToast("Edits saved ✓");
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [map, editingNodes, editingEdges]);

  // Export PNG
  const exportPng = useCallback(async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      // Check premium permission
      const checkRes = await fetch(`/api/concept-maps/${map?.id}/export`);
      const checkData = await checkRes.json();
      if (!checkRes.ok) {
        if (checkData.needsUpgrade) {
          setError(checkData.error);
          setShowUpgrade(true);
        } else {
          throw new Error(checkData.error ?? `HTTP ${checkRes.status}`);
        }
        return;
      }
      const dataUrl = await toPng(canvasRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        filter: (node) => {
          const cls = (node as HTMLElement)?.className ?? "";
          return !cls.includes("react-flow__controls") && !cls.includes("react-flow__minimap");
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${map?.title?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() ?? "concept-map"}.png`;
      a.click();
      setToast("Exported as PNG 🖼️");
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Export failed");
    } finally {
      setSaving(false);
    }
  }, [map]);

  // Share toggle
  const toggleShare = useCallback(async () => {
    if (!map?.id) return;
    setSharing(true);
    setError(null);
    try {
      const r = await fetch(`/api/concept-maps/${map.id}/share`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setError(d.error);
          setShowUpgrade(true);
        } else {
          throw new Error(d.error ?? `HTTP ${r.status}`);
        }
        return;
      }
      setMap((m) => m ? { ...m, isPublic: d.isPublic } : m);
      setShareUrl(d.shareUrl ? `${window.location.origin}${d.shareUrl}` : null);
      setToast(d.message);
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Share failed");
    } finally {
      setSharing(false);
    }
  }, [map]);

  // Delete
  const removeMap = useCallback(async () => {
    if (!map?.id) return;
    if (!confirm("Delete this concept map? This cannot be undone.")) return;
    try {
      const r = await fetch(`/api/concept-maps/${map.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setToast("Concept map deleted");
      setTimeout(() => setScreen("home"), 1000);
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  }, [map, setScreen]);

  // ============== CREATE-NEW VIEW (no mapId) ==============
  if (!mapId && !map) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="px-4 h-14 flex items-center gap-2">
            <button
              onClick={() => setScreen("home")}
              aria-label="Back"
              className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
            <MapIcon className="w-4 h-4 text-fuchsia-600" />
            <h1 className="text-base font-bold text-gray-900">Generate Concept Map</h1>
          </div>
        </header>

        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
          <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-violet-50 border border-fuchsia-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-fuchsia-600" />
              <h2 className="text-sm font-bold text-gray-900">Create a concept map</h2>
            </div>
            <p className="text-xs text-gray-600 mb-4">
              Enter a topic (like "Photosynthesis") or paste some text. The AI will identify the key
              concepts and their relationships, then render them as an interactive visual map.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Topic</label>
                <input
                  type="text"
                  value={createTopic}
                  onChange={(e) => setCreateTopic(e.target.value)}
                  placeholder="e.g. Photosynthesis, World War II, Calculus…"
                  className="mt-1.5 w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Or paste text <span className="text-gray-400 normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={createText}
                  onChange={(e) => setCreateText(e.target.value)}
                  placeholder="Paste notes, an article, or any text you want to map…"
                  rows={6}
                  className="mt-1.5 w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100 resize-none"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-500" />
                  Cost: <span className="font-semibold text-gray-700">{conceptMapCost} tokens</span>
                </span>
                {tokenBalance !== null && (
                  <span>You have: <span className="font-semibold text-gray-700">{tokenBalance.toLocaleString()}</span></span>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {showUpgrade && error && (
                <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 p-4 text-center">
                  <span className="text-3xl">🥲</span>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{error}</p>
                  <button
                    onClick={() => setScreen("premium")}
                    className="mt-3 px-6 h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
                  >
                    Upgrade Now →
                  </button>
                </div>
              )}

              <button
                onClick={generateNew}
                disabled={creating || (!createTopic.trim() && !createText.trim())}
                className="w-full h-12 rounded-full bg-fuchsia-600 text-white font-semibold text-sm shadow-md hover:bg-fuchsia-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                ) : (
                  <><Send className="w-4 h-4" /> Generate Concept Map</>
                )}
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] text-gray-400">
            Free users: 1 concept map / day. Premium plans unlock unlimited generation + editing + export.
          </p>
        </div>

        {toast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ============== VIEW MAP (mapId set or map loaded) ==============
  if (loading && !map) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-5xl mx-auto flex flex-col items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-fuchsia-600" />
        <p className="mt-3 text-sm text-gray-500">Loading concept map…</p>
      </div>
    );
  }

  if (error && !map && !showUpgrade) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-5xl mx-auto flex flex-col items-center justify-center px-4">
        <AlertCircle className="w-10 h-10 text-rose-500" />
        <p className="mt-3 text-sm text-gray-700 font-medium">{error}</p>
        <button
          onClick={() => setScreen("home")}
          className="mt-4 px-4 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Back to home
        </button>
      </div>
    );
  }

  if (showUpgrade && !map) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col items-center justify-center px-4 text-center">
        <span className="text-5xl">🥲</span>
        <p className="mt-3 text-base font-semibold text-gray-900">{error}</p>
        <button
          onClick={() => setScreen("premium")}
          className="mt-4 px-6 h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
        >
          Upgrade Now →
        </button>
        <button onClick={() => setScreen("home")} className="mt-2 text-xs text-gray-500">
          Back to home
        </button>
      </div>
    );
  }

  if (!map) return null;

  const nodes = mode === "edit" ? editingNodes : map.nodes;
  const edges = mode === "edit" ? editingEdges : map.edges;
  const isOwner = map.isOwner !== false;
  // Edit/export/share buttons shown only when (a) user owns the map AND
  // (b) their plan has the corresponding feature flag enabled.
  const canEdit = isOwner && canEditFeature;
  const canExport = isOwner && canExportFeature;
  const canShare = isOwner && canExportFeature;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setScreen("home")}
              aria-label="Back"
              className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <MapIcon className="w-4 h-4 text-fuchsia-600 flex-shrink-0" />
              <h1 className="text-sm font-bold text-gray-900 truncate">{map.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {tokenBalance !== null && (
              <button
                onClick={() => setScreen("billing")}
                className="hidden sm:flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-semibold"
              >
                <Coins className="w-3 h-3" /> {tokenBalance.toLocaleString()}
              </button>
            )}
            {mode === "view" ? (
              <>
                <button
                  onClick={regenerate}
                  disabled={loading}
                  title="Regenerate (costs tokens)"
                  className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </button>
                {canEdit && (
                  <button
                    onClick={() => setMode("edit")}
                    title="Edit (premium)"
                    className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                {canExport && (
                  <button
                    onClick={exportPng}
                    disabled={saving}
                    title="Export PNG (premium)"
                    className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                )}
                {canShare && (
                  <button
                    onClick={toggleShare}
                    disabled={sharing}
                    title={map.isPublic ? "Make private" : "Share (premium)"}
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      map.isPublic ? "bg-emerald-100 text-emerald-700" : "hover:bg-gray-100 text-gray-700"
                    } disabled:opacity-50`}
                  >
                    {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={removeMap}
                    title="Delete"
                    className="w-9 h-9 rounded-full hover:bg-rose-50 flex items-center justify-center text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={saveEdits}
                  disabled={saving}
                  className="px-3 h-9 rounded-full bg-fuchsia-600 text-white text-xs font-semibold hover:bg-fuchsia-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => { setMode("view"); setEditingNodes(map.nodes); setEditingEdges(map.edges); }}
                  className="px-3 h-9 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Share banner */}
      {shareUrl && map.isPublic && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between gap-2">
          <p className="text-xs text-emerald-700 truncate">
            <Share2 className="w-3 h-3 inline mr-1" /> Public link: {shareUrl}
          </p>
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); setToast("Link copied ✓"); setTimeout(() => setToast(null), 1500); }}
            className="text-[10px] text-emerald-700 font-semibold hover:underline"
          >
            Copy
          </button>
        </div>
      )}

      {/* Error / upgrade banner */}
      {error && showUpgrade && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center">
          <p className="text-xs text-amber-700 font-semibold">{error}</p>
          <button
            onClick={() => setScreen("premium")}
            className="mt-1 text-xs text-indigo-600 font-semibold underline"
          >
            Upgrade Now →
          </button>
        </div>
      )}
      {error && !showUpgrade && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-center text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <div ref={canvasRef} className="w-full h-[calc(100vh-3.5rem)]">
          <ConceptMapDynamic
            nodes={nodes}
            edges={edges}
            onNodeClick={(_, data) => setSelectedNode(data)}
            height="100%"
            showMiniMap
          />
        </div>
      </div>

      {/* Selected node details panel */}
      {selectedNode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {selectedNode.nodeType === "main" ? (
                <Sparkles className="w-4 h-4 text-fuchsia-600 flex-shrink-0" />
              ) : null}
              <h3 className="text-sm font-bold text-gray-900 truncate">{selectedNode.label}</h3>
              {selectedNode.nodeType === "main" && (
                <span className="text-[10px] bg-fuchsia-50 text-fuchsia-600 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                  Main
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {selectedNode.description ? (
            <p className="text-xs text-gray-600 leading-relaxed">{selectedNode.description}</p>
          ) : (
            <p className="text-xs text-gray-400 italic">No description for this concept.</p>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg animate-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
