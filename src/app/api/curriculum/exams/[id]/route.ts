import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/exams/[id]
 *
 * Returns a published exam with all its questions. The correctIndex is
 * included so the client can grade locally — there's no server-side
 * "secret" answer key (this is a learning tool, not a high-stakes exam).
 *
 * Auth required — the user must be logged in.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;

  try {
    const exam = await db.curriculumExam.findUnique({
      where: { id },
      include: {
        subject: { select: { name: true, icon: true, color: true } },
        grade: { select: { name: true } },
        questions: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            questionText: true,
            options: true,
            correctIndex: true,
            explanation: true,
            marks: true,
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (exam.status !== "published") {
      return NextResponse.json({ error: "Exam is not published yet" }, { status: 403 });
    }

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        passThreshold: exam.passThreshold,
        subject: exam.subject,
        grade: exam.grade,
        questions: exam.questions,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ error: "Exams not yet initialized" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to load exam" }, { status: 500 });
  }
}
