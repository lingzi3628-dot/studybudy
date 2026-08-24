import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/curriculum/exams/[id]/submit
 *
 * Body: { answers: Record<string, number> }  — map of questionId → selected option index
 *
 * Grades the exam server-side, returns:
 *   {
 *     totalQuestions, correctCount, scorePercent, passed,
 *     results: [{ questionId, selectedIndex, correctIndex, isCorrect, explanation }]
 *   }
 *
 * Auth required. (We don't deduct tokens for exam-taking — it's free.)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const answers: Record<string, number> = body?.answers ?? {};

  if (Object.keys(answers).length === 0) {
    return NextResponse.json({ error: "No answers submitted" }, { status: 400 });
  }

  try {
    const exam = await db.curriculumExam.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, correctIndex: true, explanation: true, marks: true },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (exam.status !== "published") {
      return NextResponse.json({ error: "Exam is not published" }, { status: 403 });
    }

    // Grade
    let correctCount = 0;
    let totalMarks = 0;
    let earnedMarks = 0;
    const results = exam.questions.map((q) => {
      const selectedIndex = answers[q.id];
      const isCorrect = selectedIndex === q.correctIndex;
      if (isCorrect) {
        correctCount++;
        earnedMarks += q.marks;
      }
      totalMarks += q.marks;
      return {
        questionId: q.id,
        selectedIndex: selectedIndex ?? null,
        correctIndex: q.correctIndex,
        isCorrect,
        explanation: q.explanation,
        marks: q.marks,
      };
    });

    const totalQuestions = exam.questions.length;
    const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = scorePercent >= Math.round(exam.passThreshold * 100);

    return NextResponse.json({
      totalQuestions,
      correctCount,
      scorePercent,
      passed,
      earnedMarks,
      totalMarks,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to grade exam" }, { status: 500 });
  }
}
