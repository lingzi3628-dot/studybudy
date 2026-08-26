import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * POST /api/admin/exam-papers/upload
 *
 * Accepts a multipart/form-data file upload (PDF, max 15MB).
 * Saves to /public/exams/{timestamp}-{filename}.pdf
 * Returns { ok, fileUrl }.
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Max 15MB
  const MAX_SIZE = 15 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 15MB." }, { status: 413 });
  }

  // Validate file type
  const allowedTypes = ["application/pdf", "application/octet-stream"];
  const allowedExtensions = [".pdf", ".doc", ".docx"];
  const ext = path.extname(file.name).toLowerCase();
  if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
  }

  try {
    // Ensure the exams directory exists
    const uploadDir = path.join(process.cwd(), "public", "exams");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generate a safe filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadDir, fileName);

    // Write the file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    const fileUrl = `/exams/${fileName}`;

    return NextResponse.json({
      ok: true,
      fileUrl,
      fileName: file.name,
      size: file.size,
    });
  } catch (e: any) {
    console.error("file upload error:", e?.message);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
