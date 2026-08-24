import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/topics?subjectId=...
 *
 * Public — returns the topics (learning path) for a subject, ordered by
 * orderIndex. Each topic includes its flashcard + quiz-question counts.
 */
export async function GET(req: NextRequest) {
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? "";

  if (!subjectId) {
    return NextResponse.json(
      { error: "subjectId query param is required" },
      { status: 400 }
    );
  }

  try {
    const topics = await db.curriculumTopic.findMany({
      where: { subjectId },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        summary: true,
        orderIndex: true,
        estimatedMin: true,
        _count: {
          select: { flashcards: true, quizQuestions: true },
        },
      },
    });

    return NextResponse.json({
      topics: topics.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        summary: t.summary,
        orderIndex: t.orderIndex,
        estimatedMin: t.estimatedMin,
        flashcardCount: t._count.flashcards,
        quizQuestionCount: t._count.quizQuestions,
      })),
    });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ topics: [], tablesMissing: true });
    }
    return NextResponse.json(
      { error: "Failed to load topics", detail: e?.message },
      { status: 500 }
    );
  }
}
