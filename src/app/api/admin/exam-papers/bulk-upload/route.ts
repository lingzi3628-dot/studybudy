import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { callAI, type ChatMessage } from "@/lib/ai";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";

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
 *   convertToExam?: boolean,  // NEW — if true, extract text from each file and use AI to
 *                            //       generate exam questions (turns each upload into
 *                            //       ai_template instead of pdf)
 *   numQuestions?: number,    // NEW — questions per file when convertToExam is true
 * }
 *
 * Returns: { created: number, results: [{ title, status, error?, questionsGenerated? }] }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const files = Array.isArray(body?.files) ? body.files : [];
  const defaultCategory = (body?.defaultCategory ?? "past_paper").toString();
  const defaultGradeLevel = (body?.defaultGradeLevel ?? "").toString().trim() || null;
  const convertToExam = Boolean(body?.convertToExam);
  const numQuestions = Math.min(50, Math.max(5, Number(body?.numQuestions) || 10));

  if (files.length < 1) {
    return NextResponse.json({ error: "At least 1 file required" }, { status: 400 });
  }
  if (files.length > 100) {
    return NextResponse.json({ error: "Max 100 files per bulk upload" }, { status: 400 });
  }

  const results: Array<{
    title: string;
    status: "created" | "failed";
    error?: string;
    questionsGenerated?: number;
    textExtractedLength?: number;
  }> = [];

  // Build a batch prompt — ask AI to generate metadata for ALL files at once
  const fileList = files.map((f: any, i: number) => `${i + 1}. ${f.fileName}`).join("\n");

  let aiMetadata: any = {};

  try {
    const systemPrompt = `You are an exam metadata generator. Given a list of exam file filenames, generate metadata for each.
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

  // Ensure tmp dirs exist
  const tmpDir = "/tmp/bulk-conversions";
  const txtDir = "/tmp/bulk-text";
  try { if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true }); } catch {}
  try { if (!existsSync(txtDir)) await mkdir(txtDir, { recursive: true }); } catch {}

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const aiItem = aiMetadata.items?.find((item: any) => item.index === i + 1);

    const ext = (file.fileName.split(".").pop() ?? "").toLowerCase();
    const allowedExt = ["pdf", "doc", "docx"];

    if (!allowedExt.includes(ext)) {
      results.push({
        title: file.fileName,
        status: "failed",
        error: `Unsupported file type: .${ext}`,
      });
      continue;
    }

    try {
      // Extract base64 from data URL
      const base64Data = (file.dataUrl as string).split(",")[1] ?? "";
      const originalBuffer = Buffer.from(base64Data, "base64");

      let finalDataUrl: string = file.dataUrl;
      let extractedText: string = "";

      // --- DOC/DOCX → PDF (for the in-app viewer, when NOT converting to exam) ---
      if ((ext === "doc" || ext === "docx") && !convertToExam) {
        try {
          const tmpFileName = `bulk-${Date.now()}-${i}.${ext}`;
          const tmpFilePath = path.join(tmpDir, tmpFileName);
          await writeFile(tmpFilePath, originalBuffer);

          execSync(`libreoffice --headless --convert-to pdf --outdir ${tmpDir} ${tmpFilePath}`, {
            timeout: 30000,
            stdio: "pipe",
          });

          const pdfFileName = tmpFileName.replace(/\.(doc|docx)$/, ".pdf");
          const pdfFilePath = path.join(tmpDir, pdfFileName);

          if (existsSync(pdfFilePath)) {
            const pdfBuffer = await readFile(pdfFilePath);
            finalDataUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
            await unlink(tmpFilePath).catch(() => {});
            await unlink(pdfFilePath).catch(() => {});
          }
        } catch (convErr: any) {
          console.error(`[bulk-upload] File ${i + 1} DOCX→PDF failed:`, convErr?.message);
        }
      }

      // --- Text extraction for convertToExam mode ---
      if (convertToExam) {
        try {
          if (ext === "pdf") {
            // Write the original PDF to a tmp file and use pdftotext
            const tmpPdf = path.join(txtDir, `extract-${Date.now()}-${i}.pdf`);
            const tmpTxt = path.join(txtDir, `extract-${Date.now()}-${i}.txt`);
            await writeFile(tmpPdf, originalBuffer);
            try {
              execSync(`pdftotext -layout ${tmpPdf} ${tmpTxt}`, { timeout: 30000, stdio: "pipe" });
              if (existsSync(tmpTxt)) {
                extractedText = (await readFile(tmpTxt, "utf-8")).trim();
              }
            } catch (pdfErr: any) {
              console.error(`[bulk-upload] File ${i + 1} pdftotext failed:`, pdfErr?.message);
            }
            await unlink(tmpPdf).catch(() => {});
            await unlink(tmpTxt).catch(() => {});
          } else if (ext === "doc" || ext === "docx") {
            // DOC/DOCX → txt via LibreOffice (more reliable than pdf-parse for DOCX)
            const tmpFileName = `extract-${Date.now()}-${i}.${ext}`;
            const tmpFilePath = path.join(txtDir, tmpFileName);
            await writeFile(tmpFilePath, originalBuffer);
            try {
              execSync(`libreoffice --headless --convert-to txt:Text --outdir ${txtDir} ${tmpFilePath}`, {
                timeout: 30000,
                stdio: "pipe",
              });
              const txtFileName = tmpFileName.replace(/\.(doc|docx)$/, ".txt");
              const txtFilePath = path.join(txtDir, txtFileName);
              if (existsSync(txtFilePath)) {
                extractedText = (await readFile(txtFilePath, "utf-8")).trim();
                await unlink(txtFilePath).catch(() => {});
              }
            } catch (docErr: any) {
              console.error(`[bulk-upload] File ${i + 1} DOCX→TXT failed:`, docErr?.message);
            }
            await unlink(tmpFilePath).catch(() => {});
          }
        } catch (extractErr: any) {
          console.error(`[bulk-upload] File ${i + 1} text extraction failed:`, extractErr?.message);
        }

        if (!extractedText || extractedText.length < 30) {
          results.push({
            title: aiItem?.title ?? file.fileName,
            status: "failed",
            error: "Could not extract enough text from file (skipped AI exam conversion)",
          });
          continue;
        }

        // --- AI: generate questions from extracted text ---
        let questions: any[] = [];
        let totalMarks = 0;
        try {
          const systemPrompt = `You are an exam creator. The user uploaded a document containing exam content. Generate ${numQuestions} multiple-choice exam questions based ONLY on the content provided below.

CONTENT (extracted from uploaded file):
${extractedText.slice(0, 12000)}

Return ONLY valid JSON:
{"questions":[{"questionText":"...","options":["A","B","C","D"],"correctIndex":0,"marks":1}], "totalMarks": 0}`;

          const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate ${numQuestions} exam questions from the uploaded content.` },
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
            const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
            questions = parsed.questions ?? [];
            totalMarks = parsed.totalMarks ?? questions.reduce((s: number, q: any) => s + (q.marks ?? 1), 0);
          }
        } catch (aiErr: any) {
          console.error(`[bulk-upload] File ${i + 1} AI question generation failed:`, aiErr?.message);
        }

        if (questions.length === 0) {
          results.push({
            title: aiItem?.title ?? file.fileName,
            status: "failed",
            error: "AI couldn't generate questions from this file (skipped)",
            textExtractedLength: extractedText.length,
          });
          continue;
        }

        // Build cover image
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
            examType: "ai_template",
            questions,
            totalMarks,
            durationMin: 60,
            coverImage,
            isPublished: true,
          },
        });

        results.push({
          title: paper.title,
          status: "created",
          questionsGenerated: questions.length,
          textExtractedLength: extractedText.length,
        });
        continue;
      }

      // --- PDF mode (no exam conversion) ---
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
          fileUrl: finalDataUrl,
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
