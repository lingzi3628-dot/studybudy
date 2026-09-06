import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/deployed-bots/[id]/analytics?range=24h|7d|30d
 *
 * Owner-only. Returns chat volume, fallback rate, top missed queries,
 * and intent/source breakdowns for the deployed bot.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "7d";

  const rangeMs = range === "24h" ? 24 * 60 * 60 * 1000 :
                  range === "30d" ? 30 * 24 * 60 * 60 * 1000 :
                  7 * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - rangeMs);

  // Verify ownership.
  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true, name: true, slug: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  // Pull messages in range.
  const messages = await db.deployedBotMessage.findMany({
    where: { botId: id, createdAt: { gte: since } },
    select: {
      source: true,
      understood: true,
      bestScore: true,
      input: true,
      output: true,
      topMatches: true,
      responseMs: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  // Aggregate.
  const total = messages.length;
  const bySource = { retrieval: 0, generative: 0, fallback: 0 };
  let totalResponseMs = 0;
  let totalScore = 0;
  for (const m of messages) {
    bySource[m.source as keyof typeof bySource] = (bySource[m.source as keyof typeof bySource] || 0) + 1;
    totalResponseMs += m.responseMs;
    totalScore += m.bestScore;
  }

  // Top missed queries = fallback/generative messages, grouped by normalized input.
  const missed = new Map<string, { count: number; lastAt: Date; sampleOutput: string; topMatches: any }>();
  for (const m of messages) {
    if (m.source === "retrieval") continue;
    const key = m.input.toLowerCase().trim().slice(0, 100);
    if (!missed.has(key)) {
      missed.set(key, { count: 1, lastAt: m.createdAt, sampleOutput: m.output, topMatches: m.topMatches });
    } else {
      const e = missed.get(key)!;
      e.count += 1;
      if (m.createdAt > e.lastAt) e.lastAt = m.createdAt;
    }
  }
  const topMissed = Array.from(missed.entries())
    .map(([input, info]) => ({ input, ...info, lastAt: info.lastAt.toISOString() }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Hourly volume for the chart (24 buckets for 24h, 7 buckets for 7d, 30 buckets for 30d).
  const buckets = range === "24h" ? 24 : range === "30d" ? 30 : 7;
  const bucketMs = rangeMs / buckets;
  const volume = new Array(buckets).fill(0);
  const now = Date.now();
  for (const m of messages) {
    const age = now - m.createdAt.getTime();
    const bucketIdx = Math.floor((rangeMs - age) / bucketMs);
    if (bucketIdx >= 0 && bucketIdx < buckets) volume[bucketIdx]++;
  }

  return NextResponse.json({
    bot: { id, name: bot.name, slug: bot.slug },
    range,
    since: since.toISOString(),
    summary: {
      totalMessages: total,
      retrievalCount: bySource.retrieval,
      generativeCount: bySource.generative,
      fallbackCount: bySource.fallback,
      fallbackRate: total > 0 ? (bySource.generative + bySource.fallback) / total : 0,
      avgResponseMs: total > 0 ? Math.round(totalResponseMs / total) : 0,
      avgConfidence: total > 0 ? totalScore / total : 0,
    },
    volume,  // chart data — bucket counts oldest→newest
    topMissed,
  });
}
