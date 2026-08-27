"use client";

import { type ReactElement } from "react";

// =====================================================================
// GraphRenderers — Phase 28+
//
// A modular dispatcher that renders many different kinds of graphs as
// inline SVG, based on a JSON spec produced by the AI Tutor.
//
// Supported types:
//   1. function       — y = f(x) line plot (math)
//   2. scatter        — data points + optional line of best fit (physics/data)
//   3. bar            — vertical bar chart with categories
//   4. histogram      — like bar but no gaps, for frequency distributions
//   5. pie            — pie chart with labeled slices
//   6. venn           — 2 or 3-set Venn diagram (probability/sets)
//   7. numberline     — number line with shaded ranges (inequalities)
//   8. tree           — probability tree diagram
//   9. network        — node/edge graph (graph theory, social networks)
//  10. vector         — vector arrows on a coordinate plane
//  11. polygon        — 2D geometric figure with labeled vertices/angles
//  12. boxplot        — box-and-whisker plot (statistics)
//
// Each renderer takes a `spec: any` prop (the parsed JSON from the AI).
// All are pure SVG so they work in any modern browser, no external deps.
// =====================================================================

export type GraphSpec = Record<string, any> & { type?: string };

const PALETTE = [
  "#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#6366F1",
];

// =====================================================================
// Main dispatcher
// =====================================================================
export function GraphRenderer({ spec }: { spec: GraphSpec }) {
  const type = (spec?.type ?? "function").toString();
  switch (type) {
    case "function":
      return <FunctionSVG spec={spec} />;
    case "scatter":
      return <ScatterSVG spec={spec} />;
    case "bar":
      return <BarChartSVG spec={spec} />;
    case "histogram":
      return <HistogramSVG spec={spec} />;
    case "pie":
      return <PieChartSVG spec={spec} />;
    case "venn":
      return <VennSVG spec={spec} />;
    case "numberline":
      return <NumberLineSVG spec={spec} />;
    case "tree":
      return <TreeSVG spec={spec} />;
    case "network":
      return <NetworkSVG spec={spec} />;
    case "vector":
      return <VectorSVG spec={spec} />;
    case "polygon":
      return <PolygonSVG spec={spec} />;
    case "boxplot":
      return <BoxPlotSVG spec={spec} />;
    default:
      return (
        <div className="text-xs text-rose-600 p-3">
          Unknown graph type: <code>{type}</code>. Available types: function,
          scatter, bar, histogram, pie, venn, numberline, tree, network,
          vector, polygon, boxplot.
        </div>
      );
  }
}

