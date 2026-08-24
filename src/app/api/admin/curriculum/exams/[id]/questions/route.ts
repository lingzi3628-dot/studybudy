import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * POST /api/admin/curriculum/exams/[id]/questions
 *
 * Add a question to an exam. Body:
 *   {
 *     questionText: string,
 *     options: string[],   // 4 options
 *     correctIndex: number, // 0-based
 *     explanation?: string,
 *     marks?: number,       // default 1
 *   }
 *
 * Also supports bulk add: { questions: [...] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Verify the exam exists
  const exam = await db.curriculumExam.findUnique({ where: { id } });
  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  // Find the current max orderIndex
  const maxOrder = await db.curriculumExamQuestion.findFirst({
    where: { examId: id },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  }).catch(() => null);
  let nextOrder = (maxOrder?.orderIndex ?? -1) + 1;

  const questionsToAdd = Array.isArray(body?.questions) ? body.questions : [body];
  const created: any[] = [];

  for (const q of questionsToAdd) {
    const questionText = (q?.questionText ?? "").toString().trim();
    const options = Array.isArray(q?.options) ? q.options : [];
    const correctIndex = Number(q?.correctIndex ?? 0);
    const explanation = (q?.explanation ?? "").toString().trim() || null;
    const marks = Number(q?.marks ?? 1);

    if (!questionText || options.length < 2) continue;

    const row = await db.curriculumExamQuestion.create({
      data: {
        examId: id,
        questionText,
        options,
        correctIndex: Math.max(0, Math.min(options.length - 1, correctIndex)),
        explanation,
        marks,
        orderIndex: nextOrder++,
      },
    });
    created.push(row);
  }

  return NextResponse.json({ created: created.length, questions: created });
}

/**
 * DELETE /api/admin/curriculum/exams/[id]/questions
 *   body: { questionId: string }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const questionId = (body?.questionId ?? "").toString().trim();

  if (!questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }

  try {
    await db.curriculumExamQuestion.delete({
      where: { id: questionId },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
  }
}
