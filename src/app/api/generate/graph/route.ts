import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { parse, simplify } from "mathjs";

export const runtime = "nodejs";

type GraphResult = {
  equation: string;
  type: string;
  slope: number | null;
  yIntercept: number | null;
  vertex: { x: number; y: number } | null;
  samplePoints: { x: number; y: number }[];
  explanation: string;
};

/**
 * POST /api/generate/graph
 * Body: { equation }
 *
 * Parses the equation with mathjs, evaluates sample points across a
 * symmetric x range, and asks the AI for a plain-English explanation.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const equation = (body.equation ?? "").toString().trim();

  if (!equation) {
    return NextResponse.json({ error: "Missing equation" }, { status: 400 });
  }

  const rl = checkRateLimit(user.id, user.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  // Try to parse "y = 2x + 3" → "2x + 3" and build a mathjs expression
  let expr = equation.replace(/^\s*y\s*=\s*/i, "").trim();
  // implicit multiplication: 2x -> 2*x, 3x^2 -> 3*x^2
  expr = expr
    .replace(/(\d)([a-zA-Z])/g, "$1*$2")
    .replace(/\)([a-zA-Z(])/g, ")*$1")
    .replace(/([a-zA-Z])\(/g, "$1*(");

  let node;
  try {
    node = parse(expr);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Could not parse equation", detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }

  // sample points across [-10, 10] in 0.5 steps (41 points)
  const samplePoints: { x: number; y: number }[] = [];
  for (let i = -10; i <= 10; i += 0.5) {
    try {
      const y = node.evaluate({ x: i });
      if (typeof y === "number" && Number.isFinite(y)) {
        samplePoints.push({ x: i, y: Math.round(y * 1000) / 1000 });
      }
    } catch {
      // skip point
    }
  }

  // try to detect type via simplified form
  const simplified = simplify(node).toString();
  let type = "function";
  let slope: number | null = null;
  let yIntercept: number | null = null;
  let vertex: { x: number; y: number } | null = null;

  // linear detection: y = m*x + b
  const linearMatch = simplified.match(/^([-\d.]+)\s*\*\s*x\s*([+\-]\s*[\d.]+)?$/);
  if (linearMatch) {
    type = "linear";
    slope = Number(linearMatch[1]);
    yIntercept = linearMatch[2] ? Number(linearMatch[2].replace(/\s/g, "")) : 0;
  } else if (simplified.includes("^2") || simplified.includes("^3")) {
    type = simplified.includes("^3") ? "cubic" : "quadratic";
    // try to find vertex for quadratic
    if (type === "quadratic") {
      try {
        // derivative: dy/dx = 2a*x + b → solve for x = -b/(2a)
        // sample-based approximation: find min/max in samplePoints
        const ys = samplePoints.map((p) => p.y);
        const extremaIdx = ys.indexOf(Math.max(...ys));
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const absMax = Math.max(Math.abs(minY), Math.abs(maxY));
        const vertexIdx = Math.abs(ys[extremaIdx]) === absMax ? extremaIdx : ys.indexOf(minY);
        if (vertexIdx >= 0) {
          vertex = samplePoints[vertexIdx];
        }
      } catch {
        // ignore
      }
    }
  }

  // AI explanation (best-effort — skip if it fails)
  let explanation = "";
  try {
    const userRec = await db.user.findUnique({
      where: { id: user.id },
      select: { encryptedApiKey: true },
    });
    const apiKey = userRec?.encryptedApiKey
      ? decryptApiKey(userRec.encryptedApiKey)
      : null;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          `Explain the equation "${equation}" in simple terms for a student. Return JSON:\n` +
          JSON.stringify(
            {
              type: "",
              slope: null,
              y_intercept: null,
              vertex: null,
              sample_points: [],
              explanation: "",
            },
            null,
            2
          ),
      },
      { role: "user", content: `Equation: ${equation}` },
    ];

    const aiJson = await callAIJson<{
      explanation?: string;
    }>(messages, apiKey, { userId: user.id, route: "/api/generate/graph" });
    explanation = aiJson.explanation ?? "";
  } catch (e: any) {
    refundRateLimit(user.id);
    // fallback to a templated explanation
    if (type === "linear" && slope !== null && yIntercept !== null) {
      explanation = `This is a linear equation. The slope is ${slope}, meaning the line rises by ${slope} units for every 1 unit it moves to the right. The y-intercept is ${yIntercept}, so the line crosses the y-axis at (0, ${yIntercept}).`;
    } else {
      explanation = `This is a ${type} equation.`;
    }
  }

  const result: GraphResult = {
    equation,
    type,
    slope,
    yIntercept,
    vertex,
    samplePoints: samplePoints.slice(0, 41),
    explanation,
  };

  return NextResponse.json({ ...result, remaining: rl.remaining });
}
