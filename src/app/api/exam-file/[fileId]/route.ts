import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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

  // Import the in-memory store from the upload route
  const { fileStore } = await import("@/app/api/admin/exam-papers/upload/route");

  const stored = fileStore.get(fileId);
  if (!stored) {
    return NextResponse.json(
      { error: "File not found. The server may have restarted — please re-upload." },
      { status: 404 }
    );
  }

  return new NextResponse(stored.buffer, {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Disposition": `inline; filename="${stored.fileName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
