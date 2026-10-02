"use client";

/**
 * FlowchartRenderer — Phase FC
 *
 * Lazy-loaded wrapper that dynamically imports the flowchart validator,
 * compiler, and SVG renderer ONLY when a flowchart_v1 attachment is opened.
 *
 * When NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED is false, renders a safe
 * fallback message instead of loading any flowchart code.
 *
 * This keeps the flowchart code (validator + compiler + SVG renderer ≈ 700 lines)
 * out of the initial bundle — it only loads when needed.
 */

import { useState, useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

const USE_FLOWCHART_RENDERER = process.env.NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED === "true";

type Props = {
  spec: any;
  compact?: boolean; // compact card mode (workspace notification)
};

export function FlowchartRenderer({ spec, compact }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    title: string;
    nodeCount: number;
    direction: string;
    nodeLabels: string[];
    compiled: any;
  } | null>(null);

  useEffect(() => {
    if (!USE_FLOWCHART_RENDERER) {
      setError("Flowchart rendering is not enabled.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [{ validateFlowchartPlan }, { compileFlowchartLayout }, { FlowchartSVG }] = await Promise.all([
          import("@/lib/flowchart-validator"),
          import("@/lib/flowchart-compiler"),
          import("./FlowchartSVG"),
        ]);

        const validation = validateFlowchartPlan(spec);
        if (!validation.valid || !validation.plan) {
          if (!cancelled) setError("This flowchart could not be displayed.");
          return;
        }

        const compiled = compileFlowchartLayout(validation.plan!);
        if (!cancelled) {
          setResult({
            title: validation.plan!.title,
            nodeCount: validation.plan!.nodes.length,
            direction: validation.plan!.direction,
            nodeLabels: validation.plan!.nodes.map(n => n.label),
            compiled,
          });
          setLoaded(true);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load flowchart renderer.");
      }
    })();

    return () => { cancelled = true; };
  }, [spec]);

  // Not enabled — safe fallback
  if (!USE_FLOWCHART_RENDERER) {
    return (
      <div className="rounded-xl border border-gray-200 p-3 mt-2">
        <p className="text-xs text-gray-500">🔀 Flowchart attachment (renderer not enabled)</p>
      </div>
    );
  }

  // Loading
  if (!loaded && !error) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
        <span className="ml-2 text-xs text-gray-500">Loading flowchart…</span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 p-3 mt-2">
        <p className="text-xs text-gray-500">⚠️ {error}</p>
      </div>
    );
  }

  // Render the compiled flowchart
  // We dynamically import FlowchartSVG, so we render it via a lazy wrapper
  return <LazyFlowchartSVGWrapper compiled={result!.compiled} title={result!.title} nodeCount={result!.nodeCount} direction={result!.direction} nodeLabels={result!.nodeLabels} compact={compact} />;
}

// ============================================================
// Lazy SVG wrapper — renders FlowchartSVG once loaded
// ============================================================

function LazyFlowchartSVGWrapper({
  compiled, title, nodeCount, direction, nodeLabels, compact,
}: {
  compiled: any;
  title: string;
  nodeCount: number;
  direction: string;
  nodeLabels: string[];
  compact?: boolean;
}) {
  const [SvgComponent, setSvgComponent] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    import("./FlowchartSVG").then(({ FlowchartSVG }) => {
      if (!cancelled) setSvgComponent(() => FlowchartSVG);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!SvgComponent) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      {compact ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔀</span>
            <p className="text-xs font-bold text-gray-900">{title}</p>
          </div>
          <SvgComponent compiled={compiled} title={title} />
          <p className="text-[9px] text-gray-400 text-center mt-1">
            {nodeCount} steps · {direction === "top_to_bottom" ? "↓" : "→"} flow
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-3 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔀</span>
            <span className="text-[10px] font-bold uppercase text-indigo-500">Flowchart</span>
          </div>
          <SvgComponent compiled={compiled} title={title} />
        </div>
      )}
    </div>
  );
}
