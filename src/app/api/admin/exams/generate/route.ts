import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * POST /api/admin/exams/generate
 * Body: { gradeId, subjectId, title, studentName?, numQuestions?, durationMinutes? }
 *
 * Uses AI to generate exam questions from the curriculum content,
 * saves them as a GeneratedExam, and returns the questions for the
 * client to render as a printable exam page.
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const gradeId = (body?.gradeId ?? "").toString().trim();
  const subjectId = (body?.subjectId ?? "").toString().trim();
  const title = (body?.title ?? "StudyBuddy Exam").toString().trim();
  const studentName = (body?.studentName ?? "").toString().trim() || null;
  const numQuestions = Math.min(30, Math.max(5, Number(body?.numQuestions) || 10));
  const durationMinutes = Number(body?.durationMinutes) || 60;

  if (!gradeId || !subjectId) {
    return NextResponse.json({ error: "gradeId and subjectId are required" }, { status: 400 });
  }

  try {
    // Load the grade + subject + topics for context
    const [grade, subject] = await Promise.all([
      db.curriculumGrade.findUnique({ where: { id: gradeId } }),
      db.curriculumSubject.findUnique({
        where: { id: subjectId },
        include: {
          topics: {
            select: { name: true, summary: true, contentMarkdown: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      }),
    ]);

    if (!grade || !subject) {
      return NextResponse.json({ error: "Grade or subject not found" }, { status: 404 });
    }

    // Build AI prompt from curriculum content
    const topicSummaries = subject.topics.map((t, i) =>
      `${i + 1}. ${t.name}: ${(t.summary ?? "").slice(0, 200)}`
    ).join("\n");

    const systemPrompt = `You are an exam creator for Kenyan CBC ${grade.name} ${subject.name}.
Generate ${numQuestions} multiple-choice exam questions based ONLY on the curriculum topics below.
Each question should have 4 options (A, B, C, D) with one correct answer.
Include the marks for each question (1 or 2 marks).
Mix easy, medium, and hard questions.

CURRICULUM TOPICS:
${topicSummaries}

Return ONLY valid JSON (no markdown fences):
{
  "questions": [
    {
      "questionText": "Question here?",
      "options": ["A option", "B option", "C option", "D option"],
      "correctIndex": 0,
      "marks": 1,
      "difficulty": "easy"
    }
  ]
}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate ${numQuestions} exam questions for ${grade.name} ${subject.name}.` },
    ];

    let questions: any[] = [];
    let totalMarks = 0;

    try {
      const reply = await callAI(messages, null, {
        userId: "system",
        route: "/api/admin/exams/generate",
      });

      // Parse JSON
      let cleaned = reply.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      }
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        questions = parsed.questions ?? [];
      }
    } catch (e: any) {
      console.error("AI exam generation failed:", e?.message);
    }

    // Fallback: pull from existing quiz questions if AI fails
    if (questions.length === 0) {
      const existingQuestions = await db.curriculumQuizQuestion.findMany({
        where: { topic: { subjectId } },
        take: numQuestions,
        select: {
          questionText: true,
          options: true,
          correctIndex: true,
        },
      });
      questions = existingQuestions.map((q) => ({
        questionText: q.questionText,
        options: q.options,
        correctIndex: q.correctIndex,
        marks: 1,
        difficulty: "easy",
      }));
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: "No questions could be generated" }, { status: 400 });
    }

    totalMarks = questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);

    // Save the generated exam
    const exam = await db.generatedExam.create({
      data: {
        gradeId,
        subjectId,
        title,
        studentName,
        questions,
        totalMarks,
        durationMinutes,
        status: "generated",
      },
    });

    return NextResponse.json({
      ok: true,
      exam: {
        id: exam.id,
        title,
        studentName,
        gradeName: grade.name,
        subjectName: subject.name,
        questions,
        totalMarks,
        durationMinutes,
        createdAt: exam.createdAt,
      },
    });
  } catch (e: any) {
    console.error("exam generation error:", e?.message);
    return NextResponse.json({ error: "Failed to generate exam" }, { status: 500 });
  }
}
