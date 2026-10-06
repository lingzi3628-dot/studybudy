"use client";
import { useMemo } from "react";

export function GeometryPanel({ spec }: { spec: any }) {
  const elements = Array.isArray(spec?.elements) ? spec.elements : [];
  const shapes = Array.isArray(spec?.shapes) ? spec.shapes : elements;
  const width = spec?.width || 500;
  const height = spec?.height || 400;

  if (shapes.length === 0) {
    return <div className="p-3 text-center text-xs text-gray-400">No geometry shapes provided.</div>;
  }

  const shapeColors: Record<string, string> = {
    circle: "#3B82F6", triangle: "#10B981", line: "#F59E0B",
    angle: "#EF4444", point: "#8B5CF6", polygon: "#EC4899",
    arc: "#6366F1", label: "#374151",
  };

  return (
    <div className="p-2 flex justify-center">
      <svg viewBox={`0 0 ${width} ${height}`} className="max-w-full" style={{ maxHeight: "400px" }}>
        {/* Grid */}
        <defs>
          <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#grid)" />

        {shapes.map((s: any, i: number) => {
          const color = s.color || shapeColors[s.kind] || "#374151";
          switch (s.kind) {
            case "circle":
              return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={color} strokeWidth={2} />;
            case "triangle":
              return <polygon key={i} points={s.points?.map((p: number[]) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={2} />;
            case "line":
              return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth={2} markerEnd="url(#arrow)" />;
            case "angle":
              return (
                <g key={i}>
                  <path d={`M ${s.cx + 20} ${s.cy} A 20 20 0 0 ${s.reflex ? 1 : 0} ${s.cx + 20 * Math.cos((s.degrees || 45) * Math.PI / 180)} ${s.cy + 20 * Math.sin((s.degrees || 45) * Math.PI / 180)}`} fill="none" stroke={color} strokeWidth={2} />
                  <text x={s.cx + 25} y={s.cy + 5} fontSize="11" fill={color} fontWeight="bold">{s.degrees}°</text>
                </g>
              );
            case "point":
              return (
                <g key={i}>
                  <circle cx={s.x} cy={s.y} r={3} fill={color} />
                  {s.label && <text x={s.x + 6} y={s.y - 6} fontSize="11" fill={color} fontWeight="bold">{s.label}</text>}
                </g>
              );
            case "polygon":
              return <polygon key={i} points={s.points?.map((p: number[]) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={2} />;
            case "arc":
              return <path key={i} d={`M ${s.x1} ${s.y1} A ${s.r} ${s.r} 0 0 1 ${s.x2} ${s.y2}`} fill="none" stroke={color} strokeWidth={2} />;
            case "label":
              return <text key={i} x={s.x} y={s.y} fontSize="12" fill={color} fontWeight="bold" textAnchor="middle">{s.text}</text>;
            default:
              return null;
          }
        })}

        {/* Arrow marker */}
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 7 3, 0 6" fill="#F59E0B" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
