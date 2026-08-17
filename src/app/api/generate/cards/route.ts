import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/generate/cards
 * Body: { text, numFlashcards?, numMCQs?, subject?, topic? }
 *
 * Calls AI with structured prompt. Returns JSON with flashcards and mcqs.
 * NOT persisted — caller can save via /api/study-sets.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const text = (body.text ?? "").toString().trim();
  const numFlashcards = Number(body.numFlashcards ?? 6);
  const numMCQs = Number(body.numMCQs ?? 4);
  const subject = body.subject ?? null;
  const topic = body.topic ?? null;

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
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
        `You are an expert exam prep tutor. Based on the following study material, generate ${numFlashcards} flashcards and ${numMCQs} multiple-choice questions.\n` +
        `Subject: ${subject ?? "General"}\nTopic: ${topic ?? "General"}\n` +
        "Return ONLY valid JSON in this format:\n" +
        JSON.stringify(
          {
            flashcards: [{ front: "Question or term", back: "Answer or definition" }],
            mcqs: [
              {
                question: "Question text",
                options: ["A", "B", "C", "D"],
                correct_index: 0,
                explanation: "Why the correct answer is right.",
              },
            ],
          },
          null,
          2
        ),
    },
    { role: "user", content: "Study material:\n\n" + text.slice(0, 12_000) },
  ];

  try {
    const json = await callAIJson<{
      flashcards?: { front: string; back: string }[];
      mcqs?: {
        question: string;
        options: string[];
        correct_index: number;
        explanation: string;
      }[];
    }>(messages, apiKey);

    return NextResponse.json({
      flashcards: json.flashcards ?? [],
      mcqs: json.mcqs ?? [],
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    return NextResponse.json(
      { error: "AI generation failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
