import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 min for conversion + AI

/**
 * POST /api/admin/exam-papers/upload
 *
 * Accepts multipart/form-data with:
 *   file: PDF/DOC/DOCX (≤ 5 MB)
 *   title, description?, category, paperType?, gradeLevel?, subjectName?,
 *   schoolName?, year?, coverImage?, pages?, durationMinutes?
 *   convertToExam?: "true" — if set, extract text from the file and use AI to
 *                  generate exam questions (turns the upload into ai_template
 *                  instead of pdf).
 *
 * DOC/DOCX are auto-converted to PDF via LibreOffice (so the in-app viewer
 * can display them).
 *
 * Returns: { paper }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Size check (5 MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  const title = (form.get("title") as string | null)?.toString().trim() || file.name.replace(/\.[^/.]+$/, "");
  const description = (form.get("description") as string | null)?.toString().trim() || null;
  const category = (form.get("category") as string | null)?.toString() || "past_paper";
  const paperType = (form.get("paperType") as string | null)?.toString().trim() || null;
  const gradeLevel = (form.get("gradeLevel") as string | null)?.toString().trim() || null;
  const subjectName = (form.get("subjectName") as string | null)?.toString().trim() || null;
  const schoolName = (form.get("schoolName") as string | null)?.toString().trim() || null;
  const yearRaw = (form.get("year") as string | null)?.toString().trim();
  const year = yearRaw ? Number(yearRaw) : null;
  const coverImage = (form.get("coverImage") as string | null)?.toString().trim() || null;
  const pagesRaw = (form.get("pages") as string | null)?.toString().trim();
  const pages = pagesRaw ? Number(pagesRaw) : null;
  const durationMinRaw = (form.get("durationMinutes") as string | null)?.toString().trim();
  const durationMin = durationMinRaw ? Number(durationMinRaw) : 60;
  const convertToExam = (form.get("convertToExam") as string | null)?.toString() === "true";

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const allowedExt = ["pdf", "doc", "docx"];
  if (!allowedExt.includes(ext)) {
    return NextResponse.json({ error: "Only PDF, DOC, or DOCX files are allowed" }, { status: 400 });
  }

  // Read file into buffer
  const arrayBuffer = await file.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);

  // -----------------------------------------------------------------
  // Step 1: Convert DOC/DOCX → PDF (so the in-app viewer can render it)
  // -----------------------------------------------------------------
  let finalPdfBuffer: Buffer | null = null;
  let originalMimeType: string;
  if (ext === "pdf") {
    finalPdfBuffer = originalBuffer;
    originalMimeType = "application/pdf";
  } else {
    // DOC / DOCX → convert to PDF via LibreOffice
    originalMimeType = ext === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/msword";
    try {
      const tmpDir = "/tmp/exam-uploads";
      if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
      const tmpFileName = `upload-${Date.now()}.${ext}`;
      const tmpFilePath = path.join(tmpDir, tmpFileName);
      await writeFile(tmpFilePath, originalBuffer);

      execSync(`libreoffice --headless --convert-to pdf --outdir ${tmpDir} ${tmpFilePath}`, {
        timeout: 45000,
        stdio: "pipe",
      });

      const pdfFileName = tmpFileName.replace(/\.(doc|docx)$/, ".pdf");
      const pdfFilePath = path.join(tmpDir, pdfFileName);

      if (existsSync(pdfFilePath)) {
        finalPdfBuffer = await readFile(pdfFilePath);
        await unlink(tmpFilePath).catch(() => {});
        await unlink(pdfFilePath).catch(() => {});
      } else {
        // Conversion failed — keep the original as the data URL fallback
        console.error("[exam-papers/upload] LibreOffice conversion produced no PDF");
      }
    } catch (convErr: any) {
      console.error("[exam-papers/upload] DOCX→PDF conversion failed:", convErr?.message);
    }
  }

  // Build the data URL (PDF if available, otherwise original)
  const finalBuffer = finalPdfBuffer ?? originalBuffer;
  const finalMime = finalPdfBuffer ? "application/pdf" : originalMimeType;
  const dataUrl = `data:${finalMime};base64,${finalBuffer.toString("base64")}`;

  // -----------------------------------------------------------------
  // Step 2: If convertToExam is requested, extract text and ask AI to
  //         generate questions (turns the upload into ai_template mode)
  // -----------------------------------------------------------------
  if (convertToExam) {
    try {
      // Extract text from PDF (use pdftotext if it's a PDF, otherwise use LibreOffice
      // to convert the original DOC/DOCX → txt directly).
      let extractedText = "";

      if (ext === "pdf") {
        // Use pdftotext for fast extraction
        try {
          const tmpDir = "/tmp/exam-text";
          if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
          const tmpPdf = path.join(tmpDir, `extract-${Date.now()}.pdf`);
          const tmpTxt = path.join(tmpDir, `extract-${Date.now()}.txt`);
          await writeFile(tmpPdf, finalBuffer);
          execSync(`pdftotext -layout ${tmpPdf} ${tmpTxt}`, { timeout: 30000, stdio: "pipe" });
          if (existsSync(tmpTxt)) {
            extractedText = (await readFile(tmpTxt, "utf-8")).trim();
            await unlink(tmpPdf).catch(() => {});
            await unlink(tmpTxt).catch(() => {});
          }
        } catch (e: any) {
          console.error("[exam-papers/upload] pdftotext failed:", e?.message);
        }
      } else {
        // DOC/DOCX → txt via LibreOffice
        try {
          const tmpDir = "/tmp/exam-text";
          if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
          const tmpFileName = `extract-${Date.now()}.${ext}`;
          const tmpFilePath = path.join(tmpDir, tmpFileName);
          await writeFile(tmpFilePath, originalBuffer);
          execSync(`libreoffice --headless --convert-to txt:Text --outdir ${tmpDir} ${tmpFilePath}`, {
            timeout: 30000,
            stdio: "pipe",
          });
          const txtFileName = tmpFileName.replace(/\.(doc|docx)$/, ".txt");
          const txtFilePath = path.join(tmpDir, txtFileName);
          if (existsSync(txtFilePath)) {
            extractedText = (await readFile(txtFilePath, "utf-8")).trim();
            await unlink(tmpFilePath).catch(() => {});
            await unlink(txtFilePath).catch(() => {});
          }
        } catch (e: any) {
          console.error("[exam-papers/upload] DOCX→TXT failed:", e?.message);
        }
      }

      if (!extractedText || extractedText.length < 30) {
        return NextResponse.json(
          { error: "Could not extract enough text from the file. Try uploading as a PDF instead, or paste the content manually." },
          { status: 422 }
        );
      }

      // Generate questions via AI
      const { callAI } = await import("@/lib/ai");
      const numQuestions = 15;

      const systemPrompt = `You are an exam creator. The user uploaded a document containing exam content. Generate ${numQuestions} multiple-choice exam questions based ONLY on the content provided below.

CONTENT (extracted from uploaded file):
${extractedText.slice(0, 12000)}

Return ONLY valid JSON:
{"questions":[{"questionText":"...","options":["A","B","C","D"],"correctIndex":0,"marks":1}], "totalMarks": 0}`;

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate ${numQuestions} exam questions from the uploaded content.` },
      ];

      const reply = await callAI(messages, null, {
        userId: "system",
        route: "/api/admin/exam-papers/upload",
      });

      let cleaned = reply.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      }
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      let questions: any[] = [];
      let totalMarks = 0;
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        questions = parsed.questions ?? [];
        totalMarks = parsed.totalMarks ?? questions.reduce((s, q) => s + (q.marks ?? 1), 0);
      }

      if (questions.length === 0) {
        return NextResponse.json(
          { error: "AI couldn't generate questions from the extracted text. Try a clearer document or paste content manually." },
          { status: 500 }
        );
      }

      const finalCover = coverImage || `https://image.pollinations.ai/prompt/${encodeURIComponent("exam paper " + title + " education study")}?width=400&height=560&nologo=true`;

      const paper = await db.examPaper.create({
        data: {
          title,
          description,
          category,
          paperType,
          gradeLevel,
          subjectName,
          schoolName,
          year,
          examType: "ai_template",
          questions,
          totalMarks,
          durationMin,
          coverImage: finalCover,
          pages: pages ?? Math.ceil(questions.length / 5),
          isPublished: true,
        },
      });

      return NextResponse.json({
        paper,
        questionsGenerated: questions.length,
        textExtractedLength: extractedText.length,
      });
    } catch (e: any) {
      console.error("[exam-papers/upload] convertToExam failed:", e?.message);
      return NextResponse.json(
        { error: "Failed to convert file to exam: " + (e?.message ?? "Unknown error") },
        { status: 500 }
      );
    }
  }

  // -----------------------------------------------------------------
  // Step 3: Standard PDF mode — store the data URL as the fileUrl
  // -----------------------------------------------------------------
  const finalCover = coverImage || `https://image.pollinations.ai/prompt/${encodeURIComponent("exam paper " + title + " education study")}?width=400&height=560&nologo=true`;

  const paper = await db.examPaper.create({
    data: {
      title,
      description,
      category,
      paperType,
      gradeLevel,
      subjectName,
      schoolName,
      year,
      examType: "pdf",
      fileUrl: dataUrl,
      coverImage: finalCover,
      pages,
      durationMin,
      isPublished: true,
    },
  });

  return NextResponse.json({ paper });
}
