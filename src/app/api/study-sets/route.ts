import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** GET /api/study-sets — list all sets for current user (with card count + due count) */
export async function GET() {
  const user = await getCurrentUser();
  const sets = await db.studySet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { cards: true } },
    },
  });
  return NextResponse.json({
    sets: sets.map((s) => ({
      id: s.id,
      title: s.title,
      sourceType: s.sourceType,
      subject: s.subject,
      topic: s.topic,
      createdAt: s.createdAt,
      cardCount: s._count.cards,
    })),
  });
}

/** POST /api/study-sets — create set, optionally generate cards via AI */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const contentType = req.headers.get("content-type") ?? "";

  // Two modes:
  //  1. multipart/form-data with pdf upload (field "file") + title + subject + topic
  //  2. application/json: { title, sourceType, sourceText, subject, topic, generate?: bool, numFlashcards?, numMCQs? }

  let title: string = "";
  let sourceType: string = "text";
  let sourceText: string = "";
  let subject: string | null = null;
  let topic: string | null = null;
  let generate = true;
  let numFlashcards = 6;
  let numMCQs = 4;
  // optional pre-generated cards from the preview step
  let preGeneratedCards: Array<{
    cardType: string;
    front?: string | null;
    back?: string | null;
    question?: string | null;
    options?: string[] | null;
    correctIndex?: number | null;
    explanation?: string | null;
  }> = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    title = (form.get("title") as string) || "Untitled set";
    subject = (form.get("subject") as string) || null;
    topic = (form.get("topic") as string) || null;
    if (form.get("numFlashcards")) numFlashcards = Number(form.get("numFlashcards"));
    if (form.get("numMCQs")) numMCQs = Number(form.get("numMCQs"));
    const file = form.get("file") as File | null;
    if (file) {
      sourceType = "pdf";
      const { extractPdfText } = await import("@/lib/pdf");
      sourceText = await extractPdfText(Buffer.from(await file.arrayBuffer()));
    } else {
      sourceText = (form.get("sourceText") as string) || "";
    }
    if (form.get("generate") === "false") generate = false;
  } else {
    const body = await req.json().catch(() => ({}));
    title = body.title || "Untitled set";
    sourceType = body.sourceType || "text";
    sourceText = body.sourceText || "";
    subject = body.subject ?? null;
    topic = body.topic ?? null;
    generate = body.generate !== false;
    if (Array.isArray(body.cards) && body.cards.length) {
      preGeneratedCards = body.cards;
      generate = false; // skip AI when caller provided cards
    }
    if (body.numFlashcards) numFlashcards = Number(body.numFlashcards);
    if (body.numMCQs) numMCQs = Number(body.numMCQs);
  }

  if (!sourceText.trim() && sourceType === "text") {
    return NextResponse.json(
      { error: "sourceText is required when sourceType=text" },
      { status: 400 }
    );
  }

  // create the set row
  const studySet = await db.studySet.create({
    data: {
      userId: user.id,
      title,
      sourceType,
      sourceText: sourceText.slice(0, 30_000),
      subject,
      topic,
    },
  });

  let cards: Awaited<ReturnType<typeof db.card.createMany>> | { count: number } = { count: 0 };

  // if caller pre-generated cards via /api/generate/cards and edited them in preview,
  // persist those directly (no AI call, no rate-limit cost).
  if (preGeneratedCards.length) {
    const rows = preGeneratedCards.map((c) => ({
      setId: studySet.id,
      cardType: c.cardType,
      front: c.front ?? null,
      back: c.back ?? null,
      question: c.question ?? null,
      options: c.options ?? null,
      correctIndex: c.correctIndex ?? null,
      explanation: c.explanation ?? null,
      subject,
      topic,
    }));
    await db.card.createMany({ data: rows });
  } else if (generate && sourceText.trim()) {
    // rate limit
    const rl = checkRateLimit(user.id, user.plan);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Daily AI limit reached",
          limit: rl.limit,
          resetAt: rl.resetAt,
        },
        { status: 429 }
      );
    }

    // resolve API key (BYOK if set)
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
          `You are an expert exam prep tutor. Based on the following study material, generate ${[numFlashcards > 0 ? `${numFlashcards} flashcards` : "", numMCQs > 0 ? `${numMCQs} multiple-choice questions` : ""].filter(Boolean).join(" and ") || "study cards"}.\n` +
          `Subject: ${subject ?? "General"}\nTopic: ${topic ?? "General"}\n` +
          "Return ONLY valid JSON in this format:\n" +
          JSON.stringify(
            {
              flashcards: [
                { front: "Question or term", back: "Answer or definition" },
              ],
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
          "\nIf asked for only flashcards, return an empty `mcqs` array. If only MCQs, return an empty `flashcards` array.",
      },
      {
        role: "user",
        content: "Study material:\n\n" + sourceText.slice(0, 12_000),
      },
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
      }>(messages, apiKey, { userId: user.id, route: "/api/study-sets" });

      // Respect what was requested (filter out extras if AI ignored "0")
      const flashcards = numFlashcards > 0 ? (json.flashcards ?? []).slice(0, numFlashcards) : [];
      const mcqs = numMCQs > 0 ? (json.mcqs ?? []).slice(0, numMCQs) : [];

      const rows: Array<{
        setId: string;
        cardType: string;
        front: string | null;
        back: string | null;
        question: string | null;
        options: object | null;
        correctIndex: number | null;
        explanation: string | null;
        subject: string | null;
        topic: string | null;
      }> = [];

      for (const f of flashcards) {
        rows.push({
          setId: studySet.id,
          cardType: "flashcard",
          front: f.front,
          back: f.back,
          question: null,
          options: null,
          correctIndex: null,
          explanation: null,
          subject,
          topic,
        });
      }
      for (const m of mcqs) {
        rows.push({
          setId: studySet.id,
          cardType: "mcq",
          front: null,
          back: null,
          question: m.question,
          options: m.options,
          correctIndex: m.correct_index,
          explanation: m.explanation,
          subject,
          topic,
        });
      }
      if (rows.length) {
        await db.card.createMany({ data: rows });
      }
    } catch (e: any) {
      // refund rate limit bucket on AI failure
      refundRateLimit(user.id);
      // return the empty set so user can retry generation later
      console.error("AI generation failed:", e?.message ?? e);
      return NextResponse.json(
        {
          studySet,
          cards: [],
          warning: "Set created but AI generation failed. You can retry later.",
          error: e?.message ?? String(e),
        },
        { status: 200 }
      );
    }
  }

  const fresh = await db.studySet.findUnique({
    where: { id: studySet.id },
    include: { cards: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({ studySet: fresh });
}
