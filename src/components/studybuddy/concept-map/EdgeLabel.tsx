"use client";

import { memo } from "react";
import { EdgeLabelRenderer, type EdgeProps, getBezierPath } from "reactflow";

/**
 * Custom React Flow edge that shows the label as a styled HTML badge
 * in the middle of the curve (instead of the default SVG-rendered label,
 * which often gets clipped).
 */
function EdgeLabelComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  data,
  label,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      {/* Invisible wide path for easier hover/click */}
      <path
        d={path}
        id={id}
        style={{
          stroke: "transparent",
          strokeWidth: 12,
          fill: "none",
        }}
      />
      {/* Visible path */}
      <path
        d={path}
        style={{
          stroke: "#c7d2fe",
          strokeWidth: 2,
          fill: "none",
        }}
        markerEnd="url(#arrowclosed)"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="bg-white px-1.5 py-0.5 rounded-md border border-gray-200 shadow-sm text-[10px] font-medium text-gray-700"
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const EdgeLabel = memo(EdgeLabelComponent);