// =====================================================================
// 1. Function plot (y = f(x))
// =====================================================================
function FunctionSVG({ spec }: { spec: any }) {
  const expr = spec.expr || "x^2";
  const xRange: [number, number] = spec.xRange ?? [-5, 5];
  const yRange: [number, number] = spec.yRange ?? [-25, 25];
  const title = spec.title || `y = ${expr}`;
  const xLabel = spec.xLabel ?? "x";
  const yLabel = spec.yLabel ?? "y";
  const width = 480;
  const height = 320;
  const padding = 40;

  const evaluate = (x: number): number | null => {
    try {
      let safeExpr = expr
        .replace(/\^/g, "**")
        .replace(/\bpi\b/gi, "Math.PI")
        .replace(/\be\b/g, "Math.E")
        .replace(/\bsin\(/g, "Math.sin(")
        .replace(/\bcos\(/g, "Math.cos(")
        .replace(/\btan\(/g, "Math.tan(")
        .replace(/\bsqrt\(/g, "Math.sqrt(")
        .replace(/\blog\(/g, "Math.log(")
        .replace(/\bexp\(/g, "Math.exp(")
        .replace(/\babs\(/g, "Math.abs(")
        .replace(/\bx\b/g, String(x));
      // eslint-disable-next-line no-new-func
      const fn = new Function("Math", `"use strict"; return (${safeExpr});`);
      const result = fn(Math);
      return typeof result === "number" && isFinite(result) ? result : null;
    } catch {
      return null;
    }
  };

  const points: Array<{ x: number; y: number }> = [];
  const samples = 100;
  for (let i = 0; i <= samples; i++) {
    const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / samples;
    const y = evaluate(x);
    if (y !== null) points.push({ x, y });
  }

  const toSvgX = (x: number) => padding + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (width - 2 * padding);
  const toSvgY = (y: number) =>
    height - padding - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (height - 2 * padding);

  const path = points
    .filter((p) => p.y >= yRange[0] && p.y <= yRange[1])
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toSvgX(p.x).toFixed(2)} ${toSvgY(p.y).toFixed(2)}`)
    .join(" ");

  const xAxisY = yRange[0] <= 0 && yRange[1] >= 0 ? toSvgY(0) : height - padding;
  const yAxisX = xRange[0] <= 0 && xRange[1] >= 0 ? toSvgX(0) : padding;

  const xTicks: ReactElement[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const xv = xRange[0] + ((xRange[1] - xRange[0]) * i) / tickCount;
    xTicks.push(
      <g key={`xt-${i}`}>
        <line x1={toSvgX(xv)} y1={xAxisY - 4} x2={toSvgX(xv)} y2={xAxisY + 4} stroke="#9CA3AF" strokeWidth={1} />
        <text x={toSvgX(xv)} y={xAxisY + 16} fontSize={10} fill="#6B7280" textAnchor="middle">
          {xv.toFixed(1)}
        </text>
      </g>
    );
  }

  const yTicks: ReactElement[] = [];
  for (let i = 0; i <= tickCount; i++) {
    const yv = yRange[0] + ((yRange[1] - yRange[0]) * i) / tickCount;
    yTicks.push(
      <g key={`yt-${i}`}>
        <line x1={yAxisX - 4} y1={toSvgY(yv)} x2={yAxisX + 4} y2={toSvgY(yv)} stroke="#9CA3AF" strokeWidth={1} />
        <text x={yAxisX - 8} y={toSvgY(yv) + 3} fontSize={10} fill="#6B7280" textAnchor="end">
          {yv.toFixed(0)}
        </text>
      </g>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {xTicks}
        {yTicks}
        <line x1={padding} y1={xAxisY} x2={width - padding} y2={xAxisY} stroke="#374151" strokeWidth={1.5} />
        <line x1={yAxisX} y1={padding} x2={yAxisX} y2={height - padding} stroke="#374151" strokeWidth={1.5} />
        {path && <path d={path} fill="none" stroke="#4F46E5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        <text x={width / 2} y={height - 5} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>
        <text x={12} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 12, ${height / 2})`}>{yLabel}</text>
      </svg>
    </div>
  );
}

// =====================================================================
// 2. Scatter plot + optional line of best fit (DATA POINTS)
// This directly addresses the user's physics velocity-time request.
// =====================================================================
function ScatterSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Scatter Plot";
  const xLabel = spec.xLabel ?? "x";
  const yLabel = spec.yLabel ?? "y";
  const points: Array<[number, number]> = Array.isArray(spec.points) ? spec.points : [];
  const showBestFit = spec.lineOfBestFit !== false;

  // Compute ranges from data (with optional override)
  const allX = points.map((p) => p[0]);
  const allY = points.map((p) => p[1]);
  let xMin = spec.xRange?.[0] ?? Math.min(...allX);
  let xMax = spec.xRange?.[1] ?? Math.max(...allX);
  let yMin = spec.yRange?.[0] ?? Math.min(...allY);
  let yMax = spec.yRange?.[1] ?? Math.max(...allY);
  // Padding
  const xPad = (xMax - xMin) * 0.1 || 1;
  const yPad = (yMax - yMin) * 0.1 || 1;
  if (!spec.xRange) { xMin -= xPad; xMax += xPad; }
  if (!spec.yRange) { yMin -= yPad; yMax += yPad; }
  if (yMin > 0 && spec.yRange?.[0] === undefined) yMin = 0;
  if (xMin > 0 && spec.xRange?.[0] === undefined) xMin = 0;

  const width = 480;
  const height = 320;
  const padding = 50;

  const toSvgX = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * (width - 2 * padding);
  const toSvgY = (y: number) =>
    height - padding - ((y - yMin) / (yMax - yMin)) * (height - 2 * padding);

  // Linear regression for best fit line: y = mx + b
  let bestFitPath: string | null = null;
  let slope = 0;
  let intercept = 0;
  if (showBestFit && points.length >= 2) {
    const n = points.length;
    const sumX = allX.reduce((a, b) => a + b, 0);
    const sumY = allY.reduce((a, b) => a + b, 0);
    const sumXY = points.reduce((s, p) => s + p[0] * p[1], 0);
    const sumXX = allX.reduce((s, x) => s + x * x, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom !== 0) {
      slope = (n * sumXY - sumX * sumY) / denom;
      intercept = (sumY - slope * sumX) / n;
      const yAtXMin = slope * xMin + intercept;
      const yAtXMax = slope * xMax + intercept;
      bestFitPath = `M ${toSvgX(xMin).toFixed(2)} ${toSvgY(yAtXMin).toFixed(2)} L ${toSvgX(xMax).toFixed(2)} ${toSvgY(yAtXMax).toFixed(2)}`;
    }
  }

  // Ticks
  const xTicks: ReactElement[] = [];
  const yTicks: ReactElement[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const xv = xMin + ((xMax - xMin) * i) / tickCount;
    xTicks.push(
      <g key={`xt-${i}`}>
        <line x1={toSvgX(xv)} y1={toSvgY(yMin) - 4} x2={toSvgX(xv)} y2={toSvgY(yMin) + 4} stroke="#9CA3AF" strokeWidth={1} />
        <text x={toSvgX(xv)} y={toSvgY(yMin) + 18} fontSize={10} fill="#6B7280" textAnchor="middle">
          {Number.isInteger(xv) ? xv : xv.toFixed(1)}
        </text>
      </g>
    );
  }
  for (let i = 0; i <= tickCount; i++) {
    const yv = yMin + ((yMax - yMin) * i) / tickCount;
    yTicks.push(
      <g key={`yt-${i}`}>
        <line x1={toSvgX(xMin) - 4} y1={toSvgY(yv)} x2={toSvgX(xMin) + 4} y2={toSvgY(yv)} stroke="#9CA3AF" strokeWidth={1} />
        <text x={toSvgX(xMin) - 8} y={toSvgY(yv) + 3} fontSize={10} fill="#6B7280" textAnchor="end">
          {Number.isInteger(yv) ? yv : yv.toFixed(0)}
        </text>
      </g>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Grid lines */}
        {xTicks}
        {yTicks}
        {/* Axes */}
        <line x1={toSvgX(xMin)} y1={toSvgY(yMin)} x2={toSvgX(xMax)} y2={toSvgY(yMin)} stroke="#374151" strokeWidth={1.5} />
        <line x1={toSvgX(xMin)} y1={toSvgY(yMin)} x2={toSvgX(xMin)} y2={toSvgY(yMax)} stroke="#374151" strokeWidth={1.5} />
        {/* Best fit line */}
        {bestFitPath && <path d={bestFitPath} fill="none" stroke="#EF4444" strokeWidth={2} strokeDasharray="6 4" opacity={0.85} />}
        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={toSvgX(p[0])}
            cy={toSvgY(p[1])}
            r={5}
            fill="#4F46E5"
            stroke="white"
            strokeWidth={1.5}
          />
        ))}
        {/* Labels */}
        <text x={width / 2} y={height - 8} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>
        <text x={14} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 14, ${height / 2})`}>{yLabel}</text>
      </svg>
      {showBestFit && bestFitPath && (
        <p className="text-[10px] text-gray-500 mt-1">
          Line of best fit: <span className="font-mono font-semibold">y = {slope.toFixed(3)}x {intercept >= 0 ? "+" : "−"} {Math.abs(intercept).toFixed(3)}</span>
        </p>
      )}
    </div>
  );
}

// =====================================================================
// 3. Bar chart (vertical bars with categories)
// =====================================================================
function BarChartSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Bar Chart";
  const xLabel = spec.xLabel ?? "";
  const yLabel = spec.yLabel ?? "";
  const categories: string[] = Array.isArray(spec.categories) ? spec.categories : [];
  const values: number[] = Array.isArray(spec.values) ? spec.values : [];
  const colors: string[] = Array.isArray(spec.colors) ? spec.colors : [];

  const width = 480;
  const height = 320;
  const padding = { left: 50, right: 20, top: 30, bottom: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const yMax = Math.max(...values, 0) * 1.1 || 10;
  const yMin = Math.min(...values, 0);
  const yRange = yMax - yMin || 1;

  const toSvgY = (v: number) => padding.top + plotH - ((v - yMin) / yRange) * plotH;

  const barWidth = plotW / Math.max(categories.length, 1);
  const barInnerWidth = barWidth * 0.65;

  // Y ticks
  const yTicks: ReactElement[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const yv = yMin + (yRange * i) / tickCount;
    yTicks.push(
      <g key={`yt-${i}`}>
        <line x1={padding.left - 4} y1={toSvgY(yv)} x2={padding.left + plotW} y2={toSvgY(yv)} stroke="#E5E7EB" strokeWidth={1} />
        <text x={padding.left - 8} y={toSvgY(yv) + 3} fontSize={10} fill="#6B7280" textAnchor="end">
          {yv.toFixed(0)}
        </text>
      </g>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {yTicks}
        {/* Bars */}
        {categories.map((cat, i) => {
          const v = values[i] ?? 0;
          const barH = ((v - yMin) / yRange) * plotH;
          const x = padding.left + i * barWidth + (barWidth - barInnerWidth) / 2;
          const y = padding.top + plotH - barH;
          const color = colors[i] ?? PALETTE[i % PALETTE.length];
          return (
            <g key={`bar-${i}`}>
              <rect x={x} y={y} width={barInnerWidth} height={Math.max(0, barH)} fill={color} rx={3} opacity={0.9} />
              <text x={x + barInnerWidth / 2} y={y - 4} fontSize={10} fill="#374151" textAnchor="middle" fontWeight={600}>
                {v}
              </text>
              <text x={x + barInnerWidth / 2} y={padding.top + plotH + 14} fontSize={10} fill="#374151" textAnchor="middle">
                {cat.length > 10 ? cat.slice(0, 10) + "…" : cat}
              </text>
            </g>
          );
        })}
        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        <line x1={padding.left} y1={padding.top + plotH} x2={padding.left + plotW} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        {xLabel && <text x={width / 2} y={height - 8} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>}
        {yLabel && <text x={14} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 14, ${height / 2})`}>{yLabel}</text>}
      </svg>
    </div>
  );
}

