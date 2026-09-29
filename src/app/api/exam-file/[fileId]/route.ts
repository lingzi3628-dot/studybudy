import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * In-memory file store for exam papers that need to be served publicly
 * (e.g. PDFs uploaded by admins but not yet persisted to long-term storage).
 *
 * Entries are keyed by a fileId (uuid). Each value: { buffer, contentType, fileName, createdAt }.
 *
 * Note: in serverless environments (Vercel), this store is per-instance and will
 * reset between cold starts. For long-term storage, the upload route stores files
 * as data URLs on the ExamPaper.fileUrl field in the database.
 */
export type StoredFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  createdAt: number;
};

export const fileStore = new Map<string, StoredFile>();

/**
 * Helper for other routes to register a file in the store.
 * Usage:  import { fileStore } from "@/app/api/exam-file/[fileId]/route";
 *          fileStore.set(fileId, { buffer, contentType, fileName, createdAt: Date.now() });
 */
export function putFile(fileId: string, file: StoredFile) {
  fileStore.set(fileId, file);
  // Auto-expire after 1 hour to avoid memory bloat
  setTimeout(() => fileStore.delete(fileId), 60 * 60 * 1000).unref?.();
}

/**
 * GET /api/exam-file/[fileId]
 *
 * Serves a previously uploaded exam PDF from the in-memory store.
 * This route is public (no auth) so students can view the exam.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  const stored = fileStore.get(fileId);
  if (!stored) {
    return NextResponse.json(
      { error: "File not found. The server may have restarted — please re-upload." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(stored.buffer), {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Disposition": `inline; filename="${stored.fileName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
