import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { searchHFDatasets, ingestHFDataset } from "@/lib/huggingface";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/knowledge-sources/huggingface?q=...
 *   Search Hugging Face datasets by keyword. No auth needed (public API).
 *   Returns up to 20 matching datasets.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q.trim()) {
    return NextResponse.json({ error: "q (search query) is required" }, { status: 400 });
  }
  try {
    const result = await searchHFDatasets(q.trim(), 20);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Search failed" }, { status: 500 });
  }
}

/**
 * POST /api/knowledge-sources/huggingface
 *   Body: { datasetId, botId? }
 *   Ingests a Hugging Face dataset: fetches files, parses, cleans, dedupes,
 *   converts to Q&A pairs or text chunks, stores as a BotKnowledgeSource.
 *
 * If the dataset has Q&A columns (input/output, question/answer, etc.), the
 * Q&A pairs are also returned so the client can offer to add them as training
 * data (not just knowledge base).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    datasetId?: string;
    botId?: string;
  };

  const datasetId = (body.datasetId || "").trim();
  if (!datasetId) {
    return NextResponse.json({ error: "datasetId is required" }, { status: 400 });
  }

  // If botId provided, verify ownership.
  if (body.botId) {
    const bot = await db.deployedBot.findUnique({
      where: { id: body.botId },
      select: { userId: true },
    });
    if (!bot || bot.userId !== user.id) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }
  }

  try {
    const result = await ingestHFDataset(datasetId);

    const source = await db.botKnowledgeSource.create({
      data: {
        userId: user.id,
        botId: body.botId ?? null,
        type: "huggingface",
        title: result.title,
        source: result.source,
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
        source: source.source,
        chunkCount: source.chunkCount,
        charCount: source.charCount,
        createdAt: source.createdAt.toISOString(),
      },
      qaPairs: result.qaPairs || [],
      qaPairCount: result.qaPairs?.length || 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Dataset ingestion failed" },
      { status: 500 },
    );
  }
}
