"use client";

import { type ReactElement, useState, useRef, useEffect, useCallback } from "react";

// =====================================================================
// Shared interactivity hooks
// =====================================================================

// Zoom/pan state for coordinate plots
function useZoomPan(initialRange: [number, number]) {
  const [range, setRange] = useState<[number, number]>(initialRange);
  const [zoom, setZoom] = useState(1);
  return { range, zoom, setRange, setZoom };
}

// Hover tooltip for scatter points
function HoverPoint({
  cx,
  cy,
  label,
  color,
}: {
  cx: number;
  cy: number;
  label: string;
  color: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={hovered ? 7 : 5}
        fill={color}
        stroke="white"
        strokeWidth={hovered ? 2 : 1.5}
        style={{ transition: "r 0.1s" }}
      />
      {hovered && (
        <g>
          <rect
            x={cx + 10}
            y={cy - 22}
            width={label.length * 6 + 12}
            height={20}
            rx={4}
            fill="rgba(17, 24, 39, 0.92)"
          />
          <text
            x={cx + 16}
            y={cy - 8}
            fontSize={11}
            fill="white"
            fontWeight={600}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

// CSVDownloadButton — small button that downloads rows as a CSV file
// (opens in Excel, Google Sheets, LibreOffice)
function CSVDownloadButton({
  headers,
  rows,
  downloadName = "table.csv",
}: {
  headers: string[];
  rows: (string | number)[][];
  downloadName?: string;
}) {
  const escapeCSV = (val: string | number) => {
    const s = String(val ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csvText = [headers, ...rows].map((r) => r.map(escapeCSV).join(",")).join("\n");

  const download = () => {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName.endsWith(".csv") ? downloadName : `${downloadName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={download}
      className="text-[10px] text-gray-500 hover:text-emerald-700 flex items-center gap-0.5"
      title="Download as CSV (opens in Excel)"
    >
      📄 CSV
    </button>
  );
}

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
    case "slopefield":
      return <SlopeFieldSVG spec={spec} />;
    case "stemleaf":
      return <StemLeafSVG spec={spec} />;
    case "frequency_polygon":
      return <FrequencyPolygonSVG spec={spec} />;
    case "freeform":
      return <FreeformSVG spec={spec} />;
    case "argand":
      return <ArgandSVG spec={spec} />;
    case "contour":
      return <ContourSVG spec={spec} />;
    case "vectorfield":
      return <VectorFieldSVG spec={spec} />;
    case "tessellation":
      return <TessellationSVG spec={spec} />;
    case "knot":
      return <KnotSVG spec={spec} />;
    case "pictogram":
      return <PictogramSVG spec={spec} />;
    case "tally":
      return <TallySVG spec={spec} />;
    case "carroll":
      return <CarrollSVG spec={spec} />;
    case "ogive":
      return <OgiveSVG spec={spec} />;
    case "unitcircle":
      return <UnitCircleSVG spec={spec} />;
    case "transform":
      return <GeometricTransformSVG spec={spec} />;
    case "axes3d":
      return <Axes3DSVG spec={spec} />;
    case "twoway":
      return <TwoWayTableSVG spec={spec} />;
    case "erdiagram":
      return <ERDiagramSVG spec={spec} />;
    case "csv":
      return <CSVPreviewSVG spec={spec} />;
    default:
      return (
        <div className="text-xs text-rose-600 p-3">
          Unknown graph type: <code>{type}</code>. Available types: function,
          scatter, bar, histogram, pie, venn, numberline, tree, network,
          vector, polygon, boxplot, slopefield, stemleaf, frequency_polygon,
          freeform, argand, contour, vectorfield, tessellation, knot,
          pictogram, tally, carroll, ogive, unitcircle, transform, axes3d,
          twoway, erdiagram, csv.
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
        {/* Data points — interactive (hover for tooltip with values) */}
        {points.map((p, i) => (
          <HoverPoint
            key={`pt-${i}`}
            cx={toSvgX(p[0])}
            cy={toSvgY(p[1])}
            label={`(${p[0]}, ${p[1]})`}
            color="#4F46E5"
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
  const radius = Math.min(width, height) / 2 - 70;

  // Detect hub-and-spoke layout
  const nodeDegree = new Map<string, number>();
  for (const e of edges) {
    nodeDegree.set(e.from, (nodeDegree.get(e.from) ?? 0) + 1);
    nodeDegree.set(e.to, (nodeDegree.get(e.to) ?? 0) + 1);
  }
  let hubId: string | null = null;
  if (nodes.length >= 4) {
    const sortedByDegree = [...nodeDegree.entries()].sort((a, b) => b[1] - a[1]);
    if (sortedByDegree.length > 0 && sortedByDegree[0][1] >= 3) {
      const topDegree = sortedByDegree[0][1];
      const secondDegree = sortedByDegree[1]?.[1] ?? 0;
      if (topDegree >= secondDegree * 2) {
        hubId = sortedByDegree[0][0];
      }
    }
  }

  // Compute INITIAL positions (auto-layout) — stored in state so user can drag
  const computeInitial = useCallback(() => {
    let pos: Array<{ x: number; y: number }>;
    if (hubId) {
      const hubIdx = nodes.findIndex((n) => n.id === hubId);
      const otherCount = nodes.length - 1;
      const angleStep = (2 * Math.PI) / Math.max(otherCount, 1);
      const startAngle = -Math.PI / 2;
      pos = nodes.map((n) => ({ x: cx, y: cy }));
      let otherIdx = 0;
      for (let i = 0; i < nodes.length; i++) {
        if (i === hubIdx) {
          pos[i] = { x: cx, y: cy };
        } else {
          const angle = startAngle + otherIdx * angleStep;
          pos[i] = {
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
          };
          otherIdx++;
        }
      }
    } else {
      pos = nodes.map((_, i) => {
        const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
        return {
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
        };
      });
    }
    return pos;
  }, [hubId, nodes, cx, cy, radius]);

  const [positions, setPositions] = useState<Array<{ x: number; y: number }>>(computeInitial);
  // Reset positions when spec changes (new conversation)
  useEffect(() => {
    setPositions(computeInitial());
  }, [computeInitial]);

  // Drag state
  const [dragging, setDragging] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const onNodeMouseDown = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(id);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    // Convert mouse coords to SVG viewBox coords
    const scale = width / rect.width;
    const svgX = (e.clientX - rect.left) * scale;
    const svgY = (e.clientY - rect.top) * (height / rect.height);
    setPositions((prev) =>
      prev.map((p, i) => (nodes[i]?.id === dragging ? { x: svgX, y: svgY } : p))
    );
  };

  const onMouseUp = () => setDragging(null);

  return (
    <div>
      {title && <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto bg-gray-50 rounded-lg select-none"
        ref={svgRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ touchAction: "none" }}
      >
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
        {/* Nodes (draggable) */}
        {nodes.map((n, i) => {
          const pos = positions[i];
          const isHub = n.id === hubId;
          const isDragging = dragging === n.id;
          const color = n.color ?? PALETTE[i % PALETTE.length];
          const fontSize = isHub ? 12 : 11;
          const padding = isHub ? 12 : 8;
          const rectHeight = isHub ? 36 : 32;
          const labelWidth = Math.max(isHub ? 100 : 60, n.label.length * 7 + padding);
          return (
            <g
              key={n.id}
              onMouseDown={(e) => onNodeMouseDown(n.id, e)}
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
            >
              {isHub && (
                // Glow / highlight ring around the hub
                <rect
                  x={pos.x - labelWidth / 2 - 3}
                  y={pos.y - rectHeight / 2 - 3}
                  width={labelWidth + 6}
                  height={rectHeight + 6}
                  rx={(rectHeight + 6) / 2}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.4}
                />
              )}
              <rect
                x={pos.x - labelWidth / 2}
                y={pos.y - rectHeight / 2}
                width={labelWidth}
                height={rectHeight}
                rx={rectHeight / 2}
                fill={color}
                opacity={0.95}
              />
              <text
                x={pos.x}
                y={pos.y + 4}
                fontSize={fontSize}
                fill="white"
                textAnchor="middle"
                fontWeight={isHub ? 700 : 600}
                style={{ pointerEvents: "none" }}
              >
                {n.label.length > (isHub ? 28 : 22) ? n.label.slice(0, isHub ? 28 : 22) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
        <span className="cursor-grab">✋</span> Drag nodes to rearrange
      </p>
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

// =====================================================================
// 13. Slope field (direction field) for differential equations
//     Draws small tick marks showing the slope of y' = f(x, y) at grid points.
// =====================================================================
function SlopeFieldSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Slope Field";
  const expr = spec.expr ?? "x"; // dy/dx = expr (function of x and y)
  const xRange: [number, number] = spec.xRange ?? [-5, 5];
  const yRange: [number, number] = spec.yRange ?? [-5, 5];
  const gridSize: number = spec.gridSize ?? 10; // grid points per axis
  const xLabel = spec.xLabel ?? "x";
  const yLabel = spec.yLabel ?? "y";
  const width = 480;
  const height = 360;
  const padding = 40;

  // Safe expression evaluator — supports Math.* + x + y
  const evaluate = (x: number, y: number): number | null => {
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
        .replace(/\bx\b/g, String(x))
        .replace(/\by\b/g, String(y));
      // eslint-disable-next-line no-new-func
      const fn = new Function("Math", `"use strict"; return (${safeExpr});`);
      const result = fn(Math);
      return typeof result === "number" && isFinite(result) ? result : null;
    } catch {
      return null;
    }
  };

  const toSvgX = (x: number) => padding + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (width - 2 * padding);
  const toSvgY = (y: number) =>
    height - padding - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (height - 2 * padding);

  // Generate slope tick marks
  const ticks: ReactElement[] = [];
  const tickLength = 8;
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / gridSize;
      const y = yRange[0] + ((yRange[1] - yRange[0]) * j) / gridSize;
      const slope = evaluate(x, y);
      if (slope === null) continue;
      // Normalize direction
      const dx = 1 / Math.sqrt(1 + slope * slope);
      const dy = slope / Math.sqrt(1 + slope * slope);
      const cx = toSvgX(x);
      const cy = toSvgY(y);
      const x1 = cx - (tickLength / 2) * dx;
      const y1 = cy + (tickLength / 2) * dy; // SVG y inverted
      const x2 = cx + (tickLength / 2) * dx;
      const y2 = cy - (tickLength / 2) * dy;
      ticks.push(
        <line
          key={`tick-${i}-${j}`}
          x1={x1.toFixed(2)}
          y1={y1.toFixed(2)}
          x2={x2.toFixed(2)}
          y2={y2.toFixed(2)}
          stroke="#4F46E5"
          strokeWidth={1.5}
          opacity={0.7}
        />
      );
    }
  }

  // Axes
  const xAxisY = yRange[0] <= 0 && yRange[1] >= 0 ? toSvgY(0) : height - padding;
  const yAxisX = xRange[0] <= 0 && xRange[1] >= 0 ? toSvgX(0) : padding;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-[10px] text-gray-500 mb-1">dy/dx = <span className="font-mono">{expr}</span></p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {ticks}
        <line x1={padding} y1={xAxisY} x2={width - padding} y2={xAxisY} stroke="#374151" strokeWidth={1.5} />
        <line x1={yAxisX} y1={padding} x2={yAxisX} y2={height - padding} stroke="#374151" strokeWidth={1.5} />
        <text x={width / 2} y={height - 8} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>
        <text x={12} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 12, ${height / 2})`}>{yLabel}</text>
      </svg>
    </div>
  );
}

// =====================================================================
// 14. Stem-and-leaf plot (statistical data display)
// =====================================================================
function StemLeafSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Stem-and-Leaf Plot";
  const data: number[] = Array.isArray(spec.data) ? spec.data : [];
  const stemUnit: number = spec.stemUnit ?? 10; // e.g. 10 means stem = tens digit
  const leafUnit: number = spec.leafUnit ?? 1; // e.g. 1 means leaf = ones digit

  if (data.length === 0) {
    return <p className="text-xs text-gray-500">No data provided for stem-and-leaf plot.</p>;
  }

  // Group by stem
  const groups = new Map<number, number[]>();
  for (const v of data) {
    const stem = Math.floor(v / stemUnit);
    const leaf = Math.floor((v - stem * stemUnit) / leafUnit);
    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem)!.push(leaf);
  }
  // Sort stems
  const sortedStems = [...groups.keys()].sort((a, b) => a - b);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-[10px] text-gray-500 mb-2">Stem = {stemUnit}s, Leaf = {leafUnit}s</p>
      <div className="bg-white border border-gray-200 rounded-lg p-3 font-mono text-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <th className="text-left py-1 px-2">Stem</th>
              <th className="text-left py-1 px-2">Leaves</th>
              <th className="text-right py-1 px-2 text-gray-400">Count</th>
            </tr>
          </thead>
          <tbody>
            {sortedStems.map((stem) => {
              const leaves = (groups.get(stem) ?? []).sort((a, b) => a - b);
              return (
                <tr key={stem} className="border-b border-gray-50">
                  <td className="py-1 px-2 font-bold text-indigo-600">{stem} |</td>
                  <td className="py-1 px-2 tracking-wide text-gray-800">{leaves.join(" ")}</td>
                  <td className="py-1 px-2 text-right text-gray-400">{leaves.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500 mt-1">n = {data.length} · Key: {sortedStems[0] ?? 0}|{(groups.get(sortedStems[0]) ?? [0])[0]} = {(sortedStems[0] ?? 0) * stemUnit + (groups.get(sortedStems[0]) ?? [0])[0] * leafUnit}</p>
    </div>
  );
}

// =====================================================================
// 15. Frequency polygon (line graph connecting midpoints of class intervals)
// =====================================================================
function FrequencyPolygonSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Frequency Polygon";
  const xLabel = spec.xLabel ?? "Class Midpoint";
  const yLabel = spec.yLabel ?? "Frequency";
  const points: Array<{ midpoint: number; frequency: number }> = Array.isArray(spec.points)
    ? spec.points
    : Array.isArray(spec.bins)
      ? spec.bins.map((b: any) => ({ midpoint: (b.start + b.end) / 2, frequency: b.count }))
      : [];

  const width = 480;
  const height = 320;
  const padding = { left: 50, right: 20, top: 30, bottom: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  if (points.length === 0) {
    return <p className="text-xs text-gray-500">No data for frequency polygon.</p>;
  }

  const allX = points.map((p) => p.midpoint);
  const allY = points.map((p) => p.frequency);
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMax = Math.max(...allY) * 1.1 || 10;
  const xPad = (xMax - xMin) * 0.1 || 1;
  const xMinP = xMin - xPad;
  const xMaxP = xMax + xPad;

  const toSvgX = (x: number) => padding.left + ((x - xMinP) / (xMaxP - xMinP)) * plotW;
  const toSvgY = (v: number) => padding.top + plotH - (v / yMax) * plotH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toSvgX(p.midpoint).toFixed(2)} ${toSvgY(p.frequency).toFixed(2)}`)
    .join(" ");

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Y grid */}
        {Array.from({ length: 6 }, (_, i) => {
          const yv = (yMax * i) / 5;
          return (
            <g key={`yg-${i}`}>
              <line x1={padding.left} y1={toSvgY(yv)} x2={padding.left + plotW} y2={toSvgY(yv)} stroke="#E5E7EB" strokeWidth={1} />
              <text x={padding.left - 8} y={toSvgY(yv) + 3} fontSize={10} fill="#6B7280" textAnchor="end">{yv.toFixed(0)}</text>
            </g>
          );
        })}
        {/* X axis labels */}
        {points.map((p, i) => (
          <text key={`xl-${i}`} x={toSvgX(p.midpoint)} y={padding.top + plotH + 14} fontSize={10} fill="#6B7280" textAnchor="middle">
            {p.midpoint.toFixed(1)}
          </text>
        ))}
        {/* Line */}
        <path d={path} fill="none" stroke="#4F46E5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={`pt-${i}`} cx={toSvgX(p.midpoint)} cy={toSvgY(p.frequency)} r={4} fill="#4F46E5" stroke="white" strokeWidth={1.5} />
        ))}
        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        <line x1={padding.left} y1={padding.top + plotH} x2={padding.left + plotW} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        <text x={width / 2} y={height - 8} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>
        <text x={14} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 14, ${height / 2})`}>{yLabel}</text>
      </svg>
    </div>
  );
}

// =====================================================================
// 16. Freeform SVG — AI can output raw SVG markup for any custom drawing
//     The "svg" field in the spec contains the raw SVG body (without the
//     outer <svg> tag). We wrap it in a viewBox and render it inline.
//     DANGEROUS: this executes AI-generated SVG, so we sanitize by stripping
//     <script> tags, on* event handlers, and external resource references.
// =====================================================================
function FreeformSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Custom Drawing";
  const rawSvg: string = typeof spec.svg === "string" ? spec.svg : "";
  let width: number = spec.width ?? 480;
  let height: number = spec.height ?? 360;

  if (!rawSvg) {
    return (
      <div className="text-xs text-rose-600 p-3">
        Freeform graph type requires an "svg" field containing raw SVG markup.
      </div>
    );
  }

  // If the AI wrapped its content in an outer <svg>...</svg> tag, extract the
  // INNER content (we'll wrap it in our own <svg> below). This avoids the
  // nested-<svg> rendering issue where browsers don't reliably render an
  // inner SVG element placed via dangerouslySetInnerHTML.
  // Also extract the viewBox/width/height attributes from the AI's <svg> tag
  // so we can use the AI's intended dimensions.
  let svgContent = rawSvg;
  const outerSvgMatch = rawSvg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (outerSvgMatch) {
    const outerAttrs = outerSvgMatch[1] ?? "";
    svgContent = outerSvgMatch[2] ?? "";

    // Try to extract viewBox / width / height from the AI's <svg> tag
    const viewBoxMatch = outerAttrs.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
        width = parts[2];
        height = parts[3];
      }
    }
    const widthMatch = outerAttrs.match(/\bwidth\s*=\s*["'](\d+)["']/i);
    const heightMatch = outerAttrs.match(/\bheight\s*=\s*["'](\d+)["']/i);
    if (widthMatch) width = parseInt(widthMatch[1], 10);
    if (heightMatch) height = parseInt(heightMatch[1], 10);
  } else if (spec.width && spec.height) {
    // No outer svg tag — use spec dimensions
    width = spec.width;
    height = spec.height;
  }

  // Sanitize: strip <script>...</script>, on* handlers, javascript: URLs,
  // external image refs, and data: URLs (to prevent XSS and data exfiltration).
  let sanitized = svgContent;
  // Remove <script>...</script> blocks
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove on* event handlers (onclick, onload, onerror, etc.)
  sanitized = sanitized.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  sanitized = sanitized.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  // Remove javascript: URLs
  sanitized = sanitized.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  sanitized = sanitized.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
  // Remove external image references (prevent data exfiltration via image URLs)
  sanitized = sanitized.replace(/href\s*=\s*"https?:\/\/[^"]*"/gi, 'href="#"');
  sanitized = sanitized.replace(/href\s*=\s*'https?:\/\/[^']*'/gi, "href='#'");
  // Remove xlink:href external references too
  sanitized = sanitized.replace(/xlink:href\s*=\s*"https?:\/\/[^"]*"/gi, 'xlink:href="#"');

  return (
    <div>
      {title && <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto bg-gray-50 rounded-lg"
        xmlns="http://www.w3.org/2000/svg"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    </div>
  );
}

// =====================================================================
// 17. Argand diagram — plot complex numbers on the complex plane
//     (real axis + imaginary axis)
// =====================================================================
function ArgandSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Argand Diagram";
  const points: Array<{ re: number; im: number; label?: string; color?: string }> = Array.isArray(spec.points)
    ? spec.points
    : [];
  const range: [number, number] = spec.range ?? [-5, 5];
  const width = 420;
  const height = 360;
  const padding = 40;

  const toSvgX = (x: number) => padding + ((x - range[0]) / (range[1] - range[0])) * (width - 2 * padding);
  const toSvgY = (y: number) =>
    height - padding - ((y - range[0]) / (range[1] - range[0])) * (height - 2 * padding);
  const originX = toSvgX(0);
  const originY = toSvgY(0);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Grid */}
        {Array.from({ length: 11 }, (_, i) => {
          const v = range[0] + ((range[1] - range[0]) * i) / 10;
          return (
            <g key={`grid-${i}`}>
              <line x1={toSvgX(v)} y1={padding} x2={toSvgX(v)} y2={height - padding} stroke="#E5E7EB" strokeWidth={v === 0 ? 1.5 : 0.5} />
              <line x1={padding} y1={toSvgY(v)} x2={width - padding} y2={toSvgY(v)} stroke="#E5E7EB" strokeWidth={v === 0 ? 1.5 : 0.5} />
            </g>
          );
        })}
        {/* Axes — real (horizontal) and imaginary (vertical) */}
        <line x1={padding} y1={originY} x2={width - padding} y2={originY} stroke="#374151" strokeWidth={1.5} />
        <line x1={originX} y1={padding} x2={originX} y2={height - padding} stroke="#374151" strokeWidth={1.5} />
        {/* Arrows */}
        <polygon points={`${width - padding},${originY} ${width - padding - 8},${originY - 4} ${width - padding - 8},${originY + 4}`} fill="#374151" />
        <polygon points={`${originX},${padding} ${originX - 4},${padding + 8} ${originX + 4},${padding + 8}`} fill="#374151" />
        {/* Axis labels */}
        <text x={width - padding + 4} y={originY + 14} fontSize={11} fill="#374151" fontWeight={600}>Re</text>
        <text x={originX + 6} y={padding + 4} fontSize={11} fill="#374151" fontWeight={600}>Im</text>
        {/* Points (complex numbers) */}
        {points.map((p, i) => {
          const color = p.color ?? PALETTE[i % PALETTE.length];
          const cx = toSvgX(p.re);
          const cy = toSvgY(p.im);
          return (
            <g key={`arg-${i}`}>
              {/* Vector from origin to point */}
              <line x1={originX} y1={originY} x2={cx} y2={cy} stroke={color} strokeWidth={1.5} opacity={0.5} />
              {/* Point */}
              <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />
              {/* Label */}
              {p.label && (
                <text x={cx + 8} y={cy - 4} fontSize={11} fill={color} fontWeight={700}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">
        {points.length} complex number{points.length !== 1 ? "s" : ""} plotted on the complex plane (Re/Im axes)
      </p>
    </div>
  );
}

// =====================================================================
// 18. Contour map — topographic-style level curves for f(x, y) = z
//     Draws nested closed curves at multiple z levels (or a square grid
//     of color bands if a 2D scalar field is provided)
// =====================================================================
function ContourSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Contour Map";
  const levels: Array<{ level: number; color?: string; points?: Array<[number, number]> }> = Array.isArray(spec.levels) ? spec.levels : [];
  // If `levels` not provided, generate circular contour rings as a fallback
  const fallbackLevels = levels.length === 0
    ? Array.from({ length: 6 }, (_, i) => ({
        level: (i + 1) * 10,
        color: PALETTE[i % PALETTE.length],
      }))
    : levels;

  const width = 420;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) / 2 - 40;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Background grid (subtle) */}
        {Array.from({ length: 9 }, (_, i) => (
          <g key={`grid-${i}`}>
            <line x1={20 + i * (width - 40) / 8} y1={20} x2={20 + i * (width - 40) / 8} y2={height - 20} stroke="#F3F4F6" strokeWidth={1} />
            <line x1={20} y1={20 + i * (height - 40) / 8} x2={width - 20} y2={20 + i * (height - 40) / 8} stroke="#F3F4F6" strokeWidth={1} />
          </g>
        ))}
        {/* Contour curves */}
        {fallbackLevels.map((lvl, i) => {
          const r = maxR * (i + 1) / fallbackLevels.length;
          const color = lvl.color ?? PALETTE[i % PALETTE.length];
          // If points are provided, draw a polygon path; otherwise draw a circle (fallback)
          if (Array.isArray(lvl.points) && lvl.points.length >= 3) {
            const path = lvl.points.map((p, j) => `${j === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ") + " Z";
            return <path key={`contour-${i}`} d={path} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />;
          }
          return (
            <g key={`contour-${i}`}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />
              <text x={cx + r + 4} y={cy - r * 0.7} fontSize={9} fill={color} fontWeight={600}>
                {lvl.level}
              </text>
            </g>
          );
        })}
        {/* Peak marker */}
        <circle cx={cx} cy={cy} r={3} fill="#1E40AF" />
        <text x={cx + 6} y={cy - 4} fontSize={10} fill="#1E40AF" fontWeight={700}>peak</text>
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">{fallbackLevels.length} contour levels</p>
    </div>
  );
}

// =====================================================================
// 19. Vector field — arrows showing direction and magnitude at grid points
//     For F(x, y) = (P(x,y), Q(x,y)) — typically for force/magnetic fields
// =====================================================================
function VectorFieldSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Vector Field";
  // P and Q expressions (string) or precomputed vectors
  const exprP: string = spec.exprP ?? "1";
  const exprQ: string = spec.exprQ ?? "0";
  const vectors: Array<{ from?: [number, number]; to?: [number, number]; magnitude?: number }> = Array.isArray(spec.vectors) ? spec.vectors : [];
  const range: [number, number] = spec.range ?? [-5, 5];
  const gridSize: number = spec.gridSize ?? 8;
  const xLabel = spec.xLabel ?? "x";
  const yLabel = spec.yLabel ?? "y";

  const width = 420;
  const height = 360;
  const padding = 30;

  const toSvgX = (x: number) => padding + ((x - range[0]) / (range[1] - range[0])) * (width - 2 * padding);
  const toSvgY = (y: number) => height - padding - ((y - range[0]) / (range[1] - range[0])) * (height - 2 * padding);

  // Evaluator for P and Q
  const eval2 = (expr: string, x: number, y: number): number | null => {
    try {
      let s = expr
        .replace(/\^/g, "**")
        .replace(/\bpi\b/gi, "Math.PI")
        .replace(/\be\b/g, "Math.E")
        .replace(/\bsin\(/g, "Math.sin(")
        .replace(/\bcos\(/g, "Math.cos(")
        .replace(/\btan\(/g, "Math.tan(")
        .replace(/\bsqrt\(/g, "Math.sqrt(")
        .replace(/\bx\b/g, String(x))
        .replace(/\by\b/g, String(y));
      // eslint-disable-next-line no-new-func
      const fn = new Function("Math", `"use strict"; return (${s});`);
      const r = fn(Math);
      return typeof r === "number" && isFinite(r) ? r : null;
    } catch { return null; }
  };

  // If vectors are precomputed, use them; otherwise generate from exprP/exprQ
  const fieldVectors: Array<{ x: number; y: number; dx: number; dy: number; magnitude: number }> = [];
  if (vectors.length > 0) {
    for (const v of vectors) {
      const from = v.from ?? [0, 0];
      const to = v.to ?? [from[0] + 1, from[1]];
      fieldVectors.push({
        x: from[0], y: from[1],
        dx: to[0] - from[0],
        dy: to[1] - from[1],
        magnitude: v.magnitude ?? Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2),
      });
    }
  } else {
    // Generate grid of arrows
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const x = range[0] + ((range[1] - range[0]) * i) / gridSize;
        const y = range[0] + ((range[1] - range[0]) * j) / gridSize;
        const p = eval2(exprP, x, y);
        const q = eval2(exprQ, x, y);
        if (p === null || q === null) continue;
        // Normalize: arrow length = 1 unit in field direction
        const mag = Math.sqrt(p * p + q * q) || 1;
        const scale = Math.min(range[1] - range[0], range[1] - range[0]) / gridSize * 0.4;
        const dx = (p / mag) * scale;
        const dy = (q / mag) * scale;
        fieldVectors.push({ x, y, dx, dy, magnitude: mag });
      }
    }
  }

  // Color scale by magnitude
  const maxMag = Math.max(...fieldVectors.map((v) => v.magnitude), 1);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Axes */}
        <line x1={padding} y1={toSvgY(0)} x2={width - padding} y2={toSvgY(0)} stroke="#374151" strokeWidth={1} opacity={0.5} />
        <line x1={toSvgX(0)} y1={padding} x2={toSvgX(0)} y2={height - padding} stroke="#374151" strokeWidth={1} opacity={0.5} />
        {/* Arrows */}
        {fieldVectors.map((v, i) => {
          const startX = toSvgX(v.x);
          const startY = toSvgY(v.y);
          const endX = toSvgX(v.x + v.dx);
          const endY = toSvgY(v.y + v.dy);
          const intensity = v.magnitude / maxMag;
          const color = intensity < 0.33 ? "#06B6D4" : intensity < 0.66 ? "#4F46E5" : "#EF4444";
          return (
            <g key={`vf-${i}`}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={color}
                strokeWidth={1.5}
                opacity={0.85}
              />
              <polygon
                points={arrowPoints(startX, startY, endX, endY, 6)}
                fill={color}
              />
            </g>
          );
        })}
        <text x={width / 2} y={height - 6} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>
        <text x={10} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 10, ${height / 2})`}>{yLabel}</text>
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">
        {fieldVectors.length} arrows · Color: <span className="text-cyan-600">weak</span> → <span className="text-indigo-600">medium</span> → <span className="text-rose-600">strong</span>
      </p>
    </div>
  );
}

// =====================================================================
// 20. Tessellation — repeating geometric pattern that tiles the plane
//     Accepts a base tile (polygon) + a tiling pattern (translate/scale)
// =====================================================================
function TessellationSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Tessellation";
  // Tile can be:
  //   - "triangle" / "square" / "hexagon" (predefined)
  //   - {vertices: [[x,y],...]} (custom polygon)
  const tileShape: string = typeof spec.tile === "string" ? spec.tile : "custom";
  const tileVertices: Array<[number, number]> | undefined = spec.tileVertices;
  const cols: number = spec.cols ?? 6;
  const rows: number = spec.rows ?? 5;
  const tileSize: number = spec.tileSize ?? 50;
  const colors: string[] = Array.isArray(spec.colors) ? spec.colors : PALETTE;
  const showLabels: boolean = spec.showLabels !== false;

  // Generate base tile vertices
  let baseVertices: Array<[number, number]> = [];
  if (tileShape === "triangle") {
    baseVertices = [[0, 0], [tileSize, 0], [tileSize / 2, tileSize * 0.866]];
  } else if (tileShape === "square") {
    baseVertices = [[0, 0], [tileSize, 0], [tileSize, tileSize], [0, tileSize]];
  } else if (tileShape === "hexagon") {
    const r = tileSize / 2;
    baseVertices = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return [r + r * Math.cos(a), r + r * Math.sin(a)] as [number, number];
    });
  } else if (Array.isArray(tileVertices)) {
    baseVertices = tileVertices;
  } else {
    baseVertices = [[0, 0], [tileSize, 0], [tileSize, tileSize], [0, tileSize]]; // square default
  }

  // Hexagons need offset rows; squares/triangles need simple grid
  const isHexagon = tileShape === "hexagon";
  const tileWidth = tileSize;
  const tileHeight = isHexagon ? tileSize * 0.866 : tileSize;
  const xSpacing = isHexagon ? tileWidth * 0.75 : tileWidth;
  const ySpacing = tileHeight;

  const width = cols * xSpacing + 40;
  const height = rows * ySpacing + 40;

  const tiles: Array<{ x: number; y: number; color: string; vertices: Array<[number, number]> }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = isHexagon && r % 2 === 1 ? xSpacing / 2 : 0;
      const x = 20 + c * xSpacing + offsetX;
      const y = 20 + r * ySpacing;
      const colorIdx = (r * cols + c) % colors.length;
      tiles.push({ x, y, color: colors[colorIdx], vertices: baseVertices });
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {tiles.map((t, i) => {
          const points = t.vertices.map((v) => `${(t.x + v[0]).toFixed(2)},${(t.y + v[1]).toFixed(2)}`).join(" ");
          return (
            <polygon
              key={`tile-${i}`}
              points={points}
              fill={t.color}
              fillOpacity={0.7}
              stroke={t.color}
              strokeWidth={1}
            />
          );
        })}
        {showLabels && (
          <text x={width / 2} y={height - 4} fontSize={10} fill="#6B7280" textAnchor="middle">
            {tileShape} tessellation · {cols}×{rows} tiles
          </text>
        )}
      </svg>
    </div>
  );
}

// =====================================================================
// 21. Knot diagram — trefoil, figure-eight, or custom knot using cubic
//     Bézier curves with over/under crossings rendered as gaps in the strand.
// =====================================================================
function KnotSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Knot Diagram";
  const knotType: string = spec.knotType ?? "trefoil";
  const width = 420;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;

  // Generate Bézier path for the knot based on type
  // Trefoil: 3-fold symmetric loop with 3 crossings
  // Figure-eight: 4-fold loop with 4 crossings (knot 4_1)
  let strands: Array<{ path: string; color?: string }> = [];
  let crossings: Array<{ x: number; y: number; overIndex: number }> = [];

  if (knotType === "trefoil") {
    // Three-lobe symmetric trefoil using cubic Béziers
    // We use 3 arcs that interweave. Each arc is a closed loop segment.
    const r = 100;
    // Main strand (closed loop with 3 lobes)
    const path = `M ${cx + r} ${cy} ` +
      `C ${cx + r * 1.5} ${cy - r * 0.5}, ${cx + r * 0.5} ${cy - r * 1.3}, ${cx} ${cy - r} ` +
      `C ${cx - r * 0.5} ${cy - r * 1.3}, ${cx - r * 1.5} ${cy - r * 0.5}, ${cx - r} ${cy} ` +
      `C ${cx - r * 1.5} ${cy + r * 0.5}, ${cx - r * 0.5} ${cy + r * 1.3}, ${cx} ${cy + r} ` +
      `C ${cx + r * 0.5} ${cy + r * 1.3}, ${cx + r * 1.5} ${cy + r * 0.5}, ${cx + r} ${cy} Z`;
    strands.push({ path, color: "#4F46E5" });
    // 3 crossings (over/under) at 3 symmetric points around center
    crossings = [
      { x: cx + r * 0.7, y: cy - r * 0.7, overIndex: 0 },
      { x: cx - r * 0.7, y: cy - r * 0.7, overIndex: 0 },
      { x: cx, y: cy + r * 1.0, overIndex: 0 },
    ];
  } else if (knotType === "figure8") {
    // Figure-eight knot (4_1) — more complex Bézier path
    const r = 80;
    const path = `M ${cx - r} ${cy} ` +
      `C ${cx - r * 1.5} ${cy - r}, ${cx - r * 0.5} ${cy - r * 1.5}, ${cx} ${cy - r} ` +
      `C ${cx + r * 0.5} ${cy - r * 0.5}, ${cx + r * 0.5} ${cy + r * 0.5}, ${cx} ${cy + r} ` +
      `C ${cx - r * 0.5} ${cy + r * 1.5}, ${cx + r * 1.5} ${cy + r}, ${cx + r} ${cy} ` +
      `C ${cx + r * 0.5} ${cy - r * 0.5}, ${cx - r * 0.5} ${cy + r * 0.5}, ${cx - r} ${cy} Z`;
    strands.push({ path, color: "#10B981" });
    crossings = [
      { x: cx - r * 0.3, y: cy - r * 0.5, overIndex: 0 },
      { x: cx + r * 0.3, y: cy + r * 0.5, overIndex: 0 },
      { x: cx, y: cy, overIndex: 0 },
      { x: cx - r * 0.7, y: cy + r * 0.3, overIndex: 0 },
    ];
  } else if (Array.isArray(spec.strands)) {
    // Custom knot with user-provided Bézier paths
    strands = spec.strands;
    crossings = Array.isArray(spec.crossings) ? spec.crossings : [];
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Strand (background, full color) */}
        {strands.map((s, i) => (
          <path
            key={`strand-${i}`}
            d={s.path}
            fill="none"
            stroke={s.color ?? "#4F46E5"}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* Over/under crossings — draw white gaps to make strand appear to cross over/under */}
        {crossings.map((c, i) => (
          <g key={`crossing-${i}`}>
            {/* White "gap" rectangle to break the strand visually */}
            <circle cx={c.x} cy={c.y} r={10} fill="white" />
            {/* Re-draw the strand segments around the gap to simulate over/under */}
            <circle cx={c.x} cy={c.y} r={2} fill={strands[0]?.color ?? "#4F46E5"} />
          </g>
        ))}
        {/* Crossings labels */}
        {crossings.length > 0 && (
          <text x={width / 2} y={height - 6} fontSize={10} fill="#6B7280" textAnchor="middle">
            {knotType} knot · {crossings.length} crossings
          </text>
        )}
      </svg>
    </div>
  );
}

// =====================================================================
// 22. Pictogram — symbol-based chart (Grade 1-3) — each symbol = N items
//     Great for early years: "5 apples = 5 🍎 symbols"
// =====================================================================
function PictogramSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Pictogram";
  const categories: string[] = Array.isArray(spec.categories) ? spec.categories : [];
  const values: number[] = Array.isArray(spec.values) ? spec.values : [];
  const symbol: string = spec.symbol ?? "●"; // emoji or character
  const symbolValue: number = spec.symbolValue ?? 1; // how much each symbol represents
  const colors: string[] = Array.isArray(spec.colors) ? spec.colors : PALETTE;

  const maxRows = Math.max(...values.map((v) => Math.ceil(v / symbolValue)), 1);
  const cellSize = 28;
  const labelWidth = 100;
  const width = Math.max(420, labelWidth + categories.length * (cellSize + 10) + 40);
  const height = 60 + maxRows * cellSize + 40;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-700">{title}</p>
        <CSVDownloadButton
          headers={["Category", "Value"]}
          rows={categories.map((cat, i) => [cat, values[i] ?? 0])}
          downloadName="pictogram.csv"
        />
      </div>
      <p className="text-[10px] text-gray-500 mb-2">Each {symbol} = {symbolValue}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {categories.map((cat, ci) => {
          const v = values[ci] ?? 0;
          const fullSymbols = Math.floor(v / symbolValue);
          const remainder = v - fullSymbols * symbolValue;
          const x = labelWidth + ci * (cellSize + 10);
          const color = colors[ci % colors.length];
          const symbols: ReactElement[] = [];
          for (let r = 0; r < fullSymbols; r++) {
            const y = 40 + r * cellSize;
            symbols.push(
              <text
                key={`full-${ci}-${r}`}
                x={x + cellSize / 2}
                y={y + cellSize - 4}
                fontSize={20}
                textAnchor="middle"
              >{symbol}</text>
            );
          }
          // Partial symbol (last one) if remainder > 0
          if (remainder > 0) {
            const y = 40 + fullSymbols * cellSize;
            symbols.push(
              <text
                key={`partial-${ci}`}
                x={x + cellSize / 2}
                y={y + cellSize - 4}
                fontSize={20}
                textAnchor="middle"
                opacity={remainder / symbolValue}
              >{symbol}</text>
            );
          }
          return (
            <g key={`cat-${ci}`}>
              {/* Category label */}
              <text x={10} y={40 + (maxRows - 1) * cellSize / 2 + 18} fontSize={11} fill="#374151" fontWeight={600}>
                {cat.length > 12 ? cat.slice(0, 12) + "…" : cat}
              </text>
              {/* Value label below */}
              <text x={x + cellSize / 2} y={height - 14} fontSize={11} fill={color} textAnchor="middle" fontWeight={700}>
                {v}
              </text>
              {/* Symbols (top-down column) */}
              {symbols}
              {/* Optional column dividers */}
              <line x1={x - 5} y1={30} x2={x - 5} y2={height - 30} stroke="#E5E7EB" strokeWidth={1} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =====================================================================
// 23. Tally chart — groups of 5 strokes (Grade 1-5) — IIII for 4, then
//     diagonal cross-stroke for the 5th
// =====================================================================
function TallySVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Tally Chart";
  const categories: string[] = Array.isArray(spec.categories) ? spec.categories : [];
  const counts: number[] = Array.isArray(spec.counts ?? spec.values) ? (spec.counts ?? spec.values) : [];

  const width = 480;
  const rowHeight = 38;
  const height = 60 + categories.length * rowHeight + 20;
  const labelWidth = 110;

  // Render tally marks: groups of 5 (4 vertical + 1 diagonal)
  const renderTally = (count: number, x: number, y: number) => {
    const elements: ReactElement[] = [];
    const fullGroups = Math.floor(count / 5);
    const remainder = count - fullGroups * 5;
    const strokeW = 2;
    const gap = 4;
    const groupGap = 10;
    const strokeH = 24;
    let curX = x;
    for (let g = 0; g < fullGroups; g++) {
      // 4 vertical strokes
      for (let i = 0; i < 4; i++) {
        elements.push(
          <line key={`t-${g}-${i}`} x1={curX} y1={y} x2={curX} y2={y + strokeH} stroke="#374151" strokeWidth={strokeW} />
        );
        curX += gap;
      }
      // Diagonal 5th stroke across the 4
      elements.push(
        <line key={`t-${g}-diag`} x1={curX - gap * 4 + 1} y1={y + strokeH - 2} x2={curX - 1} y2={y + 2} stroke="#EF4444" strokeWidth={2} />
      );
      curX += groupGap;
    }
    // Remaining strokes
    for (let i = 0; i < remainder; i++) {
      elements.push(
        <line key={`t-r-${i}`} x1={curX} y1={y} x2={curX} y2={y + strokeH} stroke="#374151" strokeWidth={strokeW} />
      );
      curX += gap;
    }
    return elements;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-700">{title}</p>
        <CSVDownloadButton
          headers={["Category", "Count"]}
          rows={categories.map((cat, i) => [cat, counts[i] ?? 0])}
          downloadName="tally.csv"
        />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {categories.map((cat, i) => {
          const c = counts[i] ?? 0;
          const y = 50 + i * rowHeight;
          const color = PALETTE[i % PALETTE.length];
          return (
            <g key={`row-${i}`}>
              <text x={10} y={y + 18} fontSize={12} fill="#374151" fontWeight={600}>
                {cat.length > 14 ? cat.slice(0, 14) + "…" : cat}
              </text>
              {/* Tally marks */}
              {renderTally(c, labelWidth, y)}
              {/* Count */}
              <text x={width - 30} y={y + 18} fontSize={13} fill={color} fontWeight={700}>
                {c}
              </text>
              {/* Row divider */}
              <line x1={10} y1={y + 28} x2={width - 10} y2={y + 28} stroke="#E5E7EB" strokeWidth={1} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =====================================================================
// 24. Carroll diagram — 2x2 grid sorting by two Yes/No attributes
//     (Grade 4-6) — great for "sort shapes by color AND size"
// =====================================================================
function CarrollSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Carroll Diagram";
  const attributeX: [string, string] = spec.attributeX ?? ["Yes", "No"];
  const attributeY: [string, string] = spec.attributeY ?? ["Yes", "No"];
  const labelX: string = spec.labelX ?? "Attribute X";
  const labelY: string = spec.labelY ?? "Attribute Y";
  const cells: {
    topLeft: string[];
    topRight: string[];
    bottomLeft: string[];
    bottomRight: string[];
  } = spec.cells ?? {};

  const width = 480;
  const height = 360;
  const margin = 60;
  const cellW = (width - margin * 2) / 2;
  const cellH = (height - margin * 2) / 2;
  const cellColors = ["#DBEAFE", "#FEF3C7", "#DCFCE7", "#FCE7F3"];

  const cellEntries = [
    { items: cells.topLeft, x: margin, y: margin, label: `${attributeY[0]} / ${attributeX[0]}` },
    { items: cells.topRight, x: margin + cellW, y: margin, label: `${attributeY[0]} / ${attributeX[1]}` },
    { items: cells.bottomLeft, x: margin, y: margin + cellH, label: `${attributeY[1]} / ${attributeX[0]}` },
    { items: cells.bottomRight, x: margin + cellW, y: margin + cellH, label: `${attributeY[1]} / ${attributeX[1]}` },
  ];

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Attribute labels */}
        <text x={width / 2} y={20} fontSize={13} fill="#1E40AF" textAnchor="middle" fontWeight={700}>{labelX}</text>
        <text x={20} y={height / 2} fontSize={13} fill="#1E40AF" textAnchor="middle" fontWeight={700} transform={`rotate(-90, 20, ${height / 2})`}>{labelY}</text>

        {/* Yes/No labels on X axis */}
        <text x={margin + cellW / 2} y={45} fontSize={12} fill="#374151" textAnchor="middle" fontWeight={600}>{attributeX[0]}</text>
        <text x={margin + cellW + cellW / 2} y={45} fontSize={12} fill="#374151" textAnchor="middle" fontWeight={600}>{attributeX[1]}</text>

        {/* Yes/No labels on Y axis */}
        <text x={50} y={margin + cellH / 2 + 4} fontSize={12} fill="#374151" textAnchor="middle" fontWeight={600}>{attributeY[0]}</text>
        <text x={50} y={margin + cellH + cellH / 2 + 4} fontSize={12} fill="#374151" textAnchor="middle" fontWeight={600}>{attributeY[1]}</text>

        {/* Cells */}
        {cellEntries.map((cell, i) => (
          <g key={`cell-${i}`}>
            <rect x={cell.x} y={cell.y} width={cellW} height={cellH} fill={cellColors[i]} stroke="#9CA3AF" strokeWidth={1.5} />
            {/* Cell label (top-left corner) */}
            <text x={cell.x + 8} y={cell.y + 16} fontSize={10} fill="#6B7280" fontWeight={600}>
              {cell.label}
            </text>
            {/* Items */}
            {(cell.items ?? []).map((item: string, j: number) => (
              <text
                key={`item-${i}-${j}`}
                x={cell.x + cellW / 2}
                y={cell.y + cellH / 2 + (j - (cell.items.length - 1) / 2) * 18 + 4}
                fontSize={13}
                fill="#1F2937"
                textAnchor="middle"
                fontWeight={500}
              >
                {item}
              </text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

// =====================================================================
// 25. Ogive — cumulative frequency curve (Grade 9-12)
// =====================================================================
function OgiveSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Ogive (Cumulative Frequency)";
  const xLabel = spec.xLabel ?? "Upper Class Boundary";
  const yLabel = spec.yLabel ?? "Cumulative Frequency";
  // Either explicit points or computed from bins
  let points: Array<[number, number]> = [];
  if (Array.isArray(spec.points)) {
    points = spec.points;
  } else if (Array.isArray(spec.bins)) {
    let cumulative = 0;
    for (const b of spec.bins) {
      cumulative += b.count;
      points.push([b.end, cumulative]);
    }
  }
  // Prepend the starting point (lower boundary of first bin, 0)
  if (points.length > 0) {
    const firstStart = Array.isArray(spec.bins) ? spec.bins[0].start : points[0][0] - 10;
    points = [[firstStart, 0], ...points];
  }

  const width = 480;
  const height = 320;
  const padding = { left: 60, right: 30, top: 30, bottom: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  if (points.length === 0) return <p className="text-xs text-gray-500">No data for ogive.</p>;

  const allX = points.map((p) => p[0]);
  const allY = points.map((p) => p[1]);
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMax = Math.max(...allY) * 1.1 || 10;
  const xPad = (xMax - xMin) * 0.05 || 1;
  const xMinP = xMin - xPad;
  const xMaxP = xMax + xPad;

  const toSvgX = (x: number) => padding.left + ((x - xMinP) / (xMaxP - xMinP)) * plotW;
  const toSvgY = (v: number) => padding.top + plotH - (v / yMax) * plotH;

  // Path: move to start, then L lines
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toSvgX(p[0]).toFixed(2)} ${toSvgY(p[1]).toFixed(2)}`).join(" ");

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Y grid */}
        {Array.from({ length: 6 }, (_, i) => {
          const yv = (yMax * i) / 5;
          return (
            <g key={`yg-${i}`}>
              <line x1={padding.left} y1={toSvgY(yv)} x2={padding.left + plotW} y2={toSvgY(yv)} stroke="#E5E7EB" strokeWidth={1} />
              <text x={padding.left - 8} y={toSvgY(yv) + 3} fontSize={10} fill="#6B7280" textAnchor="end">{yv.toFixed(0)}</text>
            </g>
          );
        })}
        {/* X labels */}
        {points.map((p, i) => (
          <text key={`xl-${i}`} x={toSvgX(p[0])} y={padding.top + plotH + 14} fontSize={10} fill="#6B7280" textAnchor="middle">
            {p[0]}
          </text>
        ))}
        {/* Cumulative frequency line */}
        <path d={path} fill="none" stroke="#4F46E5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={`pt-${i}`} cx={toSvgX(p[0])} cy={toSvgY(p[1])} r={4} fill="#4F46E5" stroke="white" strokeWidth={1.5} />
        ))}
        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        <line x1={padding.left} y1={padding.top + plotH} x2={padding.left + plotW} y2={padding.top + plotH} stroke="#374151" strokeWidth={1.5} />
        <text x={width / 2} y={height - 8} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600}>{xLabel}</text>
        <text x={14} y={height / 2} fontSize={11} fill="#374151" textAnchor="middle" fontWeight={600} transform={`rotate(-90, 14, ${height / 2})`}>{yLabel}</text>
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">{points.length - 1} data points · Total cumulative = {Math.max(...allY)}</p>
    </div>
  );
}

// =====================================================================
// 26. Unit circle — for trigonometry (Grade 10-12)
//     Shows a circle of radius 1 with a rotating angle θ, and marks
//     sin(θ) on y-axis and cos(θ) on x-axis.
// =====================================================================
function UnitCircleSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Unit Circle";
  const angle: number = (spec.angle ?? 45) * Math.PI / 180; // radians
  const showLabels: boolean = spec.showLabels !== false;

  const width = 420;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const r = 120;

  const pointX = cx + r * Math.cos(angle);
  const pointY = cy - r * Math.sin(angle);
  const cosX = cx + r * Math.cos(angle);
  const sinY = cy - r * Math.sin(angle);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-[10px] text-gray-500 mb-1">θ = {(angle * 180 / Math.PI).toFixed(0)}° · cos θ = {Math.cos(angle).toFixed(3)} · sin θ = {Math.sin(angle).toFixed(3)}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Axes */}
        <line x1={cx - r - 20} y1={cy} x2={cx + r + 20} y2={cy} stroke="#374151" strokeWidth={1.5} />
        <line x1={cx} y1={cy - r - 20} x2={cx} y2={cy + r + 20} stroke="#374151" strokeWidth={1.5} />
        {/* Axis labels */}
        <text x={cx + r + 24} y={cy + 4} fontSize={11} fill="#374151" fontWeight={600}>x</text>
        <text x={cx + 4} y={cy - r - 22} fontSize={11} fill="#374151" fontWeight={600}>y</text>
        {/* Unit circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4F46E5" strokeWidth={2} />
        {/* Radius line (from origin to point on circle) */}
        <line x1={cx} y1={cy} x2={pointX} y2={pointY} stroke="#10B981" strokeWidth={2.5} />
        {/* cos θ projection (horizontal from point to y-axis) */}
        <line x1={cx} y1={cy} x2={cosX} y2={cy} stroke="#EF4444" strokeWidth={2} strokeDasharray="4 3" />
        {/* sin θ projection (vertical from point to x-axis) */}
        <line x1={pointX} y1={pointY} x2={pointX} y2={cy} stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 3" />
        {/* Angle arc */}
        <path
          d={`M ${cx + 30} ${cy} A 30 30 0 0 ${angle > Math.PI ? 1 : 0} ${cx + 30 * Math.cos(angle)} ${cy - 30 * Math.sin(angle)}`}
          fill="none"
          stroke="#8B5CF6"
          strokeWidth={2}
        />
        {/* Point on circle */}
        <circle cx={pointX} cy={pointY} r={6} fill="#10B981" stroke="white" strokeWidth={2} />
        {/* Labels */}
        {showLabels && (
          <>
            <text x={cx + (cosX - cx) / 2} y={cy + 14} fontSize={11} fill="#EF4444" textAnchor="middle" fontWeight={700}>cos θ</text>
            <text x={pointX + 8} y={(pointY + cy) / 2} fontSize={11} fill="#F59E0B" fontWeight={700}>sin θ</text>
            <text x={cx + 38} y={cy - 8} fontSize={11} fill="#8B5CF6" fontWeight={700}>θ</text>
            <text x={cx + (pointX - cx) / 2 - 8} y={(cy + pointY) / 2 - 8} fontSize={11} fill="#10B981" fontWeight={700}>r=1</text>
          </>
        )}
      </svg>
    </div>
  );
}

// =====================================================================
// 27. Geometric transform — reflect/rotate/translate/enlarge a shape
//     (Grade 9-12) — shows original shape + transformed shape + axis of symmetry
// =====================================================================
function GeometricTransformSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Geometric Transformation";
  const transformType: string = spec.transformType ?? "reflect"; // reflect | rotate | translate | enlarge
  const original: Array<[number, number]> = Array.isArray(spec.original) ? spec.original : [];
  const transformed: Array<[number, number]> = Array.isArray(spec.transformed) ? spec.transformed : [];
  const mirrorLine: "x" | "y" | "y=x" | "y=-x" | "custom" = spec.mirrorLine ?? "y";
  const range: [number, number] = spec.range ?? [-8, 8];

  const width = 420;
  const height = 360;
  const padding = 30;
  const toSvgX = (x: number) => padding + ((x - range[0]) / (range[1] - range[0])) * (width - 2 * padding);
  const toSvgY = (y: number) => height - padding - ((y - range[0]) / (range[1] - range[0])) * (height - 2 * padding);

  // Original path
  const origPath = original.map((v, i) => `${i === 0 ? "M" : "L"} ${toSvgX(v[0]).toFixed(2)} ${toSvgY(v[1]).toFixed(2)}`).join(" ") + (original.length > 0 ? " Z" : "");
  // Transformed path
  const transPath = transformed.map((v, i) => `${i === 0 ? "M" : "L"} ${toSvgX(v[0]).toFixed(2)} ${toSvgY(v[1]).toFixed(2)}`).join(" ") + (transformed.length > 0 ? " Z" : "");

  // Mirror line
  let mirrorPath = "";
  if (mirrorLine === "x") mirrorPath = `M ${padding} ${toSvgY(0)} L ${width - padding} ${toSvgY(0)}`;
  else if (mirrorLine === "y") mirrorPath = `M ${toSvgX(0)} ${padding} L ${toSvgX(0)} ${height - padding}`;
  else if (mirrorLine === "y=x") mirrorPath = `M ${toSvgX(range[0])} ${toSvgY(range[0])} L ${toSvgX(range[1])} ${toSvgY(range[1])}`;
  else if (mirrorLine === "y=-x") mirrorPath = `M ${toSvgX(range[0])} ${toSvgY(range[1])} L ${toSvgX(range[1])} ${toSvgY(range[0])}`;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-[10px] text-gray-500 mb-1">Type: <span className="font-mono font-semibold">{transformType}</span>{mirrorLine !== "custom" && transformType === "reflect" ? ` · mirror line: ${mirrorLine}` : ""}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Grid */}
        {Array.from({ length: 17 }, (_, i) => {
          const v = range[0] + ((range[1] - range[0]) * i) / 16;
          return (
            <g key={`grid-${i}`} opacity={0.3}>
              <line x1={toSvgX(v)} y1={padding} x2={toSvgX(v)} y2={height - padding} stroke="#E5E7EB" strokeWidth={v === 0 ? 1 : 0.5} />
              <line x1={padding} y1={toSvgY(v)} x2={width - padding} y2={toSvgY(v)} stroke="#E5E7EB" strokeWidth={v === 0 ? 1 : 0.5} />
            </g>
          );
        })}
        {/* Axes */}
        <line x1={padding} y1={toSvgY(0)} x2={width - padding} y2={toSvgY(0)} stroke="#374151" strokeWidth={1.5} />
        <line x1={toSvgX(0)} y1={padding} x2={toSvgX(0)} y2={height - padding} stroke="#374151" strokeWidth={1.5} />
        {/* Mirror line (for reflection) */}
        {transformType === "reflect" && mirrorPath && (
          <path d={mirrorPath} stroke="#EF4444" strokeWidth={2} strokeDasharray="6 4" opacity={0.8} />
        )}
        {/* Original shape (dashed gray) */}
        {origPath && <path d={origPath} fill="#9CA3AF" fillOpacity={0.2} stroke="#6B7280" strokeWidth={2} strokeDasharray="4 2" />}
        {/* Transformed shape (solid indigo) */}
        {transPath && <path d={transPath} fill="#4F46E5" fillOpacity={0.25} stroke="#4F46E5" strokeWidth={2.5} />}
        {/* Vertex labels for original */}
        {original.map((v, i) => (
          <text key={`o-${i}`} x={toSvgX(v[0]) + 4} y={toSvgY(v[1]) - 4} fontSize={10} fill="#6B7280" fontWeight={600}>
            {String.fromCharCode(65 + i)}
          </text>
        ))}
        {/* Vertex labels for transformed */}
        {transformed.map((v, i) => (
          <text key={`t-${i}`} x={toSvgX(v[0]) + 4} y={toSvgY(v[1]) - 4} fontSize={10} fill="#4F46E5" fontWeight={700}>
            {String.fromCharCode(65 + i)}&apos;
          </text>
        ))}
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">
        <span className="text-gray-500">⬤ Dashed = original</span> · <span className="text-indigo-600">⬤ Solid = transformed</span>
        {transformType === "reflect" && <span> · <span className="text-rose-600">⬤ Red dashed = mirror line</span></span>}
      </p>
    </div>
  );
}

// =====================================================================
// 28. 3D Axes — x/y/z coordinate axes (Grade 11-university)
//     Shows 3D origin with three axes, optionally a point in space
// =====================================================================
function Axes3DSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "3D Coordinate System";
  const points: Array<{ x: number; y: number; z: number; label?: string; color?: string }> = Array.isArray(spec.points) ? spec.points : [];
  const range: [number, number] = spec.range ?? [-3, 3];

  const width = 420;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const axisLen = 110;

  // Project 3D (x, y, z) to 2D using isometric-ish projection
  // x-axis: goes right-down (45°)
  // y-axis: goes right-up (standard)
  // z-axis: goes straight up
  const project = (x: number, y: number, z: number) => {
    const isoX = (x - y) * Math.cos(Math.PI / 6); // 30°
    const isoY = -(z) * 1.0 + (x + y) * Math.sin(Math.PI / 6);
    return { x: cx + isoX * (axisLen / (range[1] - range[0]) * 2), y: cy + isoY * (axisLen / (range[1] - range[0]) * 2) };
  };

  // Axes endpoints
  const origin2d = project(0, 0, 0);
  const xEnd = project(range[1], 0, 0);
  const yEnd = project(0, range[1], 0);
  const zEnd = project(0, 0, range[1]);
  const xNegEnd = project(range[0], 0, 0);
  const yNegEnd = project(0, range[0], 0);
  const zNegEnd = project(0, 0, range[0]);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Negative axes (dashed) */}
        <line x1={origin2d.x} y1={origin2d.y} x2={xNegEnd.x} y2={xNegEnd.y} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 2" />
        <line x1={origin2d.x} y1={origin2d.y} x2={yNegEnd.x} y2={yNegEnd.y} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 2" />
        <line x1={origin2d.x} y1={origin2d.y} x2={zNegEnd.x} y2={zNegEnd.y} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 2" />
        {/* Positive axes (solid colored) */}
        <line x1={origin2d.x} y1={origin2d.y} x2={xEnd.x} y2={xEnd.y} stroke="#EF4444" strokeWidth={2} />
        <line x1={origin2d.x} y1={origin2d.y} x2={yEnd.x} y2={yEnd.y} stroke="#10B981" strokeWidth={2} />
        <line x1={origin2d.x} y1={origin2d.y} x2={zEnd.x} y2={zEnd.y} stroke="#4F46E5" strokeWidth={2} />
        {/* Arrow heads */}
        <polygon points={`${xEnd.x},${xEnd.y} ${xEnd.x - 6},${xEnd.y - 2} ${xEnd.x - 6},${xEnd.y + 2}`} fill="#EF4444" />
        <polygon points={`${yEnd.x},${yEnd.y} ${yEnd.x - 6},${yEnd.y + 6} ${yEnd.x + 2},${yEnd.y + 2}`} fill="#10B981" />
        <polygon points={`${zEnd.x},${zEnd.y} ${zEnd.x - 3},${zEnd.y + 6} ${zEnd.x + 3},${zEnd.y + 6}`} fill="#4F46E5" />
        {/* Axis labels */}
        <text x={xEnd.x + 8} y={xEnd.y + 14} fontSize={13} fill="#EF4444" fontWeight={700}>x</text>
        <text x={yEnd.x + 8} y={yEnd.y + 6} fontSize={13} fill="#10B981" fontWeight={700}>y</text>
        <text x={zEnd.x + 4} y={zEnd.y - 8} fontSize={13} fill="#4F46E5" fontWeight={700}>z</text>
        {/* Origin marker */}
        <circle cx={origin2d.x} cy={origin2d.y} r={3} fill="#1F2937" />
        <text x={origin2d.x - 12} y={origin2d.y + 14} fontSize={10} fill="#6B7280" fontWeight={600}>O</text>
        {/* Points in 3D space */}
        {points.map((p, i) => {
          const proj = project(p.x, p.y, p.z);
          const color = p.color ?? PALETTE[i % PALETTE.length];
          return (
            <g key={`pt-${i}`}>
              {/* Projection lines to each axis (dashed) */}
              <line x1={proj.x} y1={proj.y} x2={project(p.x, 0, 0).x} y2={project(p.x, 0, 0).y} stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
              <line x1={proj.x} y1={proj.y} x2={project(0, p.y, 0).x} y2={project(0, p.y, 0).y} stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
              <line x1={proj.x} y1={proj.y} x2={project(0, 0, p.z).x} y2={project(0, 0, p.z).y} stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
              {/* Point */}
              <circle cx={proj.x} cy={proj.y} r={5} fill={color} stroke="white" strokeWidth={1.5} />
              {/* Label */}
              {p.label && (
                <text x={proj.x + 8} y={proj.y - 6} fontSize={11} fill={color} fontWeight={700}>
                  {p.label}
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
// 29. Two-way table (contingency table) — for probability/statistics
//     (Grade 9-12) — rows × columns with cell counts, row/col totals
// =====================================================================
function TwoWayTableSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Two-Way Table";
  const rowLabels: string[] = Array.isArray(spec.rowLabels) ? spec.rowLabels : [];
  const colLabels: string[] = Array.isArray(spec.colLabels) ? spec.colLabels : [];
  const data: number[][] = Array.isArray(spec.data) ? spec.data : [];
  const rowLabel: string = spec.rowLabel ?? "Row";
  const colLabel: string = spec.colLabel ?? "Column";

  if (rowLabels.length === 0 || colLabels.length === 0) {
    return <p className="text-xs text-gray-500">No data for two-way table.</p>;
  }

  // Compute row/column totals
  const rowTotals = data.map((r) => r.reduce((s, v) => s + v, 0));
  const colTotals = colLabels.map((_, c) => data.reduce((s, r) => s + (r[c] ?? 0), 0));
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0);

  const width = 480;
  const height = 80 + (rowLabels.length + 2) * 32;
  const labelColW = 100;
  const colWidth = (width - labelColW - 50) / colLabels.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-700">{title}</p>
        <CSVDownloadButton
          headers={[rowLabel, ...colLabels, "Total"]}
          rows={rowLabels.map((r, ri) => [r, ...(data[ri] ?? []), rowTotals[ri]])}
          downloadName="two-way-table.csv"
        />
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-2 px-2 text-gray-600 font-semibold">{rowLabel} \ {colLabel}</th>
              {colLabels.map((c, ci) => (
                <th key={`col-${ci}`} className="py-2 px-2 text-center text-gray-700 font-semibold">{c}</th>
              ))}
              <th className="py-2 px-2 text-center text-indigo-700 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((r, ri) => (
              <tr key={`row-${ri}`} className="border-b border-gray-100">
                <td className="py-1.5 px-2 text-gray-700 font-semibold">{r}</td>
                {(data[ri] ?? []).map((v, ci) => (
                  <td key={`cell-${ri}-${ci}`} className="py-1.5 px-2 text-center text-gray-800">{v}</td>
                ))}
                <td className="py-1.5 px-2 text-center text-indigo-700 font-bold">{rowTotals[ri]}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 bg-indigo-50/40">
              <td className="py-1.5 px-2 text-indigo-700 font-bold">Total</td>
              {colTotals.map((v, ci) => (
                <td key={`tot-${ci}`} className="py-1.5 px-2 text-center text-indigo-700 font-bold">{v}</td>
              ))}
              <td className="py-1.5 px-2 text-center text-indigo-800 font-extrabold">{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500 mt-1">{rowLabels.length} × {colLabels.length} table · n = {grandTotal}</p>
    </div>
  );
}

// =====================================================================
// 30. ER Diagram / Database Schema — Access-style table view
//      Shows tables as boxes with field lists, primary keys (🔑),
//      foreign keys (🔗), and relationship lines between FKs and PKs
// =====================================================================
function ERDiagramSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "Database Schema (ER Diagram)";
  type Field = { name: string; type: string; pk?: boolean; fk?: string };
  type Table = {
    name: string;
    fields: Field[];
    color?: string;
  };
  const tables: Table[] = Array.isArray(spec.tables) ? spec.tables : [];
  // Optional relationships: [{from: "table1.field", to: "table2.field", label?: "..."}]
  const relationships: Array<{ from: string; to: string; label?: string }> = Array.isArray(spec.relationships) ? spec.relationships : [];

  // Layout: arrange tables in a grid (3 per row)
  const tablesPerRow = Math.min(3, Math.ceil(Math.sqrt(tables.length)));
  const tableWidth = 220;
  const tableHeight = (table: Table) => 36 + table.fields.length * 22 + 8;
  const tableGap = 30;
  const rows = Math.ceil(tables.length / tablesPerRow);
  const width = Math.max(420, tablesPerRow * (tableWidth + tableGap) + 20);
  const height = Math.max(300, rows * (Math.max(...tables.map((t) => tableHeight(t))) + tableGap) + 60);

  // Position tables in a grid
  const positions = tables.map((_, i) => {
    const row = Math.floor(i / tablesPerRow);
    const col = i % tablesPerRow;
    return {
      x: 20 + col * (tableWidth + tableGap),
      y: 50 + row * (Math.max(...tables.map((t) => tableHeight(t))) + tableGap),
    };
  });

  // Helper: find table + field coordinates for relationships
  const findFieldCoords = (ref: string): { x: number; y: number; tableIdx: number } | null => {
    const [tableName, fieldName] = ref.split(".");
    const tableIdx = tables.findIndex((t) => t.name === tableName);
    if (tableIdx < 0) return null;
    const fieldIdx = tables[tableIdx].fields.findIndex((f) => f.name === fieldName);
    if (fieldIdx < 0) return null;
    const pos = positions[tableIdx];
    return {
      x: pos.x + tableWidth,
      y: pos.y + 36 + fieldIdx * 22 + 11,
      tableIdx,
    };
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-[10px] text-gray-500 mb-2">🔑 Primary key · 🔗 Foreign key (refers to another table)</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-gray-50 rounded-lg">
        {/* Relationships (lines) drawn first so they're behind tables */}
        {relationships.map((rel, i) => {
          const from = findFieldCoords(rel.from);
          const to = findFieldCoords(rel.to);
          if (!from || !to) return null;
          const fromLeft = { x: from.x - tableWidth, y: from.y };
          const toLeft = { x: to.x - tableWidth, y: to.y };
          // Connect from left side of one to right side of other (whichever side is closer)
          const fromX = Math.abs(from.x - to.x) > Math.abs(fromLeft.x - toLeft.x) ? fromLeft.x : from.x;
          const toX = fromX === from.x ? toLeft.x : to.x;
          const midX = (fromX + toX) / 2;
          const path = `M ${fromX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${toX} ${to.y}`;
          return (
            <g key={`rel-${i}`}>
              <path d={path} fill="none" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 2" />
              {/* Endpoint dots */}
              <circle cx={fromX} cy={from.y} r={3} fill="#4F46E5" />
              <circle cx={toX} cy={to.y} r={3} fill="#EF4444" />
              {/* Label */}
              {rel.label && (
                <text x={midX} y={(from.y + to.y) / 2 - 4} fontSize={9} fill="#6B7280" textAnchor="middle" fontWeight={600}>
                  {rel.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Tables */}
        {tables.map((table, ti) => {
          const pos = positions[ti];
          const h = tableHeight(table);
          const color = table.color ?? PALETTE[ti % PALETTE.length];
          return (
            <g key={`table-${ti}`}>
              {/* Header */}
              <rect x={pos.x} y={pos.y} width={tableWidth} height={36} rx={6} fill={color} opacity={0.95} />
              <text x={pos.x + 10} y={pos.y + 22} fontSize={13} fill="white" fontWeight={700}>
                {table.name}
              </text>
              {/* Body */}
              <rect x={pos.x} y={pos.y + 36} width={tableWidth} height={h - 36} rx={0} fill="white" stroke={color} strokeWidth={1.5} />
              {/* Field rows */}
              {table.fields.map((f, fi) => {
                const y = pos.y + 36 + fi * 22 + 14;
                return (
                  <g key={`field-${ti}-${fi}`}>
                    <text x={pos.x + 6} y={y + 4} fontSize={10} fill="#1F2937" fontWeight={f.pk ? 700 : 400}>
                      {f.pk ? "🔑 " : f.fk ? "🔗 " : "   "}{f.name}
                    </text>
                    <text x={pos.x + tableWidth - 6} y={y + 4} fontSize={9} fill="#6B7280" textAnchor="end" fontFamily="monospace">
                      {f.type}
                    </text>
                    {fi < table.fields.length - 1 && (
                      <line x1={pos.x + 6} y1={y + 11} x2={pos.x + tableWidth - 6} y2={y + 11} stroke="#F3F4F6" strokeWidth={1} />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">{tables.length} tables · {relationships.length} relationships</p>
    </div>
  );
}

// =====================================================================
// 31. CSV Preview — preview a CSV table (rendered as a styled HTML table)
//      Also offers a download link for the CSV file
// =====================================================================
function CSVPreviewSVG({ spec }: { spec: any }) {
  const title = spec.title ?? "CSV Table";
  const headers: string[] = Array.isArray(spec.headers) ? spec.headers : [];
  const rows: string[][] = Array.isArray(spec.rows) ? spec.rows : [];
  const downloadName: string = (spec.downloadName ?? "table.csv").toString();

  // Build the CSV text for download
  const escapeCSV = (val: string) => {
    if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
    return val;
  };
  const csvText = [headers, ...rows]
    .map((r) => r.map((c) => escapeCSV(String(c ?? ""))).join(","))
    .join("\n");

  const downloadCSV = () => {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName.endsWith(".csv") ? downloadName : `${downloadName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-700">{title}</p>
        <button
          onClick={downloadCSV}
          className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold hover:bg-emerald-100 flex items-center gap-1"
          title="Download as CSV (opens in Excel)"
        >
          📄 Download CSV
        </button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} className="px-2 py-1.5 text-left text-gray-700 font-semibold border-b border-gray-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-indigo-50/30">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 text-gray-800 border-b border-gray-50">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={headers.length} className="px-2 py-3 text-center text-gray-400 italic">(no rows)</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mt-1">
        {headers.length} columns · {rows.length} rows · opens in Excel, Google Sheets, LibreOffice
      </p>
    </div>
  );
}
