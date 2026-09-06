import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * DELETE /api/knowledge-sources/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const existing = await db.botKnowledgeSource.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  await db.botKnowledgeSource.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/**
 * GET /api/knowledge-sources/[id]
 *   Returns full source details including chunks (for RAG retrieval client-side).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const source = await db.botKnowledgeSource.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      title: true,
      source: true,
      chunks: true,
      chunkCount: true,
      charCount: true,
      status: true,
      userId: true,
    },
  });

  if (!source || source.userId !== user.id) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  return NextResponse.json({
    source: {
      ...source,
      chunks: source.chunks as Array<{ index: number; text: string }>,
    },
  });
}
