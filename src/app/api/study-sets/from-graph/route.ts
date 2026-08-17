import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type CardInput = {
  cardType: "flashcard" | "mcq";
  front?: string | null;
  back?: string | null;
  question?: string | null;
  options?: string[] | null;
  correctIndex?: number | null;
  explanation?: string | null;
};

/**
 * POST /api/study-sets/from-graph
 * Body: { equation, explanation, subject?, topic?, cards?: CardInput[] }
 *
 * Creates a study set with source_type='graph' and source_text=equation.
 * If `cards` are provided, saves them too (typically AI-generated MCQs
 * about the graph).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const equation: string = (body.equation ?? "").toString().trim();
  const explanation: string = (body.explanation ?? "").toString();
  const subject: string | null = body.subject ?? "Mathematics";
  const topic: string | null = body.topic ?? "Graphs";
  const cards: CardInput[] = Array.isArray(body.cards) ? body.cards : [];

  if (!equation) {
    return NextResponse.json({ error: "Missing equation" }, { status: 400 });
  }

  const studySet = await db.studySet.create({
    data: {
      userId: user.id,
      title: `Graph: ${equation}`,
      sourceType: "graph",
      sourceText: equation,
      subject,
      topic,
    },
  });

  if (cards.length) {
    await db.card.createMany({
      data: cards.map((c) => ({
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
      })),
    });
  }

  // optional: persist the AI explanation as a single flashcard so it surfaces in review
  if (explanation) {
    await db.card.create({
      data: {
        setId: studySet.id,
        cardType: "flashcard",
        front: `What does the graph of ${equation} show?`,
        back: explanation,
        subject,
        topic,
      },
    });
  }

  const withCards = await db.studySet.findUnique({
    where: { id: studySet.id },
    include: { cards: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({ studySet: withCards });
}
