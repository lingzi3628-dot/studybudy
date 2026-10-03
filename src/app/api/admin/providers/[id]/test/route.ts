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
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await requireAdminJwt();
  const { id } = await params;

  const rl = checkRateLimit(admin.adminId, admin.plan as any);
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
    return NextResponse.json({
      status: "error",
      httpStatus: 400,
      error: "Provider has no API key set. Edit the provider and add an API key.",
      hint: "Click 'Edit' on the provider and paste your API key (e.g. sk-... for OpenAI-compatible, sk-or-... for OpenRouter).",
    });
  }

  const apiKey = provider.apiKeyEncrypted ? decryptApiKey(provider.apiKeyEncrypted) : "";

  // Detect decryption failure — if API_KEY_ENCRYPTION_SECRET was changed,
  // the stored encrypted key can't be decrypted (returns empty string).
  if (!isKeyless && provider.apiKeyEncrypted && !apiKey) {
    return NextResponse.json({
      status: "error",
      httpStatus: 401,
      error: "API key decryption failed — the API_KEY_ENCRYPTION_SECRET env var has changed since this key was saved.",
      hint: "Re-enter the API key for this provider (Edit → paste key → Save). The key will be re-encrypted with the current secret.",
      providerName: provider.name,
    });
  }

  // Detect malformed API keys (e.g. OpenRouter keys start with "sk-or-", OpenAI with "sk-", DeepSeek with "sk-")
  if (!isKeyless && apiKey) {
    const expectedPrefix: Record<string, string> = {
      openai: "sk-",
      openrouter: "sk-or-",
      deepseek: "sk-",
      mistral: "mstrl_",
      groq: "gsk_",
      anthropic: "sk-ant-",
    };
    const expected = expectedPrefix[provider.providerType];
    if (expected && !apiKey.startsWith(expected)) {
      return NextResponse.json({
        status: "error",
        httpStatus: 401,
        error: `API key format mismatch — expected a key starting with "${expected}" but got "${apiKey.slice(0, 6)}..."`,
        hint: `Re-enter a valid ${provider.providerType} API key. Current key looks malformed or was encrypted with a different secret.`,
        providerName: provider.name,
      });
    }
  }

  const baseUrl = (provider.baseUrl || defaultBaseUrlForType(provider.providerType)).replace(/\/$/, "");
  const model = provider.model || defaultModelForType(provider.providerType);

  const body = await req.json().catch(() => ({}));
  const customPrompt = (body?.customPrompt ?? "").toString().trim();

  const testMessages = customPrompt
    ? [
        { role: "system" as const, content: "You are a helpful AI assistant. Reply concisely." },
        { role: "user" as const, content: customPrompt },
      ]
    : [
        { role: "system" as const, content: "You are a test endpoint. Reply with the single word 'ok'." },
        { role: "user" as const, content: "Reply with ok." },
      ];

  const start = Date.now();
  try {
    // Pollinations: keyless, GET request
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
        // Provide friendly error messages for common HTTP errors
        let friendlyError = txt.slice(0, 300);
        if (res.status === 429) {
          friendlyError = "Rate limited (429) — this provider's free tier limits requests per minute. Wait 60 seconds and try again. For unlimited use, upgrade the provider's plan or use Hugging Face (free, no rate limits).";
        } else if (res.status === 402) {
          friendlyError = "Payment required (402) — this provider needs more credits. Add credits at the provider's website, or use Hugging Face (free).";
        } else if (res.status === 401) {
          friendlyError = "Authentication failed (401) — the API key is invalid or expired. Re-enter the key.";
        }
        return NextResponse.json(
          { status: "error", httpStatus: res.status, error: friendlyError, rawError: txt.slice(0, 300), latencyMs },
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

    // Gemini: different URL + auth via query param (NOT Bearer)
    if (provider.providerType === "gemini") {
      const geminiUrl = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
      const geminiBody = {
        contents: [{ role: "user", parts: [{ text: "Reply with the single word 'ok'." }] }],
        systemInstruction: { parts: [{ text: "You are a test endpoint. Reply with the single word 'ok'." }] },
        generationConfig: { maxOutputTokens: 10, temperature: 0 },
      };
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        refundRateLimit(admin.adminId);
        // Provide friendly error messages for common HTTP errors
        let friendlyError = txt.slice(0, 300);
        if (res.status === 429) {
          friendlyError = "Rate limited (429) — this provider's free tier limits requests per minute. Wait 60 seconds and try again. For unlimited use, upgrade the provider's plan or use Hugging Face (free, no rate limits).";
        } else if (res.status === 402) {
          friendlyError = "Payment required (402) — this provider needs more credits. Add credits at the provider's website, or use Hugging Face (free).";
        } else if (res.status === 401) {
          friendlyError = "Authentication failed (401) — the API key is invalid or expired. Re-enter the key.";
        }
        return NextResponse.json(
          { status: "error", httpStatus: res.status, error: friendlyError, rawError: txt.slice(0, 300), latencyMs },
          { status: 200 }
        );
      }
      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
      return NextResponse.json({
        status: "success",
        reply: reply.slice(0, 50),
        model,
        latencyMs,
        usage: data?.usageMetadata,
      });
    }

    // Anthropic Claude: different URL + headers
    if (provider.providerType === "anthropic") {
      const anthropicUrl = `${baseUrl}/messages`;
      const res = await fetch(anthropicUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          system: "You are a test endpoint. Reply with the single word 'ok'.",
          messages: [{ role: "user", content: "Reply with ok." }],
        }),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        refundRateLimit(admin.adminId);
        // Provide friendly error messages for common HTTP errors
        let friendlyError = txt.slice(0, 300);
        if (res.status === 429) {
          friendlyError = "Rate limited (429) — this provider's free tier limits requests per minute. Wait 60 seconds and try again. For unlimited use, upgrade the provider's plan or use Hugging Face (free, no rate limits).";
        } else if (res.status === 402) {
          friendlyError = "Payment required (402) — this provider needs more credits. Add credits at the provider's website, or use Hugging Face (free).";
        } else if (res.status === 401) {
          friendlyError = "Authentication failed (401) — the API key is invalid or expired. Re-enter the key.";
        }
        return NextResponse.json(
          { status: "error", httpStatus: res.status, error: friendlyError, rawError: txt.slice(0, 300), latencyMs },
          { status: 200 }
        );
      }
      const data = await res.json();
      const reply = (data?.content?.map((c: any) => c.text).join("") ?? "").trim();
      return NextResponse.json({
        status: "success",
        reply: reply.slice(0, 50),
        model,
        latencyMs,
        usage: data?.usage,
      });
    }

    // Hugging Face: use the router endpoint (not /chat/completions)
    if (provider.providerType === "huggingface") {
      const hfBaseUrl = baseUrl.replace("/models", "").replace(/\/$/, "");
      const hfRes = await fetch(`${hfBaseUrl}/router/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: testMessages,
          max_tokens: 10,
          temperature: 0,
        }),
      });
      const latencyMs = Date.now() - start;
      if (!hfRes.ok) {
        const txt = await hfRes.text().catch(() => "");
        let friendlyError = txt.slice(0, 300);
        if (hfRes.status === 429) {
          friendlyError = "Rate limited — Hugging Face free tier limits requests. Wait 30 seconds and try again.";
        } else if (hfRes.status === 503) {
          friendlyError = "Model is loading (503) — Hugging Face needs to warm up the model. Wait 20 seconds and try again.";
        } else if (hfRes.status === 401) {
          friendlyError = "Authentication failed — the HF API key is invalid or expired.";
        }
        return NextResponse.json(
          { status: "error", httpStatus: hfRes.status, error: friendlyError, rawError: txt.slice(0, 300), latencyMs },
          { status: 200 }
        );
      }
      const hfData = await hfRes.json();
      const hfReply: string = hfData?.choices?.[0]?.message?.content ?? "";
      return NextResponse.json({
        status: "success",
        reply: hfReply.slice(0, 50),
        model,
        latencyMs,
        usage: hfData?.usage,
      });
    }

    // Standard OpenAI-compatible providers
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

// ============================================================
// Helper: default base URL + model per provider type
// ============================================================

function defaultBaseUrlForType(providerType: string): string {
  const defaults: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    deepseek: "https://api.deepseek.com/v1",
    mistral: "https://api.mistral.ai/v1",
    groq: "https://api.groq.com/openai/v1",
    anthropic: "https://api.anthropic.com/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta",
    huggingface: "https://api-inference.huggingface.co",
    pollinations: "https://text.pollinations.ai",
    together: "https://api.together.xyz/v1",
    ollama: "http://localhost:11434/v1",
    glm: "https://open.bigmodel.cn/api/paas/v4",
  };
  return defaults[providerType] ?? "https://api.openai.com/v1";
}

function defaultModelForType(providerType: string): string {
  const defaults: Record<string, string> = {
    openai: "gpt-4o-mini",
    openrouter: "openai/gpt-4o-mini",
    deepseek: "deepseek-chat",
    mistral: "mistral-small-latest",
    groq: "llama-3.3-70b-versatile",
    anthropic: "claude-3-5-sonnet-20241022",
    gemini: "gemini-1.5-flash",
    huggingface: "meta-llama/Llama-3.1-8B-Instruct",
    pollinations: "openai",
    together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    ollama: "llama3.2",
    glm: "glm-4-flash",
  };
  return defaults[providerType] ?? "gpt-4o-mini";
}
