"use client";

export function FreeBodyPanel({ spec }: { spec: any }) {
  const elements = Array.isArray(spec?.elements) ? spec.elements : [];
  const forces = Array.isArray(spec?.forces) ? spec.forces : [];
  const body = spec?.body || { kind: "rect", x: 150, y: 100, w: 100, h: 60, label: "Object" };
  const allItems = [...elements, ...forces];

  if (allItems.length === 0) {
    return <div className="p-3 text-center text-xs text-gray-400">No free-body diagram data provided.</div>;
  }

  const arrowColor = "#EF4444";
  const bodyColor = "#3B82F6";

  return (
    <div className="p-2 flex justify-center">
      <svg viewBox="0 0 400 300" className="max-w-full" style={{ maxHeight: "300px" }}>
        {/* Grid */}
        <defs>
          <pattern id="fbd-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="400" height="300" fill="url(#fbd-grid)" />

        {/* Body */}
        {body.kind === "circle" ? (
          <circle cx={body.cx || 200} cy={body.cy || 150} r={body.r || 30} fill={bodyColor + "33"} stroke={bodyColor} strokeWidth={2} />
        ) : (
          <rect x={body.x || 150} y={body.y || 100} width={body.w || 100} height={body.h || 60} fill={bodyColor + "33"} stroke={bodyColor} strokeWidth={2} />
        )}
        {body.label && (
          <text x={(body.x || 150) + (body.w || 100) / 2} y={(body.y || 100) + (body.h || 60) / 2 + 5} fontSize="12" fill={bodyColor} fontWeight="bold" textAnchor="middle">{body.label}</text>
        )}

        {/* Forces (arrows) */}
        {forces.map((f: any, i: number) => {
          const fx = f.x || (body.x || 150) + (body.w || 100) / 2;
          const fy = f.y || (body.y || 100) + (body.h || 60) / 2;
          const magnitude = f.magnitude || 50;
          const angle = (f.angle || 0) * Math.PI / 180;
          const ex = fx + magnitude * Math.cos(angle);
          const ey = fy + magnitude * Math.sin(angle);
          return (
            <g key={`f${i}`}>
              <defs>
                <marker id={`arrow-${i}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 7 3, 0 6" fill={arrowColor} />
                </marker>
              </defs>
              <line x1={fx} y1={fy} x2={ex} y2={ey} stroke={arrowColor} strokeWidth={2} markerEnd={`url(#arrow-${i})`} />
              {f.label && <text x={ex + 5} y={ey - 5} fontSize="11" fill={arrowColor} fontWeight="bold">{f.label}</text>}
              {f.value && <text x={ex + 5} y={ey + 8} fontSize="9" fill={arrowColor}>{f.value}N</text>}
            </g>
          );
        })}

        {/* Extra elements (angles, labels) */}
        {elements.map((e: any, i: number) => {
          if (e.kind === "label") {
            return <text key={`e${i}`} x={e.x} y={e.y} fontSize="11" fill="#374151" fontWeight="bold" textAnchor="middle">{e.text}</text>;
          }
          return null;
        })}
      </svg>
    </div>
  );
}
