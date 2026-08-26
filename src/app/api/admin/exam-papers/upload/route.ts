import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/exam-papers/upload
 *
 * Accepts multipart/form-data with:
 *   - file: the PDF/DOC file (max 5MB for file mode)
 *   - title, description, category, paperType, gradeLevel, subjectName,
 *     schoolName, year, coverImage, pages, durationMinutes
 *
 * Converts the file to a base64 data URL and stores it directly in the
 * ExamPaper table. This works on Vercel (no filesystem needed, no
 * in-memory store that resets on cold start).
 *
 * For files > 5MB, the admin should use 'From URL' mode.
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to parse upload. File may be too large (max 5MB for file upload)." },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Max 5MB for file uploads (base64 encoding makes it ~33% larger)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({
      error: "File is too large for direct upload (max 5MB). For larger files, use 'From URL' mode and host the PDF externally (e.g. Google Drive).",
    }, { status: 413 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // Validate file extension — PDF, DOC, DOCX
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!["pdf", "doc", "docx"].includes(ext)) {
    return NextResponse.json({ error: "Only PDF, DOC, or DOCX files are allowed" }, { status: 400 });
  }

  try {
    // Convert file to base64 data URL
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    // Determine content type
    const contentType =
      ext === "pdf" ? "application/pdf" :
      ext === "doc" ? "application/msword" :
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const dataUrl = `data:${contentType};base64,${base64}`;

    // Extract metadata from form fields
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

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Create the ExamPaper record with the data URL as fileUrl
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

    console.log("[exam-upload] Created paper:", paper.id, "title:", title, "fileSize:", file.size);

    return NextResponse.json({
      ok: true,
      paper,
      fileUrl: dataUrl.slice(0, 50) + "...(stored in DB)",
      fileName: file.name,
      size: file.size,
    });
  } catch (e: any) {
    console.error("[exam-upload] error:", e?.message, e?.code);
    return NextResponse.json(
      { error: "Failed to save exam: " + (e?.message ?? "unknown error") },
      { status: 500 }
    );
  }
}
