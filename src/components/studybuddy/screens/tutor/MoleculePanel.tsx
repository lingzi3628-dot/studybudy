"use client";

export function MoleculePanel({ spec }: { spec: any }) {
  const atoms = Array.isArray(spec?.atoms) ? spec.atoms : [];
  const bonds = Array.isArray(spec?.bonds) ? spec.bonds : [];
  const reaction = spec?.reaction;

  if (reaction && !atoms.length) {
    return (
      <div className="p-4">
        <div className="text-center p-4 rounded-2xl bg-blue-50 border border-blue-200">
          <p className="text-sm font-bold text-blue-800">{reaction.reactants || "?"} → {reaction.products || "?"}</p>
          {reaction.conditions && <p className="text-xs text-blue-600 mt-1">Conditions: {reaction.conditions}</p>}
          {reaction.type && <p className="text-[10px] text-blue-400 mt-0.5">Type: {reaction.type}</p>}
        </div>
        {reaction.steps && Array.isArray(reaction.steps) && (
          <ol className="mt-3 space-y-1">
            {reaction.steps.map((step: any, i: number) => (
              <li key={i} className="text-xs text-gray-600 flex gap-2">
                <span className="font-bold text-indigo-500">{i + 1}.</span>
                <span>{typeof step === "string" ? step : step?.description || JSON.stringify(step)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  if (!atoms.length) {
    return <div className="p-3 text-center text-xs text-gray-400">No molecule data provided.</div>;
  }

  const elementColors: Record<string, string> = {
    H: "#E5E7EB", C: "#374151", N: "#3B82F6", O: "#EF4444", Cl: "#10B981",
    Na: "#F59E0B", K: "#8B5CF6", Ca: "#6366F1", Fe: "#7C2D12", S: "#EAB308",
    P: "#F97316", F: "#22D3EE", Br: "#A855F7", I: "#8B1A1A",
  };

  const radius = 200;
  const cx = 200;
  const cy = 150;
  const n = atoms.length;

  return (
    <div className="p-2 flex justify-center">
      <svg viewBox="0 0 400 300" className="max-w-full" style={{ maxHeight: "300px" }}>
        {/* Bonds */}
        {bonds.map((b: any, i: number) => {
          const a1 = atoms[b.from];
          const a2 = atoms[b.to];
          if (!a1 || !a2) return null;
          const x1 = cx + radius * Math.cos((2 * Math.PI * b.from) / n);
          const y1 = cy + radius * Math.sin((2 * Math.PI * b.from) / n);
          const x2 = cx + radius * Math.cos((2 * Math.PI * b.to) / n);
          const y2 = cy + radius * Math.sin((2 * Math.PI * b.to) / n);
          return <line key={`b${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9CA3AF" strokeWidth={b.double ? 4 : 2} />;
        })}

        {/* Atoms */}
        {atoms.map((a: any, i: number) => {
          const x = cx + radius * Math.cos((2 * Math.PI * i) / n);
          const y = cy + radius * Math.sin((2 * Math.PI * i) / n);
          const symbol = a.symbol || a.element || "?";
          const color = elementColors[symbol] || "#9CA3AF";
          return (
            <g key={`a${i}`}>
              <circle cx={x} cy={y} r={14} fill={color} stroke="#fff" strokeWidth={2} />
              <text x={x} y={y + 4} fontSize="11" fill={symbol === "H" || symbol === "C" ? "#fff" : "#fff"} fontWeight="bold" textAnchor="middle">{symbol}</text>
            </g>
          );
        })}

        {/* Title */}
        {spec?.title && <text x={200} y={290} fontSize="12" fill="#374151" fontWeight="bold" textAnchor="middle">{spec.title}</text>}
      </svg>
    </div>
  );
}
