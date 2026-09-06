import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/deployed-bots/[id]
 *   Owner-only: full bot details incl. training data.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const bot = await db.deployedBot.findUnique({
    where: { id },
    include: {
      _count: { select: { messages: true } },
    },
  });

  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  return NextResponse.json({
    bot: {
      id: bot.id,
      name: bot.name,
      slug: bot.slug,
      embedUrl: `/embed/${bot.slug}`,
      apiUrl: `/api/embed/${bot.slug}/messages`,
      matchingMode: bot.matchingMode,
      threshold: bot.threshold,
      thinkingDelay: bot.thinkingDelay,
      botMemory: bot.botMemory,
      generativeFallback: bot.generativeFallback,
      personaPrompt: bot.personaPrompt,
      version: bot.version,
      trainingData: bot.trainingData,
      status: bot.status,
      messageCount: bot.messageCount,
      fallbackCount: bot.fallbackCount,
      uniqueUsers: bot.uniqueUsers,
      lastMessageAt: bot.lastMessageAt?.toISOString() ?? null,
      createdAt: bot.createdAt.toISOString(),
      updatedAt: bot.updatedAt.toISOString(),
    },
  });
}

/**
 * PATCH /api/deployed-bots/[id]
 *   Body: { name?, status?, trainingData?, matchingMode?, threshold?, personaPrompt?,
 *           generativeFallback?, thinkingDelay?, botMemory? }
 *   Updating trainingData bumps the version.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    status?: string;
    trainingData?: any[];
    matchingMode?: string;
    threshold?: number;
    personaPrompt?: string;
    generativeFallback?: boolean;
    thinkingDelay?: number;
    botMemory?: boolean;
  };

  const existing = await db.deployedBot.findUnique({ where: { id }, select: { userId: true, version: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const data: any = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    data.name = n.slice(0, 100);
  }
  if (body.status !== undefined) {
    if (!["draft", "deployed", "paused"].includes(body.status)) {
      return NextResponse.json({ error: "status must be draft|deployed|paused" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.matchingMode !== undefined) {
    if (!["tfidf", "keyword", "fuzzy", "hybrid"].includes(body.matchingMode)) {
      return NextResponse.json({ error: "matchingMode must be tfidf|keyword|fuzzy|hybrid" }, { status: 400 });
    }
    data.matchingMode = body.matchingMode;
  }
  if (body.threshold !== undefined) {
    if (typeof body.threshold !== "number" || body.threshold < 0.20 || body.threshold > 1) {
      return NextResponse.json({ error: "threshold must be in [0.20, 1.0]" }, { status: 400 });
    }
    data.threshold = body.threshold;
  }
  if (body.personaPrompt !== undefined) data.personaPrompt = body.personaPrompt?.slice(0, 4000) ?? null;
  if (body.generativeFallback !== undefined) data.generativeFallback = !!body.generativeFallback;
  if (body.thinkingDelay !== undefined) data.thinkingDelay = Math.max(0, Math.min(10, body.thinkingDelay));
  if (body.botMemory !== undefined) data.botMemory = !!body.botMemory;

  if (body.trainingData !== undefined) {
    if (!Array.isArray(body.trainingData) || body.trainingData.length === 0) {
      return NextResponse.json({ error: "trainingData must be a non-empty array" }, { status: 400 });
    }
    if (body.trainingData.length > 100000) {
      return NextResponse.json({ error: "Too many training pairs (max 100,000)" }, { status: 400 });
    }
    data.trainingData = body.trainingData.map((p, i) => ({
      id: String(p.id ?? `pair-${i}`),
      input: String(p.input ?? "").slice(0, 2000),
      output: String(p.output ?? "").slice(0, 8000),
      intent: p.intent ? String(p.intent).slice(0, 100) : undefined,
      isTest: !!p.isTest,
    })).filter((p: any) => p.input.trim() && p.output.trim());
    data.version = existing.version + 1;
  }

  const updated = await db.deployedBot.update({ where: { id }, data });
  return NextResponse.json({
    bot: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      version: updated.version,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

/**
 * DELETE /api/deployed-bots/[id]
 *   Permanently delete the bot + all its messages (cascade).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const existing = await db.deployedBot.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  await db.deployedBot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
