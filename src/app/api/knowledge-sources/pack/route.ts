import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPackById } from "@/lib/knowledge-packs";
import { ingestKnowledgePack } from "@/lib/knowledge-ingest";

export const runtime = "nodejs";
export const maxDuration = 60; // packs fetch multiple Wikipedia articles — needs time

/**
 * POST /api/knowledge-sources/pack
 *   Body: { packId, botId? }
 *
 * Ingests a curated knowledge pack: fetches all sources (Wikipedia articles
 * + URLs), chunks them, and stores as a single BotKnowledgeSource.
 *
 * This is the "Data & Knowledge" marketplace feature — users browse a
 * catalog of pre-built packs and add them with one click.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    packId?: string;
    botId?: string;
  };

  const packId = body.packId;
  const pack = packId ? getPackById(packId) : undefined;
  if (!pack) {
    return NextResponse.json({ error: `Unknown pack: ${packId}` }, { status: 400 });
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
    const result = await ingestKnowledgePack(pack.name, pack.sources);

    const source = await db.botKnowledgeSource.create({
      data: {
        userId: user.id,
        botId: body.botId ?? null,
        type: "pack",
        title: `${pack.icon} ${pack.name}`,
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
      pack: {
        id: pack.id,
        name: pack.name,
        icon: pack.icon,
        articlesFetched: result.chunkCount > 0 ? pack.sources.length : 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Pack ingestion failed" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/knowledge-sources/pack
 *   Returns the full pack catalog (for the UI to render).
 */
export async function GET() {
  // No auth needed — the catalog is public (same as browsing a marketplace).
  // The user only needs auth to ADD a pack.
  const { KNOWLEDGE_PACKS, PACK_CATEGORIES } = await import("@/lib/knowledge-packs");
  return NextResponse.json({
    packs: KNOWLEDGE_PACKS,
    categories: PACK_CATEGORIES,
  });
}
