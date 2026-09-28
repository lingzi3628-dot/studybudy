import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { cleanGeneratedFlashcards, cleanGeneratedMcqs } from "@/lib/card-quality";

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

  // Build the "what to generate" phrase so the AI doesn't see "0 flashcards"
  const flashcardPart = numFlashcards > 0 ? `${numFlashcards} flashcards` : "";
  const mcqPart = numMCQs > 0 ? `${numMCQs} multiple-choice questions` : "";
  const parts = [flashcardPart, mcqPart].filter(Boolean).join(" and ");
  const whatToGenerate = parts || "study cards";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are an expert exam prep tutor. Based on the following study material, generate ${whatToGenerate}.\n` +
        `Subject: ${subject ?? "General"}\nTopic: ${topic ?? "General"}\n` +
        "Use only facts supported by the supplied material and topic. Each flashcard front must ask one clear question or name one term; the back must give its direct, useful answer. Avoid vague prompts, unrelated facts, repeated cards, and template/example text. If the material does not support enough cards, return fewer rather than inventing.\n" +
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
        ) +
        "\nIf you were asked for only flashcards, return an empty `mcqs` array. If asked for only MCQs, return an empty `flashcards` array.",
    },
    { role: "user", content: "Study material:\n\n" + text.slice(0, 12_000) },
  ];

  const deduct = await checkAndDeductTokens(user.id, "cards");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json({ error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true }, { status: 402 });
    }
    return NextResponse.json({ error: "We couldn't generate cards right now. Please try again.", code: deduct.code, detail: deduct.error }, { status: 500 });
  }

  try {
    const json = await callAIJson<{
      flashcards?: { front: string; back: string }[];
      mcqs?: {
        question: string;
        options: string[];
        correct_index: number;
        explanation: string;
      }[];
    }>(messages, apiKey, { userId: user.id, route: "/api/generate/cards" });

    // Respect what the caller actually asked for (AI sometimes ignores "0")
    const cleanedFlashcards = cleanGeneratedFlashcards(json.flashcards);
    const cleanedMcqs = cleanGeneratedMcqs(json.mcqs);
    const filteredFlashcards = numFlashcards > 0 ? cleanedFlashcards.cards.slice(0, numFlashcards) : [];
    const filteredMcqs = numMCQs > 0 ? cleanedMcqs.cards.slice(0, numMCQs) : [];
    const shortfall = (numFlashcards > 0 && filteredFlashcards.length < numFlashcards) ||
      (numMCQs > 0 && filteredMcqs.length < numMCQs);
    const qualityWarning = cleanedFlashcards.rejected + cleanedMcqs.rejected > 0 || shortfall;

    return NextResponse.json({
      flashcards: filteredFlashcards,
      mcqs: filteredMcqs,
      rejectedCards: cleanedFlashcards.rejected + cleanedMcqs.rejected,
      warning: qualityWarning
        ? "Some cards were incomplete, duplicated, or malformed, so they were removed. The AI may also have returned fewer cards than requested. Review the remaining cards before saving or retry generation."
        : undefined,
      remaining: rl.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    await refundTokens(user.id, "cards", deduct.costTokens);
    const msg = e?.message ?? String(e);
    return NextResponse.json(
      { error: "The AI couldn't generate cards right now. Please try again.", detail: msg, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }
}
