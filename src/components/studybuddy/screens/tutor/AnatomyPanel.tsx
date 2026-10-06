"use client";

export function AnatomyPanel({ spec }: { spec: any }) {
  const labels = Array.isArray(spec?.labels) ? spec.labels : [];
  const system = spec?.system || spec?.bodySystem || "General";
  const description = spec?.description || spec?.explanation || "";

  if (labels.length === 0 && !description) {
    return <div className="p-3 text-center text-xs text-gray-400">No anatomy data provided.</div>;
  }

  // SVG-based body outline with label markers
  return (
    <div className="p-3 space-y-3">
      <div className="text-center">
        <h3 className="text-sm font-bold text-gray-800">{system}</h3>
        {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      </div>

      {/* Labeled diagram area */}
      <div className="flex justify-center">
        <svg viewBox="0 0 300 400" className="max-w-full" style={{ maxHeight: "350px" }}>
          {/* Body outline */}
          <ellipse cx="150" cy="50" rx="30" ry="35" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="1.5" />
          <rect x="120" y="80" width="60" height="100" rx="8" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="1.5" />
          <rect x="125" y="180" width="50" height="80" rx="5" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="1.5" />
          <rect x="100" y="85" width="18" height="70" rx="8" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="1.5" />
          <rect x="182" y="85" width="18" height="70" rx="8" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="1.5" />
          <rect x="130" y="260" width="16" height="60" rx="5" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="1.5" />
          <rect x="154" y="260" width="16" height="60" rx="5" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="1.5" />

          {/* Labels */}
          {labels.map((label: any, i: number) => {
            const x = label.x || 60;
            const y = label.y || 50 + i * 30;
            const tx = label.targetX || 150;
            const ty = label.targetY || 50 + i * 30;
            const color = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"][i % 6];
            return (
              <g key={i}>
                <line x1={tx} y1={ty} x2={x < 150 ? x + 40 : x} y2={y} stroke={color} strokeWidth="1" strokeDasharray="2,2" />
                <circle cx={tx} cy={ty} r="3" fill={color} />
                <rect x={x < 150 ? x - 5 : x - 5} y={y - 8} width={40 + (label.name || label.label || "").length * 5} height="16" rx="3" fill={color + "22"} stroke={color} strokeWidth="0.5" />
                <text x={x} y={y + 3} fontSize="10" fill={color} fontWeight="bold">{label.name || label.label || `Part ${i + 1}`}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Label list */}
      {labels.length > 0 && (
        <div className="space-y-1">
          {labels.map((label: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"][i % 6] }}>{i + 1}</span>
              <div>
                <span className="font-semibold text-gray-800">{label.name || label.label}</span>
                {label.description && <p className="text-[10px] text-gray-500">{label.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
