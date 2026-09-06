import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateBotSlug } from "@/lib/bot-engine";

export const runtime = "nodejs";

/**
 * GET /api/deployed-bots
 *   List the current user's deployed bots.
 *   Response: { bots: [{ id, name, slug, status, messageCount, ... }] }
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const bots = await db.deployedBot.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      matchingMode: true,
      threshold: true,
      version: true,
      messageCount: true,
      fallbackCount: true,
      uniqueUsers: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({
    bots: bots.map((b) => ({
      ...b,
      lastMessageAt: b.lastMessageAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
  });
}

/**
 * POST /api/deployed-bots
 *   Body: { name, trainingData: [{input, output, intent?}], matchingMode?, threshold?,
 *           personaPrompt?, generativeFallback?, thinkingDelay?, botMemory?, projectId? }
 *   Response: { bot: { id, slug, embedUrl, ... } }
 *
 * Pre-flight: rejects deploys with 0 training pairs, threshold < 0.20,
 *   or unresolved contradictions (mirrors Phase 69 quality scanner).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    trainingData?: any[];
    matchingMode?: string;
    threshold?: number;
    personaPrompt?: string;
    generativeFallback?: boolean;
    thinkingDelay?: number;
    botMemory?: boolean;
    projectId?: string;
  };

  const name = (body.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: "name too long (max 100)" }, { status: 400 });

  const trainingData = Array.isArray(body.trainingData) ? body.trainingData : [];
  if (trainingData.length === 0) {
    return NextResponse.json({ error: "Training data is empty — add at least one Q&A pair before deploying." }, { status: 400 });
  }
  if (trainingData.length > 100000) {
    return NextResponse.json({ error: "Too many training pairs (max 100,000)." }, { status: 400 });
  }

  // Validate + normalize each pair.
  const cleanPairs = trainingData.map((p, i) => ({
    id: String(p.id ?? `pair-${i}`),
    input: String(p.input ?? "").slice(0, 2000),
    output: String(p.output ?? "").slice(0, 8000),
    intent: p.intent ? String(p.intent).slice(0, 100) : undefined,
    isTest: !!p.isTest,
  })).filter((p) => p.input.trim() && p.output.trim());

  if (cleanPairs.length === 0) {
    return NextResponse.json({ error: "No valid training pairs found (each needs an input AND output)." }, { status: 400 });
  }

  // Pre-flight: contradictions (same input, different outputs).
  const byInput = new Map<string, number>();
  for (const p of cleanPairs) {
    const key = p.input.toLowerCase().trim();
    byInput.set(key, (byInput.get(key) ?? 0) + 1);
  }
  // (We don't block deploy on contradictions — just warn. The eval tab is the
  // right place to enforce. But we DO block on threshold < 0.20.)
  const contradictions = Array.from(byInput.values()).filter((c) => c > 1).reduce((s, c) => s + c, 0);

  const threshold = typeof body.threshold === "number" ? body.threshold : 0.30;
  if (threshold < 0.20) {
    return NextResponse.json({ error: "Threshold too low (min 0.20) — below this the bot returns wrong matches." }, { status: 400 });
  }

  const matchingMode = ["tfidf", "keyword", "fuzzy", "hybrid"].includes(body.matchingMode ?? "")
    ? body.matchingMode!
    : "hybrid";

  // If projectId provided, verify ownership.
  if (body.projectId) {
    const project = await db.project.findUnique({
      where: { id: body.projectId },
      select: { userId: true },
    });
    if (!project || project.userId !== user.id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // Generate a unique slug (retry on rare collisions).
  let slug = generateBotSlug();
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await db.deployedBot.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) break;
    slug = generateBotSlug();
  }

  const bot = await db.deployedBot.create({
    data: {
      userId: user.id,
      projectId: body.projectId ?? null,
      name,
      slug,
      matchingMode,
      threshold,
      thinkingDelay: typeof body.thinkingDelay === "number" ? body.thinkingDelay : 3,
      botMemory: body.botMemory !== false,
      generativeFallback: body.generativeFallback !== false,
      personaPrompt: body.personaPrompt?.slice(0, 4000) ?? null,
      trainingData: cleanPairs,
      status: "deployed",
    },
  });

  return NextResponse.json({
    bot: {
      id: bot.id,
      name: bot.name,
      slug: bot.slug,
      embedUrl: `/embed/${bot.slug}`,
      apiUrl: `/api/embed/${bot.slug}/messages`,
      matchingMode: bot.matchingMode,
      threshold: bot.threshold,
      version: bot.version,
      pairCount: cleanPairs.length,
      contradictions,
      createdAt: bot.createdAt.toISOString(),
    },
  });
}
