import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/exam-papers/upload
 *
 * Accepts multipart/form-data with file + metadata.
 * - PDF files: stored directly as base64 data URL
 * - DOC/DOCX files: converted to PDF via LibreOffice, then stored as base64
 * - Max 5MB per file
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Failed to parse upload. File may be too large (max 5MB)." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5MB). Use 'From URL' mode for larger files." }, { status: 413 });
  }
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!["pdf", "doc", "docx"].includes(ext)) {
    return NextResponse.json({ error: "Only PDF, DOC, or DOCX files are allowed" }, { status: 400 });
  }

  try {
    let pdfBuffer: Buffer;
    let converted = false;

    if (ext === "pdf") {
      // Already PDF — just read the buffer
      const arrayBuffer = await file.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
    } else {
      // DOC/DOCX — convert to PDF using LibreOffice
      const arrayBuffer = await file.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);

      // Write to /tmp for LibreOffice conversion
      const tmpDir = "/tmp/exam-conversions";
      if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

      const tmpFileName = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const tmpFilePath = path.join(tmpDir, tmpFileName);

      await writeFile(tmpFilePath, originalBuffer);

      try {
        // Convert to PDF using LibreOffice headless
        execSync(`libreoffice --headless --convert-to pdf --outdir ${tmpDir} ${tmpFilePath}`, {
          timeout: 30000,
          stdio: "pipe",
        });

        // Read the converted PDF
        const pdfFileName = tmpFileName.replace(/\.(doc|docx)$/, ".pdf");
        const pdfFilePath = path.join(tmpDir, pdfFileName);

        if (!existsSync(pdfFilePath)) {
          throw new Error("PDF conversion failed — LibreOffice didn't produce output");
        }

        pdfBuffer = await readFile(pdfFilePath);
        converted = true;

        // Clean up temp files
        await unlink(tmpFilePath).catch(() => {});
        await unlink(pdfFilePath).catch(() => {});
      } catch (convError: any) {
        // If conversion fails, store as-is (DOC/DOCX won't render in browser
        // but at least it's saved)
        console.error("[exam-upload] DOCX→PDF conversion failed:", convError?.message);
        pdfBuffer = originalBuffer;
      }
    }

    // Convert to base64 data URL (always as PDF)
    const base64 = pdfBuffer.toString("base64");
    const dataUrl = `data:application/pdf;base64,${base64}`;

    // Extract metadata
    const title = (formData.get("title") as string ?? "").toString().trim();
    const description = (formData.get("description") as string ?? "").toString().trim() || null;
    const category = (formData.get("category") as string ?? "past_paper").toString();
    const paperType = (formData.get("paperType") as string ?? "").toString().trim() || null;
    const gradeLevel = (formData.get("gradeLevel") as string ?? "").toString().trim() || null;
    const subjectName = (formData.get("subjectName") as string ?? "").toString().trim() || null;
    const schoolName = (formData.get("schoolName") as string ?? "").toString().trim() || null;
    const year = formData.get("year") ? Number(formData.get("year")) : null;
    const coverImage = (formData.get("coverImage") as string ?? "").toString().trim() || null;
    const pages = formData.get("pages") ? Number(formData.get("pages")) : null;
    const durationMinutes = formData.get("durationMinutes") ? Number(formData.get("durationMinutes")) : 60;

    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

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
        coverImage,
        pages,
        durationMin: durationMinutes,
        isPublished: true,
      },
    });

    console.log("[exam-upload] Created:", paper.id, "title:", title, "converted:", converted, "size:", pdfBuffer.length);

    return NextResponse.json({
      ok: true,
      paper,
      fileName: file.name,
      size: file.size,
      converted,
    });
  } catch (e: any) {
    console.error("[exam-upload] error:", e?.message);
    return NextResponse.json({ error: "Failed to save exam: " + (e?.message ?? "unknown error") }, { status: 500 });
  }
}