// =====================================================================
// 4. Histogram (like bar but no gaps)
// =====================================================================
function HistogramSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Histogram";
  const xLabel = spec.xLabel ?? "";
  const yLabel = spec.yLabel ?? "Frequency";
  const bins: Array<{ start: number; end: number; count: number }> = Array.isArray(spec.bins)
    ? spec.bins
    : [];
  const width = 480;
  const height = 320;
  const padding = { left: 50, right: 20, top: 30, bottom: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  if (bins.length === 0) {
    return <p className="text-xs text-gray-500">No bins provided for histogram.</p>;
  }
  const xMin = Math.min(...bins.map((b) => b.start));
  const xMax = Math.max(...bins.map((b) => b.end));
  const yMax = Math.max(...bins.map((b) => b.count)) * 1.1 || 10;
  const xRange = xMax - xMin || 1;

  const toSvgX = (x: number) => padding.left + ((x - xMin) / xRange) * plotW;
  const toSvgY = (v: number) => padding.top + plotH - (v / yMax) * plotH;

  const yTicks: ReactElement[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const yv = (yMax * i) / tickCount;
    yTicks.push(
      <g key={`yt-${i}`}>
        <line x1={padding.left - 4} y1={toSvgY(yv)} x2={padding.left + plotW} y2={toSvgY(yv)} stroke="#E5E7EB" strokeWidth={1} />
        <text x={padding.left - 8} y={toSvgY(yv) + 3} fontSize={10} fill="#6B7280" textAnchor="end">
          {yv.toFixed(0)}
        </text>
      </g>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {yTicks}
        {bins.map((b, i) => {
          const x = toSvgX(b.start);
          const w = toSvgX(b.end) - toSvgX(b.start);
          const y = toSvgY(b.count);
          const h = padding.top + plotH - y;
          return (
            <g key={`bin-${i}`}>
              <rect x={x} y={y} width={w} height={Math.max(0, h)} fill={PALETTE[i % PALETTE.length]} opacity={0.85} stroke="white" strokeWidth={1} />
              <text x={x + w / 2} y={y - 4} fontSize={10} fill="#374151" textAnchor="middle" fontWeight={600}>
                {b.count}
              </text>
              <text x={x + w / 2} y={padding.top + plotH + 14} fontSize={9} fill="#6B7280" textAnchor="middle">
                {b.start}-{b.end}
              </text>
            </g>
          );
        })}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        <line x1={padding.left} y1={padding.top + plotH} x2={padding.left + plotW} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        {xLabel && <text x={width / 2} y={height - 8} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>}
        {yLabel && <text x={14} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 14, ${height / 2})`}>{yLabel}</text>}
      </svg>
    </div>
  );
}

// =====================================================================
// 5. Pie chart (with labeled slices)
// =====================================================================
function PieChartSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Pie Chart";
  const slices: Array<{ label: string; value: number; color?: string }> = Array.isArray(spec.slices)
    ? spec.slices
    : [];
  const total = slices.reduce((s, sl) => s + (sl.value ?? 0), 0) || 1;
  const width = 420;
  const height = 320;
  const cx = 160;
  const cy = 160;
  const r = 110;

  let cumulativeAngle = -Math.PI / 2; // start at 12 o'clock
  const arcs: ReactElement[] = [];
  const legend: ReactElement[] = [];
  slices.forEach((sl, i) => {
    const angle = (sl.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumulativeAngle);
    const y1 = cy + r * Math.sin(cumulativeAngle);
    const x2 = cx + r * Math.cos(cumulativeAngle + angle);
    const y2 = cy + r * Math.sin(cumulativeAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const color = sl.color ?? PALETTE[i % PALETTE.length];
    const path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    arcs.push(
      <path key={`arc-${i}`} d={path} fill={color} stroke="white" strokeWidth={2} opacity={0.9} />
    );
    // Percentage label at slice center
    const midAngle = cumulativeAngle + angle / 2;
    const labelX = cx + (r * 0.65) * Math.cos(midAngle);
    const labelY = cy + (r * 0.65) * Math.sin(midAngle);
    const pct = ((sl.value / total) * 100).toFixed(1);
    arcs.push(
      <text key={`pct-${i}`} x={labelX} y={labelY + 4} fontSize={11} fill="white" textAnchor="middle" fontWeight={700}>
        {pct}%
      </text>
    );
    // Legend
    legend.push(
      <div key={`leg-${i}`} className="flex items-center gap-1.5 text-[10px]">
        <span style={{ background: color, width: 10, height: 10, borderRadius: 2, display: "inline-block" }} />
        <span className="text-gray-700">{sl.label} ({pct}%)</span>
      </div>
    );
    cumulativeAngle += angle;
  });

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full sm:w-1/2 h-auto bg-gray-50 rounded-lg">
          {arcs}
          <text x={cx} y={cy + 4} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={700}>Total: {total}</text>
        </svg>
        <div className="flex-1 space-y-1">{legend}</div>
      </div>
    </div>
  );
}

// =====================================================================
// 6. Venn diagram (2 or 3 sets)
// =====================================================================
function VennSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Venn Diagram";
  const sets: Array<{ label: string; color?: string; value?: number }> = Array.isArray(spec.sets) ? spec.sets : [];
  const width = 380;
  const height = 280;
  const cx = 190;
  const cy = 140;
  const r = 90;
  const overlap = 35;

  // 2 sets: side by side, 3 sets: triangle
  const positions: Array<{ x: number; y: number }> = sets.length === 3
    ? [
        { x: cx - 35, y: cy - 30 },
        { x: cx + 35, y: cy - 30 },
        { x: cx, y: cy + 30 },
      ]
    : [
        { x: cx - overlap, y: cy },
        { x: cx + overlap, y: cy },
      ];

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {sets.map((s, i) => {
          const color = s.color ?? PALETTE[i % PALETTE.length];
          const pos = positions[i] ?? { x: cx, y: cy };
          return (
            <g key={`set-${i}`}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={color}
                fillOpacity={0.35}
                stroke={color}
                strokeWidth={2}
              />
              <text
                x={pos.x + (i === 0 ? -r * 0.55 : i === 1 ? r * 0.55 : 0)}
                y={pos.y + (i === 2 ? r * 0.55 : -r * 0.55)}
                fontSize={14}
                fill={color}
                fontWeight={700}
                textAnchor="middle"
              >
                {s.label}
              </text>
              {s.value !== undefined && (
                <text
                  x={pos.x + (i === 0 ? -r * 0.55 : i === 1 ? r * 0.55 : 0)}
                  y={pos.y + (i === 2 ? r * 0.55 + 14 : -r * 0.55 + 14)}
                  fontSize={10}
                  fill={color}
                  textAnchor="middle"
                >
                  n={s.value}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =====================================================================
// 7. Number line (with shaded ranges for inequalities)
// =====================================================================
function NumberLineSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Number Line";
  const range: [number, number] = spec.range ?? [-10, 10];
  const markers: Array<{
    value: number;
    label?: string;
    color?: string;
    open?: boolean; // open circle (excluded) vs closed circle (included)
  }> = Array.isArray(spec.markers) ? spec.markers : [];
  const shadedRange: [number, number] | null = Array.isArray(spec.shadedRange) ? spec.shadedRange : null;
  const width = 480;
  const height = 100;
  const padding = 30;
  const lineY = 50;

  const toSvgX = (x: number) =>
    padding + ((x - range[0]) / (range[1] - range[0])) * (width - 2 * padding);

  const ticks: ReactElement[] = [];
  const tickStep = Math.max(1, Math.floor((range[1] - range[0]) / 10));
  for (let x = Math.ceil(range[0]); x <= range[1]; x += tickStep) {
    ticks.push(
      <g key={`tick-${x}`}>
        <line x1={toSvgX(x)} y1={lineY - 6} x2={toSvgX(x)} y2={lineY + 6} stroke="#374151" strokeWidth={1} />
        <text x={toSvgX(x)} y={lineY + 22} fontSize={10} fill="#6B7280" textAnchor="middle">{x}</text>
      </g>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Shaded range */}
        {shadedRange && (
          <rect
            x={toSvgX(shadedRange[0])}
            y={lineY - 4}
            width={toSvgX(shadedRange[1]) - toSvgX(shadedRange[0])}
            height={8}
            fill="#4F46E5"
            fillOpacity={0.35}
          />
        )}
        {/* Main axis */}
        <line x1={padding} y1={lineY} x2={width - padding} y2={lineY} stroke="#374151" strokeWidth={2} />
        {/* Arrow */}
        <polygon points={`${width - padding},${lineY} ${width - padding - 8},${lineY - 4} ${width - padding - 8},${lineY + 4}`} fill="#374151" />
        {/* Ticks */}
        {ticks}
        {/* Markers */}
        {markers.map((m, i) => {
          const x = toSvgX(m.value);
          const color = m.color ?? "#4F46E5";
          return (
            <g key={`m-${i}`}>
              {m.open ? (
                <circle cx={x} cy={lineY} r={6} fill="white" stroke={color} strokeWidth={2.5} />
              ) : (
                <circle cx={x} cy={lineY} r={6} fill={color} />
              )}
              {m.label && (
                <text x={x} y={lineY - 12} fontSize={11} fill={color} textAnchor="middle" fontWeight={700}>
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =====================================================================
// 8. Tree diagram (probability)
// =====================================================================
type TreeNode = {
  label: string;
  probability?: string;
  children?: TreeNode[];
};

function TreeSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Tree Diagram";
  const root: TreeNode = spec.root ?? { label: "Start" };

  const width = 600;
  const height = 380;
  const padding = 30;

  // Layout: BFS to assign positions
  // depth 0 = root at left
  // each level adds more nodes to the right
  type LayoutNode = {
    node: TreeNode;
    x: number;
    y: number;
    depth: number;
    parent?: { x: number; y: number; probability?: string };
  };

  const layoutNodes: LayoutNode[] = [];
  let yCounter = 0;
  const maxDepth = 3;

  function place(node: TreeNode, depth: number, parent?: { x: number; y: number; probability?: string }) {
    if (depth > maxDepth) return;
    const x = padding + depth * 180;
    if (!node.children || node.children.length === 0) {
      const y = padding + yCounter * 36;
      yCounter++;
      layoutNodes.push({ node, x, y, depth, parent });
    } else {
      // first compute children positions to find midpoint
      const childYs: number[] = [];
      for (const child of node.children) {
        const before = yCounter;
        place(child, depth + 1, { x, y: 0, probability: child.probability });
        // after recursive call, find child y — it's the last leaf pushed
        // Take the average of new leaves
        const after = yCounter;
        const midY = (before + after - 1) / 2;
        childYs.push(padding + midY * 36);
      }
      const midY = childYs.reduce((a, b) => a + b, 0) / childYs.length;
      layoutNodes.push({ node, x, y: midY, depth, parent });
    }
  }

  // Simpler approach: do it iteratively for ≤3 levels
  // Layout children of a node vertically centered around parent.y
  function layout(node: TreeNode, depth: number, parentY: number, parentX: number, probability?: string) {
    if (depth > maxDepth) return;
    const x = padding + depth * 170;
    if (!node.children || node.children.length === 0) {
      layoutNodes.push({ node, x, y: parentY, depth, parent: parentX > 0 ? { x: parentX, y: parentY, probability } : undefined });
      return;
    }
    const childCount = node.children.length;
    const totalHeight = childCount * 50;
    const startY = parentY - totalHeight / 2 + 25;
    const childYs: number[] = [];
    node.children.forEach((child, i) => {
      const cy = startY + i * 50;
      childYs.push(cy);
    });
    const myY = childYs.reduce((a, b) => a + b, 0) / childYs.length;
    layoutNodes.push({ node, x, y: myY, depth, parent: parentX > 0 ? { x: parentX, y: parentY, probability } : undefined });
    node.children.forEach((child, i) => {
      layout(child, depth + 1, childYs[i], x, child.probability);
    });
  }

  layout(root, 0, height / 2, 0);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Edges */}
        {layoutNodes.map((ln, i) => {
          if (!ln.parent) return null;
          return (
            <g key={`edge-${i}`}>
              <line
                x1={ln.parent.x}
                y1={ln.parent.y}
                x2={ln.x}
                y2={ln.y}
                stroke="#9CA3AF"
                strokeWidth={1.5}
              />
              {ln.parent.probability && (
                <text
                  x={(ln.parent.x + ln.x) / 2}
                  y={(ln.parent.y + ln.y) / 2 - 4}
                  fontSize={10}
                  fill="#6B7280"
                  textAnchor="middle"
                  fontWeight={600}
                >
                  {ln.parent.probability}
                </text>
              )}
            </g>
          );
        })}
        {/* Nodes */}
        {layoutNodes.map((ln, i) => (
          <g key={`node-${i}`}>
            <rect
              x={ln.x - 30}
              y={ln.y - 12}
              width={60}
              height={24}
              rx={12}
              fill={PALETTE[ln.depth % PALETTE.length]}
              opacity={0.9}
            />
            <text x={ln.x} y={ln.y + 4} fontSize={11} fill="white" textAnchor="middle" fontWeight={700}>
              {ln.node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// =====================================================================
// 9. Network graph (also useful for graph theory / social networks)
// =====================================================================
function NetworkSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Network Graph";
  const nodes: Array<{ id: string; label: string; color?: string }> = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges: Array<{ from: string; to: string; label?: string; directed?: boolean }> = Array.isArray(spec.edges) ? spec.edges : [];

  const width = 480;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 60;

  const positions = nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return (
    <div>
      {title && <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Edges */}
        {edges.map((edge, i) => {
          const fromIdx = nodes.findIndex((n) => n.id === edge.from);
          const toIdx = nodes.findIndex((n) => n.id === edge.to);
          if (fromIdx < 0 || toIdx < 0) return null;
          const from = positions[fromIdx];
          const to = positions[toIdx];
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={`edge-${i}`}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#9CA3AF" strokeWidth={1.5} />
              {edge.directed && (
                <polygon
                  points={arrowPoints(from.x, from.y, to.x, to.y, 8)}
                  fill="#9CA3AF"
                />
              )}
              {edge.label && (
                <text x={midX} y={midY - 4} fontSize={10} fill="#6B7280" textAnchor="middle" fontWeight={600}>
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Nodes */}
        {nodes.map((n, i) => {
          const pos = positions[i];
          const color = n.color ?? PALETTE[i % PALETTE.length];
          const labelWidth = Math.max(60, n.label.length * 7 + 16);
          return (
            <g key={n.id}>
              <rect x={pos.x - labelWidth / 2} y={pos.y - 16} width={labelWidth} height={32} rx={16} fill={color} opacity={0.9} />
              <text x={pos.x} y={pos.y + 4} fontSize={11} fill="white" textAnchor="middle" fontWeight={600}>
                {n.label.length > 22 ? n.label.slice(0, 22) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function arrowPoints(fromX: number, fromY: number, toX: number, toY: number, size: number): string {
  // shorten endpoint to node radius
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const tipX = toX - nx * 18;
  const tipY = toY - ny * 18;
  const baseX = tipX - nx * size;
  const baseY = tipY - ny * size;
  const perpX = -ny * size * 0.5;
  const perpY = nx * size * 0.5;
  return `${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`;
}

// =====================================================================
// 10. Vector (arrow) plot
// =====================================================================
function VectorSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Vector Diagram";
  const xLabel = spec.xLabel ?? "x";
  const yLabel = spec.yLabel ?? "y";
  const vectors: Array<{
    from?: [number, number];
    to: [number, number];
    label?: string;
    color?: string;
  }> = Array.isArray(spec.vectors) ? spec.vectors : [];
  const xRange: [number, number] = spec.xRange ?? [-5, 5];
  const yRange: [number, number] = spec.yRange ?? [-5, 5];

  const width = 480;
  const height = 360;
  const padding = 40;

  const toSvgX = (x: number) => padding + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (width - 2 * padding);
  const toSvgY = (y: number) =>
    height - padding - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (height - 2 * padding);

  const xAxisY = yRange[0] <= 0 && yRange[1] >= 0 ? toSvgY(0) : height - padding;
  const yAxisX = xRange[0] <= 0 && xRange[1] >= 0 ? toSvgX(0) : padding;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Grid */}
        <line x1={padding} y1={xAxisY} x2={width - padding} y2={xAxisY} stroke="#374151" strokeWidth={1.5} />
        <line x1={yAxisX} y1={padding} x2={yAxisX} y2={height - padding} stroke="#374151" strokeWidth={1.5} />
        {/* Vectors */}
        {vectors.map((v, i) => {
          const from = v.from ?? [0, 0];
          const color = v.color ?? PALETTE[i % PALETTE.length];
          return (
            <g key={`vec-${i}`}>
              <line
                x1={toSvgX(from[0])}
                y1={toSvgY(from[1])}
                x2={toSvgX(v.to[0])}
                y2={toSvgY(v.to[1])}
                stroke={color}
                strokeWidth={2.5}
              />
              <polygon
                points={arrowPoints(toSvgX(from[0]), toSvgY(from[1]), toSvgX(v.to[0]), toSvgY(v.to[1]), 10)}
                fill={color}
              />
              {v.label && (
                <text
                  x={toSvgX(v.to[0]) + 6}
                  y={toSvgY(v.to[1]) - 4}
                  fontSize={11}
                  fill={color}
                  fontWeight={700}
                >
                  {v.label}
                </text>
              )}
            </g>
          );
        })}
        <text x={width / 2} y={height - 8} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>
        <text x={12} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 12, ${height / 2})`}>{yLabel}</text>
      </svg>
    </div>
  );
}

// =====================================================================
// 11. Polygon (2D geometric figure with labeled vertices and sides)
// =====================================================================
function PolygonSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Polygon";
  const vertices: Array<[number, number]> = Array.isArray(spec.vertices) ? spec.vertices : [];
  const labels: string[] = Array.isArray(spec.labels) ? spec.labels : [];
  const showAngles = spec.showAngles !== false;
  const showSides = spec.showSides !== false;

  // Compute bounds
  const allX = vertices.map((v) => v[0]);
  const allY = vertices.map((v) => v[1]);
  let xMin = Math.min(...allX);
  let xMax = Math.max(...allX);
  let yMin = Math.min(...allY);
  let yMax = Math.max(...allY);
  const xPad = (xMax - xMin) * 0.2 || 1;
  const yPad = (yMax - yMin) * 0.2 || 1;
  xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;

  const width = 380;
  const height = 320;
  const padding = 30;

  const toSvgX = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * (width - 2 * padding);
  const toSvgY = (y: number) =>
    height - padding - ((y - yMin) / (yMax - yMin)) * (height - 2 * padding);

  const path = vertices.map((v, i) => `${i === 0 ? "M" : "L"} ${toSvgX(v[0]).toFixed(2)} ${toSvgY(v[1]).toFixed(2)}`).join(" ") + " Z";

  // Side lengths
  const sides: Array<{ length: number; midX: number; midY: number }> = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
    sides.push({
      length: len,
      midX: toSvgX((a[0] + b[0]) / 2),
      midY: toSvgY((a[1] + b[1]) / 2),
    });
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Polygon */}
        <path d={path} fill="#4F46E5" fillOpacity={0.15} stroke="#4F46E5" strokeWidth={2.5} />
        {/* Vertices + labels */}
        {vertices.map((v, i) => {
          const label = labels[i] ?? String.fromCharCode(65 + i);
          // Offset label outward (from centroid)
          const cx = vertices.reduce((s, p) => s + p[0], 0) / vertices.length;
          const cy = vertices.reduce((s, p) => s + p[1], 0) / vertices.length;
          const dx = v[0] - cx;
          const dy = v[1] - cy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const labelOffset = 16;
          const labelX = toSvgX(v[0]) + (dx / len) * labelOffset;
          const labelY = toSvgY(v[1]) + (dy / len) * labelOffset;
          return (
            <g key={`v-${i}`}>
              <circle cx={toSvgX(v[0])} cy={toSvgY(v[1])} r={3.5} fill="#4F46E5" />
              <text x={labelX} y={labelY + 4} fontSize={13} fill="#374151" textAnchor="middle" fontWeight={700}>
                {label}
              </text>
            </g>
          );
        })}
        {/* Side length labels */}
        {showSides && sides.map((s, i) => (
          <text key={`s-${i}`} x={s.midX} y={s.midY - 4} fontSize={10} fill="#10B981" textAnchor="middle" fontWeight={600}>
            {s.length.toFixed(2)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// =====================================================================
// 12. Box-and-whisker plot
// =====================================================================
function BoxPlotSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Box Plot";
  const yLabel = spec.yLabel ?? "";
  const datasets: Array<{
    label: string;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    outliers?: number[];
  }> = Array.isArray(spec.datasets) ? spec.datasets : [];

  const width = 480;
  const height = Math.max(180, datasets.length * 80 + 40);
  const padding = { left: 80, right: 30, top: 30, bottom: 40 };
  const plotW = width - padding.left - padding.right;

  if (datasets.length === 0) return <p className="text-xs text-gray-500">No datasets provided.</p>;

  // Compute global range
  const allValues = datasets.flatMap((d) => [d.min, d.max, ...(d.outliers ?? [])]);
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.1;
  const yMinPadded = yMin - yPad;
  const yMaxPadded = yMax + yPad;

  const toSvgX = (v: number) => padding.left + ((v - yMinPadded) / (yMaxPadded - yMinPadded)) * plotW;
  const boxWidth = 50;

  // X ticks
  const xTicks: ReactElement[] = [];
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) {
    const xv = yMinPadded + ((yMaxPadded - yMinPadded) * i) / tickCount;
    xTicks.push(
      <g key={`xt-${i}`}>
        <line x1={toSvgX(xv)} y1={padding.top} x2={toSvgX(xv)} y2={height - padding.bottom} stroke="#E5E7EB" strokeWidth={1} />
        <text x={toSvgX(xv)} y={height - padding.bottom + 14} fontSize={10} fill="#6B7280" textAnchor="middle">
          {xv.toFixed(0)}
        </text>
      </g>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {xTicks}
        {/* Baseline */}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#374151" strokeWidth={1.5} />
        {/* Each dataset */}
        {datasets.map((d, i) => {
          const cy = padding.top + 20 + i * 70;
          const xMin = toSvgX(d.min);
          const xQ1 = toSvgX(d.q1);
          const xMed = toSvgX(d.median);
          const xQ3 = toSvgX(d.q3);
          const xMax = toSvgX(d.max);
          return (
            <g key={`ds-${i}`}>
              {/* Label */}
              <text x={padding.left - 10} y={cy + 4} fontSize={11} fill="#374151" textAnchor="end" fontWeight={600}>
                {d.label}
              </text>
              {/* Whiskers */}
              <line x1={xMin} y1={cy} x2={xQ1} y2={cy} stroke="#374151" strokeWidth={1.5} strokeDasharray="4 3" />
              <line x1={xQ3} y1={cy} x2={xMax} y2={cy} stroke="#374151" strokeWidth={1.5} strokeDasharray="4 3" />
              <line x1={xMin} y1={cy - 8} x2={xMin} y2={cy + 8} stroke="#374151" strokeWidth={2} />
              <line x1={xMax} y1={cy - 8} x2={xMax} y2={cy + 8} stroke="#374151" strokeWidth={2} />
              {/* Box */}
              <rect x={xQ1} y={cy - boxWidth / 2} width={xQ3 - xQ1} height={boxWidth} fill="#4F46E5" fillOpacity={0.35} stroke="#4F46E5" strokeWidth={2} />
              {/* Median */}
              <line x1={xMed} y1={cy - boxWidth / 2} x2={xMed} y2={cy + boxWidth / 2} stroke="#EF4444" strokeWidth={2.5} />
              {/* Outliers */}
              {(d.outliers ?? []).map((o, j) => (
                <circle key={`o-${i}-${j}`} cx={toSvgX(o)} cy={cy} r={4} fill="white" stroke="#EF4444" strokeWidth={2} />
              ))}
              {/* Quartile labels */}
              <text x={xQ1} y={cy - boxWidth / 2 - 4} fontSize={9} fill="#4F46E5" textAnchor="middle">Q1={d.q1}</text>
              <text x={xMed} y={cy + boxWidth / 2 + 12} fontSize={9} fill="#EF4444" textAnchor="middle">Med={d.median}</text>
              <text x={xQ3} y={cy - boxWidth / 2 - 4} fontSize={9} fill="#4F46E5" textAnchor="middle">Q3={d.q3}</text>
            </g>
          );
        })}
        {yLabel && <text x={width / 2} y={height - 6} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{yLabel}</text>}
      </svg>
    </div>
  );
}
