"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Check,
  X,
  Edit3,
  Save,
  Zap,
  AlertCircle,
  Bot,
  Key,
  Link2,
  Link2Off,
  Sparkles,
  Cpu,
  Eye,
  EyeOff,
} from "lucide-react";

/**
 * VisualApiEditor — a node-based graph editor for AI providers and Study Buddies.
 *
 * Used in two modes:
 *   1. Admin mode — shows ALL AiProviders + ALL ModelMappings + connection lines.
 *      Admin can add/edit/delete/test API keys, create new Study Buddies, and
 *      connect them via drag-and-drop.
 *   2. User mode (BYOK) — shows the user's own API key (single node) + their
 *      current Study Buddy selection. User can drop in an API key, pick a
 *      model identifier, and test the connection.
 *
 * The graph is rendered as an interactive SVG with draggable nodes and
 * bezier connection lines between API nodes and StudyBuddy nodes.
 */

type Provider = {
  id: string;
  name: string;
  providerType: string;
  enabled: boolean;
  baseUrl?: string | null;
  model?: string | null;
  maxTokens: number;
  costPer1kTokens: number;
  isDefault: boolean;
  priority: number;
};

type ModelMapping = {
  id: string;
  modelName: string;
  displayName: string;
  emoji: string;
  providerId: string | null;
  modelIdentifier: string | null;
  tokenCostMultiplier: number;
  requiresPremium: boolean;
};

type TestResult = {
  status: "ok" | "error";
  message?: string;
  latencyMs?: number;
  model?: string;
} | null;

type Props = {
  mode: "admin" | "user";
};

