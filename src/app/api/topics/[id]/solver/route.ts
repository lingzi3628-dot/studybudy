import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/topics/[id]/solver
 * Body: { problem }
 *
 * Step-by-step math problem solver. Returns:
 *   { problem, steps: [{ explanation, expression }], finalAnswer, check }
 *
 * AI is told the topic context (e.g. "Quadratic Equations") so it can use the
 * right technique and notation.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const problem: string = (body.problem ?? "").toString().trim();

  if (!problem) {
    return NextResponse.json({ error: "Missing problem" }, { status: 400 });
  }

  const topic = await db.topic.findUnique({ where: { id } });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const rl = checkRateLimit(user.id, user.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are a math tutor specialised in "${topic.name}" (${topic.subject}). ` +
        `Solve the student's problem step by step. Show each step clearly with: ` +
        `(1) what you're doing in plain English, (2) the mathematical expression. ` +
        `Return ONLY valid JSON:\n` +
        JSON.stringify(
          {
            problem: "the problem you solved",
            steps: [
              {
                explanation: "First, I isolate x by subtracting 5 from both sides",
                expression: "2x = 10",
              },
            ],
            finalAnswer: "x = 5",
            check: "Substitute back: 2(5) + 5 = 15 ✓",
          },
          null,
          2
        ) +
        `\nIf the problem is not a math problem, still solve it step-by-step and return an empty check field.`,
    },
    { role: "user", content: `Solve this problem step by step: ${problem}` },
  ];

  try {
    const json = await callAIJson<{
      problem?: string;
      steps?: { explanation: string; expression: string }[];
      finalAnswer?: string;
      check?: string;
    }>(messages, apiKey);

    return NextResponse.json({
      problem: json.problem ?? problem,
      steps: json.steps ?? [],
      finalAnswer: json.finalAnswer ?? "",
      check: json.check ?? "",
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    return NextResponse.json(
      { error: "Solver call failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
