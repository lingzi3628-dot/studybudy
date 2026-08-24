import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/topic/[id]
 *
 * Public — returns the full topic content + all flashcards + all quiz
 * questions. This is what the student sees when they open a topic to study.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const topic = await db.curriculumTopic.findUnique({
      where: { id },
      include: {
        subject: {
          select: { id: true, name: true, icon: true, color: true, gradeId: true, grade: { select: { name: true } } },
        },
        flashcards: { orderBy: { orderIndex: "asc" } },
        quizQuestions: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    return NextResponse.json({
      topic: {
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        summary: topic.summary,
        contentMarkdown: topic.contentMarkdown,
        estimatedMin: topic.estimatedMin,
        orderIndex: topic.orderIndex,
        subject: {
          id: topic.subject.id,
          name: topic.subject.name,
          icon: topic.subject.icon,
          color: topic.subject.color,
          gradeName: topic.subject.grade.name,
        },
        flashcards: topic.flashcards.map((f) => ({
          id: f.id,
          front: f.front,
          back: f.back,
        })),
        quizQuestions: topic.quizQuestions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          difficulty: q.difficulty,
        })),
      },
    });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ error: "Curriculum not yet initialized" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to load topic", detail: e?.message },
      { status: 500 }
    );
  }
}
