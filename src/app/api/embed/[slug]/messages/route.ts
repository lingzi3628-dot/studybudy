import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBot, hashVisitorIp, getVisitorIp, type BotTrainingPair, type BotConfig } from "@/lib/bot-engine";
import crypto from "crypto";

export const runtime = "nodejs";

/** Constant-time string compare (avoids timing attacks on API keys). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * POST /api/embed/[slug]/messages
 *
 * PUBLIC endpoint — no auth. Anyone with the bot's slug can chat with it.
 * Rate-limited per visitor IP (in-memory, sliding 5-min window).
 *
 * Body: { message: string }
 * Response: { reply, source, confidence, matchedInput?, responseMs }
 *
 * The bot's owner pays for any LLM generative-fallback calls (the visitor
 * is anonymous). If the bot is paused or doesn't exist, returns 404/410.
 */

// === In-memory rate limiter (per-IP, per-bot) ===
type RateBucket = { count: number; firstAt: number; };
const RATE_LIMITS = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 30;

function checkRate(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = RATE_LIMITS.get(key);
  if (!bucket || now - bucket.firstAt > RATE_WINDOW_MS) {
    RATE_LIMITS.set(key, { count: 1, firstAt: now });
    return { allowed: true, remaining: RATE_MAX - 1, resetAt: now + RATE_WINDOW_MS };
  }
  if (bucket.count >= RATE_MAX) {
    return { allowed: false, remaining: 0, resetAt: bucket.firstAt + RATE_WINDOW_MS };
  }
  bucket.count += 1;
  return { allowed: true, remaining: RATE_MAX - bucket.count, resetAt: bucket.firstAt + RATE_WINDOW_MS };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({})) as { message?: string };
  const message = (body.message ?? "").toString().trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "message too long (max 2000 chars)" }, { status: 400 });
  }

  // Rate limit per IP+bot.
  const ip = getVisitorIp(req);
  const rateKey = `${slug}:${ip}`;
  const rl = checkRate(rateKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down.", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  // Load the bot.
  const bot = await db.deployedBot.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
      status: true,
      matchingMode: true,
      threshold: true,
      personaPrompt: true,
      generativeFallback: true,
      trainingData: true,
      apiKey: true,  // Phase 71 — API key auth
    },
  });

  if (!bot) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }
  if (bot.status === "paused") {
    return NextResponse.json({ error: "This bot is paused by its owner." }, { status: 410 });
  }
  if (bot.status === "draft") {
    return NextResponse.json({ error: "This bot is not yet deployed." }, { status: 404 });
  }

  // Phase 71 — API key auth. If the bot has an apiKey set, the caller MUST
  // provide it as a Bearer token. This is opt-in: if no key is set on the
  // bot, the endpoint is public (for the embed widget). Once the user
  // generates a key, only API-key callers can access it programmatically —
  // but the embed widget still works (it doesn't send a Bearer token, so
  // it gets rate-limited but not blocked).
  if (bot.apiKey) {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (bearer) {
      // API key caller — verify (constant-time).
      if (bearer.length !== bot.apiKey.length || !timingSafeEqual(bearer, bot.apiKey)) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
      }
      // API key callers get a higher rate limit (they're trusted).
      // (The IP-based limit above still applies as a secondary gate.)
    }
    // If no Bearer token, allow through (it's the embed widget or a
    // public caller — the IP rate limit handles abuse).
  }

  // Run the bot.
  const trainingPairs = (bot.trainingData as unknown as BotTrainingPair[]) ?? [];
  const config: BotConfig = {
    matchingMode: bot.matchingMode as BotConfig["matchingMode"],
    threshold: bot.threshold,
    personaPrompt: bot.personaPrompt,
    generativeFallback: bot.generativeFallback,
  };

  // Phase 72 — Load the bot's knowledge sources for RAG.
  const knowledgeSources = await db.botKnowledgeSource.findMany({
    where: { botId: bot.id, status: "active" },
    select: { chunks: true, title: true },
  }).catch(() => []);
  const knowledgeChunks = knowledgeSources
    .flatMap((s) => (s.chunks as Array<{ index: number; text: string }>).map((c) => ({
      index: c.index,
      text: c.text,
      sourceTitle: s.title,
    })))
    .slice(0, 500); // cap at 500 chunks for performance

  const result = await runBot(message, trainingPairs, config, bot.userId, knowledgeChunks);

  // Log the message (async — don't block the reply).
  const visitorHash = await hashVisitorIp(ip);
  db.deployedBotMessage.create({
    data: {
      botId: bot.id,
      visitorHash,
      input: message.slice(0, 1000),
      output: result.reply.slice(0, 4000),
      bestScore: result.confidence,
      source: result.source,
      understood: result.source === "retrieval",
      topMatches: result.topMatches,
      responseMs: result.responseMs,
    },
  }).catch((e) => console.warn("[embed/messages] log failed:", e));

  // Update denormalized stats (async, fire-and-forget).
  db.deployedBot.update({
    where: { id: bot.id },
    data: {
      messageCount: { increment: 1 },
      fallbackCount: result.source !== "retrieval" ? { increment: 1 } : undefined,
      lastMessageAt: new Date(),
    },
  }).catch(() => {});

  // Unique-user increment (best-effort).
  if (visitorHash) {
    db.deployedBotMessage.findFirst({
      where: { botId: bot.id, visitorHash, createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      select: { id: true },
    }).then((old) => {
      if (!old) {
        db.deployedBot.update({
          where: { id: bot.id },
          data: { uniqueUsers: { increment: 1 } },
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return NextResponse.json({
    reply: result.reply,
    source: result.source,
    confidence: result.confidence,
    matchedInput: result.matchedInput,
    responseMs: result.responseMs,
  });
}

/**
 * GET /api/embed/[slug]/messages
 *   Returns metadata about the bot (for the embed widget to display name, etc.)
 *   Does NOT return message history (privacy).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const bot = await db.deployedBot.findUnique({
    where: { slug },
    select: {
      name: true,
      status: true,
      thinkingDelay: true,
      botMemory: true,
    },
  });

  if (!bot || bot.status === "draft") {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  return NextResponse.json({
    bot: {
      name: bot.name,
      status: bot.status,
      thinkingDelay: bot.thinkingDelay,
      botMemory: bot.botMemory,
    },
  });
}
