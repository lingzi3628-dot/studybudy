import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/study-room/[topicId]/daily-review
 *
 * Generates today's review items (3-5 questions) for the user.
 * Reuses yesterday's completed items, due flashcards, or generates fresh ones
 * via AI based on the topic + path progress.
 *
 * Free (no token cost — daily review is a free feature).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true, description: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Check if today's review already exists
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existing = await db.dailyReview.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  }).catch(() => null);

  if (existing && existing.status === "completed") {
    return NextResponse.json({
      dailyReview: { ...existing, items: existing.items as any[] },
      alreadyCompleted: true,
    });
  }
  if (existing && (existing.items as any[]).length > 0) {
    return NextResponse.json({
      dailyReview: { ...existing, items: existing.items as any[] },
      alreadyGenerated: true,
    });
  }

  // Generate 3-5 review questions via AI based on topic + path
  // Try to fetch any related flashcards/quizzes first
  const relatedSets = await db.studySet.findMany({
    where: { userId: user.id, topicId },
    include: { cards: { take: 5 } },
    take: 3,
  }).catch(() => []);

  const cardsForReview = relatedSets.flatMap((s) => s.cards).slice(0, 5);

  // If we have existing flashcards, use them as review items
  if (cardsForReview.length >= 3) {
    const items = cardsForReview.map((c) => ({
      itemId: c.id,
      type: c.cardType === "mcq" ? "quiz" : "flashcard",
      question: c.question || c.front,
      options: c.options || [],
      answer: c.cardType === "mcq" ? (c.options?.[c.correctIndex ?? 0] ?? "") : (c.back ?? ""),
      correctIndex: c.correctIndex ?? null,
      explanation: c.explanation || null,
    }));

    const review = await db.dailyReview.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      create: {
        userId: user.id, date: today, items: items as any, status: "pending",
      },
      update: { items: items as any, status: "pending" },
    });

    return NextResponse.json({ dailyReview: { ...review, items } });
  }

  // Otherwise, generate via AI
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a tutor creating a quick daily review quiz. Generate 4 mixed questions " +
        "(2 flashcard-style + 2 multiple-choice) on the given topic. Return ONLY JSON:\n" +
        JSON.stringify({
          items: [
            { type: "flashcard", question: "Define X", answer: "Definition" },
            { type: "quiz", question: "Which...", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "..." },
          ],
        }, null, 2) +
        "\nRules: 4 items total, mix of types, 1-sentence questions.",
    },
    { role: "user", content: `Topic: ${topic.name}\nSubject: ${topic.subject}\nDescription: ${topic.description ?? "general"}` },
  ];

  let items: any[] = [];
  try {
    const raw = await callAIJson<any>(messages, apiKey, {
      userId: user.id,
      route: "/api/study-room/daily-review",
    });
    items = (raw.items ?? []).slice(0, 5).map((it: any, i: number) => ({
      itemId: `ai_${i}`,
      type: it.type === "quiz" ? "quiz" : "flashcard",
      question: String(it.question ?? ""),
      options: Array.isArray(it.options) ? it.options : [],
      answer: String(it.answer ?? ""),
      correctIndex: typeof it.correctIndex === "number" ? it.correctIndex : null,
      explanation: it.explanation ? String(it.explanation) : null,
    }));
  } catch (e: any) {
    console.error("daily review AI failed:", e?.message);
    return NextResponse.json(
      { error: "Couldn't generate the daily review right now. Please try again." },
      { status: 500 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "No review items could be generated." }, { status: 500 });
  }

  const review = await db.dailyReview.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    create: {
      userId: user.id, date: today, items: items as any, status: "pending",
    },
    update: { items: items as any, status: "pending" },
  });

  return NextResponse.json({ dailyReview: { ...review, items } });
}
