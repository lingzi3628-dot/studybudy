import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/usage-analytics
 *   ?range=24h|7d|30d   (default 7d)
 *   ?groupBy=provider|model|user|route   (default provider)
 *
 * Returns aggregated usage statistics from ai_call_logs:
 *   - Total calls, success/error count, total tokens, total cost
 *   - Per-group breakdown (calls, success rate, avg latency from health checks,
 *     tokens, cost, cost per day)
 *   - Time series for sparklines (calls per hour/day)
 *
 * Used by the admin Usage Analytics dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminJwt();
  } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const range = (url.searchParams.get("range") ?? "7d").toString();
  const groupBy = (url.searchParams.get("groupBy") ?? "provider").toString();

  // Compute the "since" timestamp based on range
  const now = Date.now();
  const since = new Date(
    range === "24h" ? now - 24 * 60 * 60 * 1000 :
    range === "30d" ? now - 30 * 24 * 60 * 60 * 1000 :
    now - 7 * 24 * 60 * 60 * 1000  // default 7d
  );

  // Fetch logs in range
  const logs = await db.aiCallLog.findMany({
    where: { createdAt: { gt: since } },
    select: {
      id: true,
      userId: true,
      providerId: true,
      providerType: true,
      model: true,
      route: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      cost: true,
      status: true,
      errorMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Aggregate by the chosen groupBy dimension
  type Bucket = {
    key: string;
    totalCalls: number;
    successCount: number;
    errorCount: number;
    totalTokens: number;
    totalCost: number;
    byHour: Array<{ hour: string; calls: number }>;
    byDay: Array<{ day: string; calls: number }>;
  };

  const buckets = new Map<string, Bucket>();

  for (const log of logs) {
    let key: string;
    switch (groupBy) {
      case "model":
        key = log.model ?? "(unknown)";
        break;
      case "user":
        key = log.userId ?? "(system)";
        break;
      case "route":
        key = log.route ?? "(unknown)";
        break;
      case "provider":
      default:
        key = log.providerId ?? log.providerType ?? "(platform)";
        break;
    }
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        totalCalls: 0,
        successCount: 0,
        errorCount: 0,
        totalTokens: 0,
        totalCost: 0,
        byHour: [],
        byDay: [],
      });
    }
    const bucket = buckets.get(key)!;
    bucket.totalCalls++;
    if (log.status === "success") bucket.successCount++;
    else bucket.errorCount++;
    bucket.totalTokens += log.totalTokens ?? 0;
    bucket.totalCost += log.cost ?? 0;
  }

  // For per-day aggregation (used in sparklines)
  const byDayMap = new Map<string, Map<string, number>>();
  for (const log of logs) {
    const day = log.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
    let key: string;
    switch (groupBy) {
      case "model": key = log.model ?? "(unknown)"; break;
      case "user": key = log.userId ?? "(system)"; break;
      case "route": key = log.route ?? "(unknown)"; break;
      default: key = log.providerId ?? log.providerType ?? "(platform)";
    }
    if (!byDayMap.has(key)) byDayMap.set(key, new Map());
    const dayMap = byDayMap.get(key)!;
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  for (const [key, dayMap] of byDayMap.entries()) {
    if (buckets.has(key)) {
      buckets.get(key)!.byDay = Array.from(dayMap.entries())
        .map(([day, calls]) => ({ day, calls }))
        .sort((a, b) => a.day.localeCompare(b.day));
    }
  }

  // Sort buckets by total calls descending
  const result = Array.from(buckets.values()).sort((a, b) => b.totalCalls - a.totalCalls);

  // Overall totals
  const totals = {
    totalCalls: logs.length,
    successCount: logs.filter((l) => l.status === "success").length,
    errorCount: logs.filter((l) => l.status !== "success").length,
    totalTokens: logs.reduce((s, l) => s + (l.totalTokens ?? 0), 0),
    totalCost: logs.reduce((s, l) => s + (l.cost ?? 0), 0),
    uniqueUsers: new Set(logs.map((l) => l.userId).filter(Boolean)).size,
  };

  return NextResponse.json({
    range,
    groupBy,
    since: since.toISOString(),
    totals,
    buckets: result,
  });
}
