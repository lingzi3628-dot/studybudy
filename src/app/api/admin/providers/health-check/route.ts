import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/providers/health-check
 *
 * Tests ALL enabled providers in parallel, saves results to ApiHealthCheck
 * table, returns a summary. Used by:
 *   - Manual "Run health check" button in admin
 *   - Vercel Cron job (every hour)
 *
 * Each test sends a tiny "Reply with ok" prompt and measures latency.
 * Status: 'ok' (latency < 5000ms), 'slow' (5000-15000ms), 'timeout' (>15s),
 *         'error' (network/HTTP error).
 *
 * Returns { results: [{ providerId, name, status, latencyMs, error? }] }
 */
export async function POST(req: NextRequest) {
  // Allow Vercel Cron (no auth) OR admin JWT
  const authHeader = req.headers.get("authorization") ?? "";
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    try {
      await requireAdminJwt();
    } catch {
      return NextResponse.json({ error: "Admin required" }, { status: 401 });
    }
  }

  const providers = await db.aiProvider.findMany({
    where: {
      enabled: true,
      OR: [
        { apiKeyEncrypted: { not: null } },
        { providerType: "pollinations" },
      ],
    },
    orderBy: { priority: "asc" },
  });

  const results = await Promise.all(
    providers.map(async (p) => {
      const start = Date.now();
      try {
        const isKeyless = p.providerType === "pollinations";
        const apiKey = p.apiKeyEncrypted ? decryptApiKey(p.apiKeyEncrypted) : "";
        const baseUrl = (p.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
        const model = p.model || "gpt-4o-mini";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        // Different API formats per provider type
        let res: Response;
        if (isKeyless) {
          // Pollinations: keyless, GET request
          const messages = [
            { role: "system", content: "Reply with the single word 'ok'." },
            { role: "user", content: "ok" },
          ];
          res = await fetch(`${baseUrl}/openai?model=${model}&messages=${encodeURIComponent(JSON.stringify(messages))}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
          });
        } else if (p.providerType === "gemini") {
          // Gemini: different URL + auth via query param
          const geminiUrl = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
          res = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "ok" }] }],
              systemInstruction: { parts: [{ text: "Reply with the single word 'ok'." }] },
              generationConfig: { maxOutputTokens: 5, temperature: 0 },
            }),
            signal: controller.signal,
          });
        } else {
          // Standard OpenAI-compatible providers
          res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              ...(p.providerType === "openrouter" ? {
                "HTTP-Referer": "https://studybuddy.ai",
                "X-Title": "StudyBuddy AI",
              } : {}),
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: "Reply with the single word 'ok'." },
                { role: "user", content: "ok" },
              ],
              max_tokens: 5,
              temperature: 0,
            }),
            signal: controller.signal,
          });
        }
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - start;
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          const status = "error";
          await db.apiHealthCheck.create({
            data: { providerId: p.id, status, latencyMs, errorMessage: `HTTP ${res.status}: ${txt.slice(0, 200)}` },
          });
          return { providerId: p.id, name: p.name, status, latencyMs, error: `HTTP ${res.status}` };
        }
        let reply = "";
        if (p.providerType === "pollinations") {
          reply = (await res.text()).trim();
        } else if (p.providerType === "gemini") {
          const geminiData = await res.json();
          reply = (geminiData?.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join("") ?? "").trim();
        } else {
          const data = await res.json();
          reply = (data?.choices?.[0]?.message?.content ?? "").trim();
        }
        const status = latencyMs > 5000 ? "slow" : "ok";
        await db.apiHealthCheck.create({
          data: { providerId: p.id, status, latencyMs, errorMessage: null },
        });
        return { providerId: p.id, name: p.name, status, latencyMs, reply: reply.slice(0, 30) };
      } catch (e: any) {
        const latencyMs = Date.now() - start;
        const isTimeout = e?.name === "AbortError";
        const status = isTimeout ? "timeout" : "error";
        await db.apiHealthCheck.create({
          data: { providerId: p.id, status, latencyMs, errorMessage: (e?.message ?? String(e)).slice(0, 200) },
        });
        return { providerId: p.id, name: p.name, status, latencyMs, error: e?.message ?? String(e) };
      }
    })
  );

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    results,
  });
}

/**
 * GET /api/admin/providers/health-check
 * Returns the latest health status for each provider (last 24h of checks).
 */
export async function GET() {
  try {
    await requireAdminJwt();
  } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const providers = await db.aiProvider.findMany({
    include: {
      healthChecks: {
        where: { checkedAt: { gt: since } },
        orderBy: { checkedAt: "desc" },
        take: 20, // last 20 checks per provider
      },
    },
  });

  // Compute summary health per provider
  const summary = providers.map((p) => {
    const checks = p.healthChecks;
    const total = checks.length;
    const okCount = checks.filter((c) => c.status === "ok").length;
    const errorCount = checks.filter((c) => c.status === "error" || c.status === "timeout").length;
    const slowCount = checks.filter((c) => c.status === "slow").length;
    const avgLatency = total > 0
      ? Math.round(checks.reduce((s, c) => s + (c.latencyMs ?? 0), 0) / total)
      : null;
    const successRate = total > 0 ? okCount / total : 0;
    // Overall health: 🟢 >80% success, 🟡 50-80%, 🔴 <50%
    const health: "green" | "yellow" | "red" | "unknown" =
      total === 0 ? "unknown" :
      successRate >= 0.8 ? "green" :
      successRate >= 0.5 ? "yellow" :
      "red";
    const lastCheck = checks[0];
    return {
      providerId: p.id,
      name: p.name,
      enabled: p.enabled,
      health,
      successRate,
      avgLatencyMs: avgLatency,
      totalChecks: total,
      okCount,
      errorCount,
      slowCount,
      lastStatus: lastCheck?.status,
      lastCheckedAt: lastCheck?.checkedAt,
      lastError: lastCheck?.errorMessage,
    };
  });

  return NextResponse.json({ summary });
}
