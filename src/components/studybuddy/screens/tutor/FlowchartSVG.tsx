"use client";

/**
 * FlowchartSVG — Phase FC
 *
 * Safe React SVG renderer for compiled flowcharts.
 * Does NOT use dangerouslySetInnerHTML. All elements are React-created.
 *
 * Renders:
 *   - Nodes as rectangles / rounded rectangles / diamonds / terminators
 *   - Directed edges with arrowheads
 *   - Labels (wrapped to fit node width)
 *   - Edge labels
 *   - Accessible title + description
 *   - Text summary for screen readers
 *
 * The compiled geometry comes from compileFlowchartLayout().
 * This renderer does NOT compute positions — it only renders them.
 */

import type { CompiledFlowchart, CompiledNode, CompiledEdge } from "@/lib/flowchart-compiler";
import type { FlowchartNodeShape } from "@/lib/flowchart-validator";

// ============================================================
// Constants
// ============================================================

const PALETTE: Record<string, { fill: string; stroke: string }> = {
  rectangle: { fill: "#e0e7ff", stroke: "#4f46e5" },
  rounded_rectangle: { fill: "#dbeafe", stroke: "#2563eb" },
  diamond: { fill: "#fef3c7", stroke: "#d97706" },
  terminator: { fill: "#d1fae5", stroke: "#059669" },
  input_output: { fill: "#fae8ff", stroke: "#9333ea" },
};

const ARROW_COLOR = "#475569";
const EDGE_LABEL_BG = "#f8fafc";
const FONT_SIZE = 14;

// ============================================================
// Component
// ============================================================

export function FlowchartSVG({ compiled, title }: { compiled: CompiledFlowchart; title?: string }) {
  const { nodes, edges, viewport } = compiled;
  const displayTitle = title || "Flowchart";

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-gray-400">
        This flowchart could not be rendered.
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Accessible summary (hidden visually, for screen readers) */}
      <div className="sr-only" role="img" aria-label={`${displayTitle} flowchart`}>
        {displayTitle} flowchart with {nodes.length} steps: {nodes.map(n => n.label).join(", ")}.
        Connections: {edges.map(e => `${e.from} to ${e.to}`).join(", ")}.
      </div>

      <svg
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        className="block w-full h-auto bg-white rounded-lg"
        role="presentation"
        style={{ maxHeight: "600px" }}
      >
        <defs>
          <marker
            id="flowchart-arrow"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,4 L0,8 z" fill={ARROW_COLOR} />
          </marker>
        </defs>

        {/* Background */}
        <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="#ffffff" />

        {/* Edges (rendered before nodes so nodes are on top) */}
        {edges.map((edge) => (
          <EdgeElement key={edge.id} edge={edge} />
        ))}

        {/* Nodes */}
        {nodes.map((node) => (
          <NodeElement key={node.id} node={node} />
        ))}
      </svg>
    </div>
  );
}

// ============================================================
// Node renderer
// ============================================================

function NodeElement({ node }: { node: CompiledNode }) {
  const colors = PALETTE[node.shape] || PALETTE.rectangle;
  const lines = wrapTextForSvg(node.label, 22);

  switch (node.shape) {
    case "rectangle":
      return (
        <g>
          <rect
            x={node.x} y={node.y}
            width={node.width} height={node.height}
            rx={4} ry={4}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth={2}
          />
          {renderTextLines(lines, node.centerX, node.centerY)}
        </g>
      );

    case "rounded_rectangle":
      return (
        <g>
          <rect
            x={node.x} y={node.y}
            width={node.width} height={node.height}
            rx={node.height / 2} ry={node.height / 2}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth={2}
          />
          {renderTextLines(lines, node.centerX, node.centerY)}
        </g>
      );

    case "diamond":
      // Diamond: 4 points from center
      const cx = node.centerX;
      const cy = node.centerY;
      const hw = node.width / 2;
      const hh = node.height / 2;
      return (
        <g>
          <polygon
            points={`${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth={2}
          />
          {renderTextLines(lines, cx, cy)}
        </g>
      );

    case "terminator":
      // Stadium shape (pill)
      return (
        <g>
          <rect
            x={node.x} y={node.y}
            width={node.width} height={node.height}
            rx={node.height / 2} ry={node.height / 2}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth={2}
          />
          {renderTextLines(lines, node.centerX, node.centerY)}
        </g>
      );

    case "input_output":
      // Parallelogram — slanted rectangle (standard ICT input/output shape)
      const skew = 12; // horizontal skew offset
      const px = node.x;
      const py = node.y;
      const pw = node.width;
      const ph = node.height;
      const points = `${px + skew},${py} ${px + pw},${py} ${px + pw - skew},${py + ph} ${px},${py + ph}`;
      return (
        <g>
          <polygon
            points={points}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth={2}
          />
          {renderTextLines(lines, node.centerX, node.centerY)}
        </g>
      );

    default:
      return null;
  }
}

// ============================================================
// Edge renderer
// ============================================================

function EdgeElement({ edge }: { edge: CompiledEdge }) {
  if (edge.points.length < 2) return null;

  const path = edge.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Edge label at midpoint
  const midIdx = Math.floor(edge.points.length / 2);
  const midPoint = edge.points[midIdx] ?? edge.points[0];

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={ARROW_COLOR}
        strokeWidth={2}
        markerEnd="url(#flowchart-arrow)"
      />
      {edge.label && (
        <g>
          <rect
            x={midPoint.x - edge.label.length * 3.5 - 4}
            y={midPoint.y - 10}
            width={edge.label.length * 7 + 8}
            height={20}
            rx={4}
            fill={EDGE_LABEL_BG}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          <text
            x={midPoint.x}
            y={midPoint.y + 4}
            textAnchor="middle"
            fontSize={11}
            fill="#475569"
            fontFamily="system-ui, sans-serif"
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}

// ============================================================
// Helpers
// ============================================================

function wrapTextForSvg(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function renderTextLines(lines: string[], centerX: number, centerY: number) {
  const lineHeight = FONT_SIZE + 4;
  const totalHeight = lines.length * lineHeight;
  const startY = centerY - totalHeight / 2 + lineHeight - 2;

  return lines.map((line, i) => (
    <text
      key={i}
      x={centerX}
      y={startY + i * lineHeight}
      textAnchor="middle"
      fontSize={FONT_SIZE}
      fill="#1e293b"
      fontFamily="system-ui, sans-serif"
      dominantBaseline="middle"
    >
      {line}
    </text>
  ));
}
