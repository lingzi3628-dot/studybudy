import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ingestFile } from "@/lib/knowledge-ingest";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/knowledge-sources/upload
 *   Multipart form: { file: File, botId?: string }
 *   Parses the file, extracts text, chunks it, stores as a knowledge source.
 *
 * Supports: PDF, DOCX, TXT, MD, CSV, JSON, code files.
 * Max 10 MB.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const botId = form.get("botId") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > 10_000_000) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  // If botId provided, verify ownership.
  if (botId) {
    const bot = await db.deployedBot.findUnique({
      where: { id: botId },
      select: { userId: true },
    });
    if (!bot || bot.userId !== user.id) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }
  }

  try {
    const buffer = await file.arrayBuffer();
    const result = await ingestFile(file.name, file.type, buffer);

    const source = await db.botKnowledgeSource.create({
      data: {
        userId: user.id,
        botId: botId ?? null,
        type: "file",
        title: result.title,
        source: result.source ?? null,
        contentText: result.contentText,
        chunks: result.chunks,
        chunkCount: result.chunkCount,
        charCount: result.charCount,
        status: "active",
      },
    });

    return NextResponse.json({
      source: {
        id: source.id,
        type: source.type,
        title: source.title,
        chunkCount: source.chunkCount,
        charCount: source.charCount,
        createdAt: source.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "File parsing failed" }, { status: 500 });
  }
}
