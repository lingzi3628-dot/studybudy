import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/search
 * Body: { query }
 *
 * Returns: { summary, key_points[], related_topics[], sample_question }
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
      { error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt },
      { status: 429 }
    );
  }

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
    }>(messages, apiKey);

    return NextResponse.json({
      query,
      summary: json.summary ?? "",
      keyPoints: json.key_points ?? [],
      relatedTopics: json.related_topics ?? [],
      sampleQuestion: json.sample_question ?? null,
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    return NextResponse.json(
      { error: "AI search failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
