import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for bulk uploads

/**
 * POST /api/admin/exam-papers/bulk-upload
 *
 * Accepts a JSON body with an array of files (each with a base64 data URL + original filename).
 * The AI analyzes each filename + generates metadata (title, category, subject, year, etc.).
 * Creates ExamPaper records for each.
 *
 * Body: {
 *   files: [{ fileName: string, dataUrl: string, size: number }],
 *   defaultCategory?: string,
 *   defaultGradeLevel?: string,
 * }
 *
 * Returns: { created: number, results: [{ title, status, error? }] }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const files = Array.isArray(body?.files) ? body.files : [];
  const defaultCategory = (body?.defaultCategory ?? "past_paper").toString();
  const defaultGradeLevel = (body?.defaultGradeLevel ?? "").toString().trim() || null;

  if (files.length < 1) {
    return NextResponse.json({ error: "At least 1 file required" }, { status: 400 });
  }
  if (files.length > 100) {
    return NextResponse.json({ error: "Max 100 files per bulk upload" }, { status: 400 });
  }

  const results: Array<{ title: string; status: "created" | "failed"; error?: string }> = [];

  // Build a batch prompt — ask AI to generate metadata for ALL files at once
  // (much more efficient than calling AI once per file)
  const fileList = files.map((f: any, i: number) => `${i + 1}. ${f.fileName}`).join("\n");

  let aiMetadata: any = {};

  try {
    const systemPrompt = `You are an exam metadata generator. Given a list of exam PDF filenames, generate metadata for each.
For each file, determine:
- title: a clean, human-readable exam title
- subject: the subject (Mathematics, English, Chemistry, etc.)
- year: the year if mentioned in the filename (number or null)
- paperType: "Paper 1", "Paper 2", "Paper 3", or null
- schoolName: school name if mentioned, or null
- category: one of "kcse_revision", "kpsea", "kjsea", "past_paper", "studybuddy_ai"

Default category: ${defaultCategory}

Return ONLY valid JSON:
{"items":[{"index":1,"title":"...","subject":"...","year":2023,"paperType":"Paper 1","schoolName":"...","category":"past_paper"}]}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate metadata for these ${files.length} exam files:\n${fileList}` },
    ];

    const reply = await callAI(messages, null, {
      userId: "system",
      route: "/api/admin/exam-papers/bulk-upload",
    });

    let cleaned = reply.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      aiMetadata = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
  } catch (e: any) {
    console.error("[bulk-upload] AI metadata generation failed:", e?.message);
    // Continue without AI metadata — use filename as title
  }

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const aiItem = aiMetadata.items?.find((item: any) => item.index === i + 1);

    const ext = (file.fileName.split(".").pop() ?? "").toLowerCase();
    const contentType =
      ext === "pdf" ? "application/pdf" :
      ext === "doc" ? "application/msword" :
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    try {
      // Generate cover via Pollinations AI
      const coverPrompt = encodeURIComponent(
        (aiItem?.title ?? file.fileName) + " exam cover education"
      );
      const coverImage = `https://image.pollinations.ai/prompt/${coverPrompt}?width=400&height=560&nologo=true`;

      const paper = await db.examPaper.create({
        data: {
          title: aiItem?.title ?? file.fileName.replace(/\.[^/.]+$/, ""),
          description: null,
          category: aiItem?.category ?? defaultCategory,
          paperType: aiItem?.paperType ?? null,
          gradeLevel: aiItem?.gradeLevel ?? defaultGradeLevel,
          subjectName: aiItem?.subject ?? null,
          schoolName: aiItem?.schoolName ?? null,
          year: aiItem?.year ?? null,
          examType: "pdf",
          fileUrl: file.dataUrl,
          coverImage,
          durationMin: 60,
          isPublished: true,
        },
      });

      results.push({ title: paper.title, status: "created" });
    } catch (e: any) {
      console.error(`[bulk-upload] File ${i + 1} failed:`, e?.message);
      results.push({ title: file.fileName, status: "failed", error: e?.message ?? "Unknown error" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;

  return NextResponse.json({
    ok: true,
    created,
    total: files.length,
    results,
  });
}
