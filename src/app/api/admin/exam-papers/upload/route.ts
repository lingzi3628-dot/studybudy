import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";

export const runtime = "nodejs";
export const maxDuration = 60;

// In-memory store for uploaded files (persists within a warm serverless instance)
// Key: fileId, Value: { buffer, contentType, fileName }
const fileStore = new Map<string, { buffer: Buffer; contentType: string; fileName: string }>();

/**
 * POST /api/admin/exam-papers/upload
 *
 * Accepts a multipart/form-data file upload (PDF, max 15MB).
 * Stores the file in memory (serverless-safe, no filesystem writes).
 * Returns { ok, fileUrl } where fileUrl is a dynamic serve URL.
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e: any) {
    console.error("[exam-upload] formData parse error:", e?.message);
    return NextResponse.json(
      { error: "Failed to parse upload. Make sure the file is under 15MB." },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Max 15MB
  const MAX_SIZE = 15 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 15MB." }, { status: 413 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // Validate file extension
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!["pdf", "doc", "docx"].includes(ext)) {
    return NextResponse.json({ error: "Only PDF, DOC, or DOCX files are allowed" }, { status: 400 });
  }

  try {
    // Read file into buffer (in-memory, no filesystem write needed)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a unique file ID
    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Store in memory
    const contentType = file.type || (ext === "pdf" ? "application/pdf" : "application/octet-stream");
    fileStore.set(fileId, { buffer, contentType, fileName: file.name });

    // Generate a serve URL that will stream the file back
    const fileUrl = `/api/exam-file/${fileId}`;

    console.log("[exam-upload] Stored in memory:", fileId, "size:", file.size, "name:", file.name);

    return NextResponse.json({
      ok: true,
      fileUrl,
      fileName: file.name,
      size: file.size,
    });
  } catch (e: any) {
    console.error("[exam-upload] error:", e?.message, e?.code);
    return NextResponse.json(
      { error: "Failed to upload file: " + (e?.message ?? "unknown error") },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/exam-papers/upload?fileId=...
 *
 * Serves a previously uploaded file from the in-memory store.
 * This allows students to view/download the PDF.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fileId = url.searchParams.get("fileId") ?? "";

  const stored = fileStore.get(fileId);
  if (!stored) {
    return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
  }

  return new NextResponse(stored.buffer, {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Disposition": `inline; filename="${stored.fileName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// Export the store so the serve route can access it
export { fileStore };
