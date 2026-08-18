import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/search
 * Body: { query }
 *
 * Returns: { summary, key_points[], related_topics[], sample_question }
 *
 * 402 = upgrade/limit/insufficient tokens (friendly upgrade card in UI)
 * 500 = server-side error (DB error, AI failure, etc.)
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const query = (body.query ?? "").toString().trim();

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const rl = checkRateLimit(user.id, user.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You've reached your daily AI limit. Come back tomorrow or upgrade to Premium for more!", limit: rl.limit, resetAt: rl.resetAt, code: "DAILY_LIMIT", needsUpgrade: true },
      { status: 429 }
    );
  }

  // Check & deduct tokens BEFORE making the AI call
  const deduct = await checkAndDeductTokens(user.id, "search");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't process your search right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey
    ? decryptApiKey(userRec.encryptedApiKey)
    : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are a helpful tutor. User asks: "${query.slice(0, 500)}".\n` +
        "Return JSON with:\n" +
        "- summary: a concise explanation (2-4 sentences)\n" +
        "- key_points: array of 3-5 short bullet strings\n" +
        "- related_topics: array of 3-5 strings\n" +
        "- sample_question: a multiple-choice question object\n" +
        "Format:\n" +
        JSON.stringify(
          {
            summary: "",
            key_points: ["", ""],
            related_topics: ["", ""],
            sample_question: {
              question: "",
              options: ["", "", "", ""],
              correct_index: 0,
              explanation: "",
            },
          },
          null,
          2
        ),
    },
    { role: "user", content: query.slice(0, 1000) },
  ];

  try {
    const json = await callAIJson<{
      summary?: string;
      key_points?: string[];
      related_topics?: string[];
      sample_question?: {
        question: string;
        options: string[];
        correct_index: number;
        explanation: string;
      };
    }>(messages, apiKey, { userId: user.id, route: "/api/search" });

    return NextResponse.json({
      query,
      summary: json.summary ?? "",
      keyPoints: json.key_points ?? [],
      relatedTopics: json.related_topics ?? [],
      sampleQuestion: json.sample_question ?? null,
      remaining: deduct.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    await refundTokens(user.id, "search", deduct.costTokens);
    const msg = e?.message ?? String(e);
    return NextResponse.json(
      { error: "The AI couldn't complete your search right now. Please try again.", detail: msg, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }
}
