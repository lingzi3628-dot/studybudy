import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ingestUrl, ingestGithub, ingestText } from "@/lib/knowledge-ingest";

export const runtime = "nodejs";
export const maxDuration = 30; // URL/GitHub fetches can take a few seconds

/**
 * GET /api/knowledge-sources?botId=...
 *   List the current user's knowledge sources. Optional botId filter.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const botId = url.searchParams.get("botId");

  const where: any = { userId: user.id };
  if (botId) where.botId = botId;

  const sources = await db.botKnowledgeSource.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      type: true,
      title: true,
      source: true,
      chunkCount: true,
      charCount: true,
      status: true,
      botId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    sources: sources.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/knowledge-sources
 *   Body: { type: "url"|"github"|"text", url?, repo?, text?, title?, botId? }
 *
 * Ingests the content, chunks it, and stores in the DB.
 * For file uploads, use POST /api/knowledge-sources/upload instead.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    type?: string;
    url?: string;
    repo?: string;
    text?: string;
    title?: string;
    botId?: string;
  };

  const type = body.type;
  if (!["url", "github", "text"].includes(type || "")) {
    return NextResponse.json({ error: "type must be 'url', 'github', or 'text'" }, { status: 400 });
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
    let result;
    if (type === "url") {
      const url = (body.url || "").trim();
      if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
      result = await ingestUrl(url);
    } else if (type === "github") {
      const repo = (body.repo || body.url || "").trim();
      if (!repo) return NextResponse.json({ error: "repo URL is required" }, { status: 400 });
      result = await ingestGithub(repo);
    } else {
      // text
      const text = (body.text || "").trim();
      if (!text || text.length < 10) {
        return NextResponse.json({ error: "text must be at least 10 characters" }, { status: 400 });
      }
      result = ingestText(text, body.title || "Pasted text");
    }

    const source = await db.botKnowledgeSource.create({
      data: {
        userId: user.id,
        botId: body.botId ?? null,
        type: type!,
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
    return NextResponse.json({ error: e?.message || "Ingestion failed" }, { status: 500 });
  }
}
