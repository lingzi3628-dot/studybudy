import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * GET  /api/admin/exam-papers — list all exam papers (admin)
 * POST /api/admin/exam-papers — create a new exam paper
 *   Body for PDF upload: { examType:'pdf', title, description?, category, paperType?, gradeLevel?, subjectName?, schoolName?, year?, fileUrl, coverImage?, pages? }
 *   Body for AI template: { examType:'ai_template', title, ..., content (raw text to generate from), numQuestions, pages?, diagrams?: [{url, caption}] }
 * PATCH /api/admin/exam-papers — update (publish/unpublish, set trending)
 * DELETE /api/admin/exam-papers — delete by id
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const papers = await db.examPaper.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ papers });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const examType = (body?.examType ?? "pdf").toString();

  if (examType === "pdf") {
    // --- PDF upload mode ---
    const title = (body?.title ?? "").toString().trim();
    const fileUrl = (body?.fileUrl ?? "").toString().trim();
    if (!title || !fileUrl) {
      return NextResponse.json({ error: "title and fileUrl are required" }, { status: 400 });
    }
    const paper = await db.examPaper.create({
      data: {
        title,
        description: body?.description ?? null,
        category: body?.category ?? "past_paper",
        paperType: body?.paperType ?? null,
        gradeLevel: body?.gradeLevel ?? null,
        subjectName: body?.subjectName ?? null,
        schoolName: body?.schoolName ?? null,
        year: body?.year ? Number(body.year) : null,
        examType: "pdf",
        fileUrl,
        coverImage: body?.coverImage ?? null,
        pages: body?.pages ? Number(body.pages) : null,
        durationMin: body?.durationMinutes ? Number(body.durationMinutes) : 60,
        uploadedBy: body?.uploadedBy ?? null,
        isPublished: body?.isPublished ?? true,
      },
    });
    return NextResponse.json({ paper });
  }

  if (examType === "ai_template") {
    // --- AI template mode ---
    const title = (body?.title ?? "").toString().trim();
    const content = (body?.content ?? "").toString().trim();
    const numQuestions = Math.min(50, Math.max(5, Number(body?.numQuestions) || 10));
    const diagrams = Array.isArray(body?.diagrams) ? body.diagrams : [];

    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // Generate questions via AI
    const systemPrompt = `You are an exam creator. Generate ${numQuestions} multiple-choice exam questions based ONLY on the content provided below.

${diagrams.length > 0 ? `The following diagrams are included:\n${diagrams.map((d: any, i: number) => `Diagram ${i + 1}: ${d.caption ?? "uncaptioned"} (${d.url})`).join("\n")}` : ""}

CONTENT TO GENERATE QUESTIONS FROM:
${content.slice(0, 8000)}

Return ONLY valid JSON:
{"questions":[{"questionText":"...","options":["A","B","C","D"],"correctIndex":0,"marks":1}], "totalMarks": 0}`;

    let questions: any[] = [];
    let totalMarks = 0;

    try {
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate ${numQuestions} exam questions.` },
      ];
      const reply = await callAI(messages, null, {
        userId: "system",
        route: "/api/admin/exam-papers/generate-ai",
      });

      let cleaned = reply.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      }
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        questions = parsed.questions ?? [];
        totalMarks = parsed.totalMarks ?? questions.reduce((s, q) => s + (q.marks ?? 1), 0);
      }
    } catch (e: any) {
      console.error("AI exam generation failed:", e?.message);
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: "AI couldn't generate questions. Try again or use PDF mode." }, { status: 500 });
    }

    // Generate cover image via Pollinations AI (free, no key needed)
    const coverImage = body?.coverImage ?? `https://image.pollinations.ai/prompt/${encodeURIComponent("exam paper " + title + " education study")}?width=400&height=560&nologo=true`;

    const paper = await db.examPaper.create({
      data: {
        title,
        description: body?.description ?? null,
        category: body?.category ?? "studybuddy_ai",
        paperType: body?.paperType ?? null,
        gradeLevel: body?.gradeLevel ?? null,
        subjectName: body?.subjectName ?? null,
        schoolName: body?.schoolName ?? null,
        year: body?.year ? Number(body.year) : null,
        examType: "ai_template",
        questions,
        totalMarks,
        durationMin: body?.durationMinutes ? Number(body.durationMinutes) : 60,
        coverImage,
        pages: body?.pages ? Number(body.pages) : Math.ceil(questions.length / 5),
        uploadedBy: body?.uploadedBy ?? null,
        isPublished: body?.isPublished ?? true,
      },
    });

    return NextResponse.json({ paper, questionsGenerated: questions.length });
  }

  return NextResponse.json({ error: "Invalid examType" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? "").toString();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: any = {};
  if (body?.isPublished !== undefined) patch.isPublished = body.isPublished;
  if (body?.isTrending !== undefined) patch.isTrending = body.isTrending;
  if (body?.title) patch.title = body.title;
  if (body?.description !== undefined) patch.description = body.description;
  if (body?.coverImage !== undefined) patch.coverImage = body.coverImage;

  const updated = await db.examPaper.update({ where: { id }, data: patch });
  return NextResponse.json({ paper: updated });
}

export async function DELETE(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? "").toString();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.examPaper.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
