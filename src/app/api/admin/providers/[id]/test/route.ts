import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/providers/[id]/test
 *
 * Sends a tiny test prompt to the provider to verify the API key works.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const admin = await requireAdminJwt();
  const { id } = await params;

  const rl = checkRateLimit(admin.adminId, admin.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily test limit reached", limit: rl.limit, resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const provider = await db.aiProvider.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  // Pollinations and other keyless providers don't need an API key
  const isKeyless = provider.providerType === "pollinations";
  if (!provider.apiKeyEncrypted && !isKeyless) {
    return NextResponse.json({ error: "Provider has no API key set" }, { status: 400 });
  }

  const apiKey = provider.apiKeyEncrypted ? decryptApiKey(provider.apiKeyEncrypted) : "";
  const baseUrl = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = provider.model || "gpt-4o-mini";

  const testMessages = [
    { role: "system" as const, content: "You are a test endpoint. Reply with the single word 'ok'." },
    { role: "user" as const, content: "Reply with ok." },
  ];

  const start = Date.now();
  try {
    // Pollinations uses a different API format — GET request with prompt as query param
    if (isKeyless) {
      const prompt = encodeURIComponent("Reply with the single word 'ok'.");
      const pollinationsUrl = `${baseUrl}/openai?model=${model}&messages=${JSON.stringify(testMessages)}`;
      const res = await fetch(pollinationsUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        refundRateLimit(admin.adminId);
        return NextResponse.json(
          { status: "error", httpStatus: res.status, error: txt.slice(0, 300), latencyMs },
          { status: 200 }
        );
      }
      const text = await res.text();
      return NextResponse.json({
        status: "success",
        reply: text.slice(0, 50),
        model,
        latencyMs,
      });
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider.providerType === "openrouter" ? {
          "HTTP-Referer": "https://studybuddy.ai",
          "X-Title": "StudyBuddy AI",
        } : {}),
      },
      body: JSON.stringify({
        model,
        messages: testMessages,
        max_tokens: 10,
        temperature: 0,
      }),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      refundRateLimit(admin.adminId);
      await logAdminActionViaJwt(admin, "provider.test", { providerId: id, status: "error", httpStatus: res.status });
      return NextResponse.json(
        { status: "error", httpStatus: res.status, error: txt.slice(0, 300), latencyMs },
        { status: 200 }
      );
    }

    const data = await res.json();
    const reply: string = data?.choices?.[0]?.message?.content ?? "";
    const usage = data?.usage;

    await logAdminActionViaJwt(admin, "provider.test", {
      providerId: id,
      status: "success",
      model,
      reply: reply.slice(0, 50),
      tokens: usage?.total_tokens,
      latencyMs,
    });

    return NextResponse.json({
      status: "success",
      reply,
      model,
      latencyMs,
      usage,
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(admin.adminId);
    await logAdminActionViaJwt(admin, "provider.test", {
      providerId: id,
      status: "error",
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { status: "error", error: e?.message ?? String(e), latencyMs: Date.now() - start },
      { status: 200 }
    );
  }
}