const PROVIDER_TEMPLATES: Array<{ type: string; label: string; baseUrl: string; model: string; emoji: string; color: string }> = [
  { type: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", emoji: "🟢", color: "#10B981" },
  { type: "anthropic", label: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-20241022", emoji: "🟣", color: "#8B5CF6" },
  { type: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1", model: "gemini-1.5-flash", emoji: "🔵", color: "#3B82F6" },
  { type: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", emoji: "🔀", color: "#F59E0B" },
  { type: "huggingface", label: "Hugging Face", baseUrl: "https://api-inference.huggingface.co/models", model: "meta-llama/Llama-3.1-8B-Instruct", emoji: "🤗", color: "#FFD21E" },
  { type: "groq", label: "Groq (fast)", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-70b-versatile", emoji: "⚡", color: "#F55036" },
  { type: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", emoji: "🤝", color: "#0F6FFF" },
  { type: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", emoji: "🌊", color: "#4D6BFE" },
  { type: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", emoji: "🌬️", color: "#FF7000" },
  { type: "ollama", label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.2", emoji: "🦙", color: "#6B7280" },
  { type: "pollinations", label: "Pollinations (free)", baseUrl: "https://text.pollinations.ai", model: "openai", emoji: "🌼", color: "#F472B6" },
];

export function VisualApiEditor({ mode }: Props) {
  // Load providers + model mappings
  const [providers, setProviders] = useState<Provider[]>([]);
  const [mappings, setMappings] = useState<ModelMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Test results per provider
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);

  // Health monitoring — auto-tested status per provider (Phase 35)
  const [health, setHealth] = useState<Record<string, { status: "green" | "yellow" | "red" | "unknown"; successRate: number; avgLatencyMs: number | null; lastCheckedAt: string | null; lastError: string | null }>>({});
  const [healthChecking, setHealthChecking] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"24h" | "7d" | "30d">("7d");

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/providers/health-check");
      if (!r.ok) return;
      const d = await r.json();
      const map: Record<string, any> = {};
      for (const s of d.summary ?? []) {
        map[s.providerId] = {
          status: s.health,
          successRate: s.successRate,
          avgLatencyMs: s.avgLatencyMs,
          lastCheckedAt: s.lastCheckedAt,
          lastError: s.lastError,
        };
      }
      setHealth(map);
    } catch {}
  }, []);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    try {
      await fetch("/api/admin/providers/health-check", { method: "POST" });
      await loadHealth();
    } catch (e: any) {
      setError(e?.message ?? "Health check failed");
    } finally {
      setHealthChecking(false);
    }
  };

  const loadAnalytics = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/usage-analytics?range=${analyticsRange}`);
      if (!r.ok) return;
      const d = await r.json();
      setAnalyticsData(d);
    } catch {}
  }, [analyticsRange]);

  useEffect(() => {
    if (mode === "admin") loadHealth();
  }, [mode, loadHealth]);

  useEffect(() => {
    if (showAnalytics && mode === "admin") loadAnalytics();
  }, [showAnalytics, mode, loadAnalytics]);

  // Drag state — track which StudyBuddy is being connected to which API
  const [draggingFromBuddy, setDraggingFromBuddy] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [highlightProvider, setHighlightProvider] = useState<string | null>(null);

  // Add-provider modal state
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState<{ name: string; providerType: string; baseUrl: string; model: string; apiKey: string; apiKeyVisible: boolean }>({
    name: "",
    providerType: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
    apiKeyVisible: false,
  });

  // Add-StudyBuddy modal state
  const [showAddBuddy, setShowAddBuddy] = useState(false);
  const [newBuddy, setNewBuddy] = useState<{ modelName: string; displayName: string; emoji: string; providerId: string | null; modelIdentifier: string }>({
    modelName: "",
    displayName: "",
    emoji: "🤖",
    providerId: null,
    modelIdentifier: "",
  });

  // Load everything
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoints = mode === "admin"
        ? ["/api/admin/providers", "/api/admin/model-mappings"]
        : ["/api/admin/providers", "/api/admin/model-mappings"]; // user also sees global providers + buddies
      const [pRes, mRes] = await Promise.all(endpoints.map((u) => fetch(u)));
      if (pRes.ok) {
        const d = await pRes.json();
        setProviders(d.providers ?? []);
      }
      if (mRes.ok) {
        const d = await mRes.json();
        setMappings(d.mappings ?? []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  // Test a provider
  const testProvider = async (providerId: string) => {
    setTesting(providerId);
    setTestResults((r) => ({ ...r, [providerId]: null }));
    try {
      const r = await fetch(`/api/admin/providers/${providerId}/test`, { method: "POST" });
      const d = await r.json();
      setTestResults((r) => ({
        ...r,
        [providerId]: {
          status: r.ok ? "ok" : "error",
          message: d.message ?? d.error ?? (r.ok ? "OK" : "Failed"),
          latencyMs: d.latencyMs,
          model: d.model,
        },
      }));
    } catch (e: any) {
      setTestResults((r) => ({ ...r, [providerId]: { status: "error", message: e?.message ?? "Network" } }));
    } finally {
      setTesting(null);
    }
  };

  // Connect a StudyBuddy to a provider (drag-and-drop)
  const connectBuddyToProvider = async (buddyId: string, providerId: string) => {
    try {
      const buddy = mappings.find((m) => m.id === buddyId);
      if (!buddy) return;
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;
      // Update the ModelMapping to point to the provider
      await fetch("/api/admin/model-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelName: buddy.modelName,
          displayName: buddy.displayName,
          emoji: buddy.emoji,
          providerId: providerId,
          modelIdentifier: buddy.modelIdentifier ?? provider.model,
          tokenCostMultiplier: buddy.tokenCostMultiplier,
          requiresPremium: buddy.requiresPremium,
        }),
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Connection failed");
    }
  };

  // Disconnect a StudyBuddy from its provider
  const disconnectBuddy = async (buddyId: string) => {
    const buddy = mappings.find((m) => m.id === buddyId);
    if (!buddy) return;
    try {
      await fetch("/api/admin/model-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelName: buddy.modelName,
          displayName: buddy.displayName,
          emoji: buddy.emoji,
          providerId: null,
          modelIdentifier: null,
          tokenCostMultiplier: buddy.tokenCostMultiplier,
          requiresPremium: buddy.requiresPremium,
        }),
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Disconnect failed");
    }
  };

  // Create a new provider
  const createProvider = async () => {
    const template = PROVIDER_TEMPLATES.find((t) => t.type === newProvider.providerType);
    const body: any = {
      name: newProvider.name || template?.label || newProvider.providerType,
      providerType: newProvider.providerType,
      baseUrl: newProvider.baseUrl,
      model: newProvider.model,
      enabled: true,
      priority: 100,
    };
    // For admin mode, send the API key (server encrypts it)
    // For user mode, this route is admin-only, so user can't directly add —
    // they'd use /api/user/api-key instead (handled separately below)
    if (mode === "admin" && newProvider.apiKey) {
      body.apiKey = newProvider.apiKey;
    }
    try {
      const r = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed");
      }
      setShowAddProvider(false);
      setNewProvider({ name: "", providerType: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "", apiKeyVisible: false });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    }
  };

  const deleteProvider = async (id: string) => {
    if (!confirm("Delete this API provider? All Study Buddies using it will be disconnected.")) return;
    try {
      await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  };

  // Create a new StudyBuddy
  const createBuddy = async () => {
    try {
      const provider = providers.find((p) => p.id === newBuddy.providerId);
      await fetch("/api/admin/model-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelName: newBuddy.modelName || `study_buddy_${newBuddy.displayName.toLowerCase().replace(/\s+/g, "_")}`,
          displayName: newBuddy.displayName,
          emoji: newBuddy.emoji,
          providerId: newBuddy.providerId,
          modelIdentifier: newBuddy.modelIdentifier || provider?.model,
          tokenCostMultiplier: 1.0,
          requiresPremium: false,
        }),
      });
      setShowAddBuddy(false);
      setNewBuddy({ modelName: "", displayName: "", emoji: "🤖", providerId: null, modelIdentifier: "" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    }
  };

  // SVG canvas dimensions
  const canvasWidth = 1000;
  const canvasHeight = Math.max(400, Math.max(providers.length, mappings.length) * 110 + 80);
  const providerColX = 80;
  const buddyColX = canvasWidth - 280;
  const nodeWidth = 240;
  const nodeHeight = 90;

  // Calculate y positions for nodes (stacked vertically in each column)
  const providerPositions = providers.map((_, i) => ({ x: providerColX, y: 30 + i * 100 }));
  const buddyPositions = mappings.map((_, i) => ({ x: buddyColX, y: 30 + i * 100 }));

  // Helper: draw a bezier curve between two points
  const bezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  };

  // Mouse-move handler for drag line
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingFromBuddy || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = canvasWidth / rect.width;
    setMousePos({
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * (canvasHeight / rect.height),
    });
  };

  if (loading) return <div className="p-4 text-center text-xs text-gray-500"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading graph…</div>;
  if (error) return <div className="p-3 rounded bg-rose-50 text-rose-700 text-xs">{error}</div>;

  return (
    <div className="space-y-3">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">AI Studio — Visual API Editor</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {mode === "admin"
              ? "Drop an API key into a node on the left, drag a Study Buddy on the right to connect."
              : "Pick an API + Study Buddy below to set up your own AI model."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowAddProvider(true)}
            className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> API Key
          </button>
          {mode === "admin" && (
            <>
              <button
                onClick={() => setShowAddBuddy(true)}
                className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Study Buddy
              </button>
              <button
                onClick={runHealthCheck}
                disabled={healthChecking}
                className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 flex items-center gap-1 disabled:opacity-50"
                title="Test all APIs and update health badges"
              >
                {healthChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Health Check
              </button>
              <button
                onClick={() => setShowAnalytics(true)}
                className="px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 flex items-center gap-1"
                title="View usage analytics"
              >
                <Cpu className="w-3.5 h-3.5" /> Analytics
              </button>
            </>
          )}
        </div>
      </div>

      {/* Visual graph canvas */}
      <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-indigo-50/40 border border-gray-200 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="w-full h-auto"
          onMouseMove={onMouseMove}
          onMouseUp={() => {
            setDraggingFromBuddy(null);
            setMousePos(null);
            setHighlightProvider(null);
          }}
          onMouseLeave={() => {
            setDraggingFromBuddy(null);
            setMousePos(null);
            setHighlightProvider(null);
          }}
          style={{ background: "radial-gradient(circle at 1px 1px, #E5E7EB 1px, transparent 0) 0 0 / 20px 20px" }}
        >
          {/* Column headers */}
          <text x={providerColX + nodeWidth / 2} y={20} textAnchor="middle" fontSize={12} fill="#374151" fontWeight={700}>
            🔑 API Nodes
          </text>
          <text x={buddyColX + nodeWidth / 2} y={20} textAnchor="middle" fontSize={12} fill="#374151" fontWeight={700}>
            🤖 Study Buddy Nodes
          </text>

          {/* Connection lines (drawn first so they're behind nodes) */}
          {mappings.map((buddy, bi) => {
            if (!buddy.providerId) return null;
            const pi = providers.findIndex((p) => p.id === buddy.providerId);
            if (pi < 0) return null;
            const from = providerPositions[pi];
            const to = buddyPositions[bi];
            return (
              <path
                key={`conn-${buddy.id}`}
                d={bezierPath(from.x + nodeWidth, from.y + nodeHeight / 2, to.x, to.y + nodeHeight / 2)}
                fill="none"
                stroke="#4F46E5"
                strokeWidth={2}
                strokeDasharray="6 3"
                opacity={0.6}
              />
            );
          })}

          {/* Drag line — from buddy to mouse cursor */}
          {draggingFromBuddy && mousePos && (() => {
            const bi = mappings.findIndex((m) => m.id === draggingFromBuddy);
            if (bi < 0) return null;
            const from = buddyPositions[bi];
            return (
              <path
                d={bezierPath(from.x, from.y + nodeHeight / 2, mousePos.x, mousePos.y)}
                fill="none"
                stroke="#EF4444"
                strokeWidth={2}
                strokeDasharray="3 3"
                opacity={0.8}
              />
            );
          })()}

          {/* Provider (API) nodes */}
          {providers.map((p, i) => {
            const pos = providerPositions[i];
            const template = PROVIDER_TEMPLATES.find((t) => t.type === p.providerType);
            const color = template?.color ?? "#6B7280";
            const emoji = template?.emoji ?? "🔑";
            const buddyCount = mappings.filter((m) => m.providerId === p.id).length;
            const test = testResults[p.id];
            const isHighlighted = highlightProvider === p.id;
            // Health badge (Phase 35)
            const h = health[p.id];
            const healthColor = h?.status === "green" ? "#10B981" : h?.status === "yellow" ? "#F59E0B" : h?.status === "red" ? "#EF4444" : "#9CA3AF";
            const healthEmoji = h?.status === "green" ? "🟢" : h?.status === "yellow" ? "🟡" : h?.status === "red" ? "🔴" : "⚪";
            const healthTitle = h ? `${h.status.toUpperCase()} · ${Math.round(h.successRate * 100)}% success · ${h.avgLatencyMs ?? "?"}ms avg` : "No health data";
            return (
              <foreignObject key={`prov-${p.id}`} x={pos.x} y={pos.y} width={nodeWidth} height={nodeHeight}>
                <div
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    if (draggingFromBuddy) {
                      connectBuddyToProvider(draggingFromBuddy, p.id);
                      setDraggingFromBuddy(null);
                      setMousePos(null);
                      setHighlightProvider(null);
                    }
                  }}
                  onMouseEnter={() => draggingFromBuddy && setHighlightProvider(p.id)}
                  onMouseLeave={() => setHighlightProvider(null)}
                  style={{
                    border: `2px solid ${isHighlighted ? "#EF4444" : color}`,
                    borderRadius: 12,
                    background: "white",
                    padding: "8px 10px",
                    boxShadow: isHighlighted ? "0 0 0 3px #FECACA" : "0 1px 3px rgba(0,0,0,0.08)",
                    height: "100%",
                    cursor: draggingFromBuddy ? "crosshair" : "default",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 18 }}>{emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#1F2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</p>
                      <p style={{ fontSize: 9, color: "#6B7280", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.model ?? "no model set"}
                      </p>
                    </div>
                    {p.isDefault && (
                      <span style={{ fontSize: 8, fontWeight: 700, background: "#10B981", color: "white", padding: "1px 5px", borderRadius: 6 }}>
                        DEFAULT
                      </span>
                    )}
                    {/* Health badge (Phase 35) */}
                    {mode === "admin" && (
                      <span title={healthTitle} style={{ fontSize: 11, cursor: "help", filter: h?.status === "red" ? "grayscale(0)" : "none" }}>
                        {healthEmoji}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Test button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); testProvider(p.id); }}
                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#3B82F6", color: "white", border: "none", cursor: "pointer", fontWeight: 600 }}
                      title="Test this API"
                    >
                      {testing === p.id ? "…" : "⚡ Test"}
                    </button>
                    {/* Test result */}
                    {test && (
                      <span style={{ fontSize: 9, color: test.status === "ok" ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                        {test.status === "ok" ? `✓ ${test.latencyMs ?? "?"}ms` : `✗ ${test.message ?? ""}`}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {/* Connected buddy count */}
                    <span style={{ fontSize: 9, color: "#6B7280" }}>
                      🔗 {buddyCount}
                    </span>
                    {/* Delete */}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteProvider(p.id); }}
                      style={{ fontSize: 9, padding: "2px 4px", border: "none", background: "transparent", color: "#EF4444", cursor: "pointer" }}
                      title="Delete API"
                    >✕</button>
                  </div>
                  {!p.enabled && (
                    <p style={{ fontSize: 8, color: "#EF4444", marginTop: 4, fontWeight: 600 }}>● DISABLED</p>
                  )}
                </div>
              </foreignObject>
            );
          })}

          {/* Study Buddy nodes */}
          {mappings.map((buddy, i) => {
            const pos = buddyPositions[i];
            const hasProvider = Boolean(buddy.providerId);
            return (
              <foreignObject key={`buddy-${buddy.id}`} x={pos.x} y={pos.y} width={nodeWidth} height={nodeHeight}>
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggingFromBuddy(buddy.id);
                  }}
                  style={{
                    border: `2px solid ${hasProvider ? "#10B981" : "#9CA3AF"}`,
                    borderRadius: 12,
                    background: hasProvider ? "#ECFDF5" : "white",
                    padding: "8px 10px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    height: "100%",
                    cursor: draggingFromBuddy === buddy.id ? "grabbing" : "grab",
                    borderStyle: draggingFromBuddy === buddy.id ? "dashed" : "solid",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 18 }}>{buddy.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#1F2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{buddy.displayName}</p>
                      <p style={{ fontSize: 9, color: "#6B7280", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {buddy.modelIdentifier ?? "no model"}
                      </p>
                    </div>
                    {buddy.requiresPremium && (
                      <span style={{ fontSize: 8, fontWeight: 700, background: "#F59E0B", color: "white", padding: "1px 5px", borderRadius: 6 }}>
                        PREMIUM
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
                    {hasProvider ? (
                      <>
                        <span style={{ color: "#10B981", fontWeight: 600 }}>✓ Connected</span>
                        <span style={{ flex: 1 }} />
                        <button
                          onClick={(e) => { e.stopPropagation(); disconnectBuddy(buddy.id); }}
                          style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#FEE2E2", color: "#DC2626", border: "none", cursor: "pointer", fontWeight: 600 }}
                        >Disconnect</button>
                      </>
                    ) : (
                      <span style={{ color: "#9CA3AF" }}>← Drag to an API to connect</span>
                    )}
                  </div>
                  {!hasProvider && (
                    <p style={{ fontSize: 8, color: "#EF4444", marginTop: 2, fontWeight: 600 }}>⚠ Not connected — will use platform fallback</p>
                  )}
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>

      {/* Legend + instructions */}
      <div className="text-[10px] text-gray-500 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Connected</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400" /> Disconnected</span>
        <span>· Drag a Study Buddy to an API to connect · Tap ⚡ Test to verify the API key works</span>
      </div>

      {/* Provider templates gallery — shown when admin wants to add a new API */}
      {showAddProvider && (
        <Modal onClose={() => setShowAddProvider(false)} title="Add API Key">
          <div className="space-y-3">
            {/* Template picker */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Pick a provider template:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PROVIDER_TEMPLATES.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => setNewProvider((p) => ({ ...p, providerType: t.type, baseUrl: t.baseUrl, model: t.model, name: p.name || t.label }))}
                    className={`p-2 rounded-lg border-2 text-left transition ${
                      newProvider.providerType === t.type ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-200"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg">{t.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{t.label}</p>
                        <p className="text-[9px] text-gray-500 truncate">{t.model}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Display name</label>
              <input
                type="text"
                value={newProvider.name}
                onChange={(e) => setNewProvider((p) => ({ ...p, name: e.target.value }))}
                placeholder="My OpenAI Key"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-indigo-400"
              />
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Base URL</label>
              <input
                type="text"
                value={newProvider.baseUrl}
                onChange={(e) => setNewProvider((p) => ({ ...p, baseUrl: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-mono outline-none focus:border-indigo-400"
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Model identifier</label>
              <input
                type="text"
                value={newProvider.model}
                onChange={(e) => setNewProvider((p) => ({ ...p, model: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-mono outline-none focus:border-indigo-400"
              />
            </div>

            {/* API key (admin mode only — users use /api/user/api-key) */}
            {mode === "admin" && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">API key</label>
                <div className="relative">
                  <input
                    type={newProvider.apiKeyVisible ? "text" : "password"}
                    value={newProvider.apiKey}
                    onChange={(e) => setNewProvider((p) => ({ ...p, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-2.5 py-1.5 pr-8 rounded-lg border border-gray-200 text-xs font-mono outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => setNewProvider((p) => ({ ...p, apiKeyVisible: !p.apiKeyVisible }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  >
                    {newProvider.apiKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Stored encrypted. Never shown to users.</p>
              </div>
            )}

            <button
              onClick={createProvider}
              className="w-full h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add API
            </button>
          </div>
        </Modal>
      )}

      {/* Add StudyBuddy modal — admin only */}
      {showAddBuddy && mode === "admin" && (
        <Modal onClose={() => setShowAddBuddy(false)} title="Add Study Buddy">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Emoji</label>
              <div className="flex gap-1 flex-wrap">
                {["🤖", "🎓", "🦊", "🦁", "🐼", "🐯", "🦉", "🐢", "🦄", "🐲", "👨‍🏫", "👩‍🔬", "🧙", "🦸"].map((e) => (
                  <button
                    key={e}
                    onClick={() => setNewBuddy((b) => ({ ...b, emoji: e }))}
                    className={`text-xl p-1.5 rounded-lg border-2 transition ${newBuddy.emoji === e ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-200"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Display name</label>
              <input
                type="text"
                value={newBuddy.displayName}
                onChange={(e) => setNewBuddy((b) => ({ ...b, displayName: e.target.value }))}
                placeholder="Math Whiz"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Internal name (auto)</label>
              <input
                type="text"
                value={newBuddy.modelName || `study_buddy_${(newBuddy.displayName || "new").toLowerCase().replace(/\s+/g, "_")}`}
                onChange={(e) => setNewBuddy((b) => ({ ...b, modelName: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-mono outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Connect to API (optional)</label>
              <select
                value={newBuddy.providerId ?? ""}
                onChange={(e) => setNewBuddy((b) => ({ ...b, providerId: e.target.value || null }))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-indigo-400 bg-white"
              >
                <option value="">— None (use platform fallback) —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={createBuddy}
              className="w-full h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" /> Create Study Buddy
            </button>
          </div>
        </Modal>
      )}

      {/* Analytics modal (admin only) */}
      {showAnalytics && mode === "admin" && (
        <AnalyticsModal
          data={analyticsData}
          range={analyticsRange}
          onRangeChange={setAnalyticsRange}
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  );
}

// Small modal wrapper
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// =====================================================================
// Analytics modal — usage analytics dashboard
// =====================================================================
function AnalyticsModal({ data, range, onRangeChange, onClose }: { data: any; range: string; onRangeChange: (r: "24h" | "7d" | "30d") => void; onClose: () => void }) {
  if (!data) return null;
  const totals = data.totals ?? {};
  return (
    <Modal onClose={onClose} title="📊 Usage Analytics">
      <div className="space-y-3">
        {/* Range picker */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-xs">
          {["24h", "7d", "30d"].map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r as any)}
              className={`flex-1 py-1 rounded-md transition ${range === r ? "bg-white text-indigo-700 font-semibold shadow-sm" : "text-gray-600"}`}
            >
              {r === "24h" ? "24 hours" : r === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-indigo-50 p-3">
            <p className="text-[10px] uppercase font-bold text-indigo-600">Total Calls</p>
            <p className="text-lg font-bold text-indigo-900">{totals.totalCalls ?? 0}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-[10px] uppercase font-bold text-emerald-600">Success Rate</p>
            <p className="text-lg font-bold text-emerald-900">
              {totals.totalCalls ? Math.round((totals.successCount / totals.totalCalls) * 100) : 0}%
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-[10px] uppercase font-bold text-amber-600">Tokens Used</p>
            <p className="text-lg font-bold text-amber-900">{(totals.totalTokens ?? 0).toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-rose-50 p-3">
            <p className="text-[10px] uppercase font-bold text-rose-600">Cost (USD)</p>
            <p className="text-lg font-bold text-rose-900">${(totals.totalCost ?? 0).toFixed(4)}</p>
          </div>
        </div>

        {/* Per-provider breakdown */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">By Provider ({data.groupBy})</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(data.buckets ?? []).map((b: any) => (
              <div key={b.key} className="rounded-lg bg-white border border-gray-200 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-800 truncate">{b.key}</p>
                  <span className="text-[10px] text-gray-500">{b.totalCalls} calls</span>
                </div>
                <div className="flex gap-3 mt-1 text-[10px] text-gray-600">
                  <span className="text-emerald-600">✓ {b.successCount}</span>
                  <span className="text-rose-500">✗ {b.errorCount}</span>
                  <span>{(b.totalTokens ?? 0).toLocaleString()} tokens</span>
                  <span className="text-amber-600">${(b.totalCost ?? 0).toFixed(4)}</span>
                </div>
                {/* Mini sparkline — calls per day */}
                {Array.isArray(b.byDay) && b.byDay.length > 1 && (
                  <div className="flex items-end gap-0.5 mt-1 h-6">
                    {b.byDay.map((d: any, i: number) => {
                      const max = Math.max(...b.byDay.map((x: any) => x.calls), 1);
                      return (
                        <div
                          key={i}
                          style={{ height: `${(d.calls / max) * 100}%`, background: "#4F46E5", opacity: 0.4 + 0.6 * (d.calls / max), flex: 1, minWidth: 2 }}
                          title={`${d.day}: ${d.calls} calls`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {(!data.buckets || data.buckets.length === 0) && (
              <p className="text-xs text-gray-400 text-center p-3 italic">No usage in this range.</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
