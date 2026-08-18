/**
 * AI helper — unified entrypoint for all AI calls in the app.
 *
 * Resolution order:
 *   1. BYOK (if user has encrypted_api_key set → call OpenAI-compatible endpoint with their key)
 *   2. Admin-configured providers (load from ai_providers table, try each in priority order)
 *   3. Platform AI fallback (z-ai-web-dev-sdk, no key needed in sandbox)
 *
 * Every call is logged to ai_call_logs (provider, model, tokens, cost, status).
 * Token deduction is handled by the caller via deductTokens() from monetization.ts.
 */
import ZAI from "z-ai-web-dev-sdk";
import { db } from "./db";
import { decryptApiKey } from "./crypto";
import { callWithProviders, logAiCall } from "./ai-providers";
import { checkModelPermission, deductTokens } from "./monetization";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

/**
 * Call the platform AI (z-ai-web-dev-sdk / GLM) — sandbox fallback.
 * Logs to ai_call_logs with providerType='glm'.
 */
async function callPlatformAI(
  messages: ChatMessage[],
  ctx: { userId: string; route?: string }
): Promise<string> {
  let content = "";
  let errorMessage: string | null = null;
  try {
    const client = await ZAI.create();
    const completion = await client.chat.completions.create({
      messages,
    } as any);
    content =
      completion?.choices?.[0]?.message?.content ??
      completion?.choices?.[0]?.delta?.content ??
      "";
    if (!content) errorMessage = "Empty response from platform AI";
  } catch (e: any) {
    errorMessage = e?.message ?? String(e);
  }

  // log the call (best-effort)
  await logAiCall(ctx.userId, {
    content,
    providerId: null,
    providerType: "glm",
    model: "glm-default",
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    cost: 0,
    status: content ? "success" : "error",
    errorMessage,
  }, ctx.route);

  if (!content) {
    throw new Error(errorMessage ?? "Platform AI returned empty response");
  }
  return content;
}

/**
 * Call an OpenAI-compatible endpoint with the user's BYOK key.
 * Logs to ai_call_logs with providerType='byok'.
 */
async function callBYOKAI(
  messages: ChatMessage[],
  apiKey: string,
  opts: { baseUrl?: string; model?: string; userId: string; route?: string }
): Promise<string> {
  const baseUrl = (opts.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = opts.model || "gpt-4o-mini";
  let content = "";
  let errorMessage: string | null = null;
  let usage: any = null;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.7 }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      errorMessage = `HTTP ${res.status}: ${txt.slice(0, 200)}`;
    } else {
      const data = await res.json();
      content = data?.choices?.[0]?.message?.content ?? "";
      usage = data?.usage;
      if (!content) errorMessage = "Empty response from BYOK AI";
    }
  } catch (e: any) {
    errorMessage = e?.message ?? String(e);
  }

  // log the call
  await logAiCall(opts.userId, {
    content,
    providerId: null,
    providerType: "byok",
    model,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    cost: 0,
    status: content ? "success" : "error",
    errorMessage,
  }, opts.route);

  if (!content) {
    throw new Error(errorMessage ?? "BYOK AI returned empty response");
  }
  return content;
}

/**
 * Unified entrypoint.
 *
 * 1. Check model permission + token balance (if userId provided)
 * 2. If userApiKey is provided (BYOK), use it via OpenAI-compatible fetch.
 * 3. Else try admin-configured providers in priority order.
 * 4. Else fall back to z-ai-web-dev-sdk (platform).
 * 5. Deduct tokens after successful call (if userId provided)
 */
export async function callAI(
  messages: ChatMessage[],
  userApiKey?: string | null,
  ctx?: { userId?: string; route?: string }
): Promise<string> {
  const userId = ctx?.userId ?? "system";
  const route = ctx?.route;

  // Check model permission + token balance (skip for "system" sentinel)
  if (userId !== "system") {
    const perm = await checkModelPermission(userId).catch(() => ({ allowed: true, reason: null }));
    if (!perm.allowed) {
      throw new Error(perm.reason ?? "Not enough tokens. Upgrade your plan.");
    }
  }

  // 1) BYOK
  if (userApiKey && userApiKey.trim()) {
    try {
      const content = await callBYOKAI(messages, userApiKey.trim(), {
        userId,
        route,
      });
      // Deduct tokens (BYOK users still consume tokens for model tier)
      if (userId !== "system") {
        await deductTokens(userId, Math.ceil(messages.reduce((s, m) => s + m.content.length / 4, 0)), "byok", route?.replace("/api/", "") ?? "unknown").catch(() => {});
      }
      return content;
    } catch (e) {
      console.warn("BYOK call failed, falling back to admin providers:", e?.message ?? e);
    }
  }

  // 2) Admin-configured providers
  try {
    const r = await callWithProviders(messages, { userId, route });
    if (r.content) {
      // Deduct tokens based on actual usage
      if (userId !== "system") {
        const tokensUsed = r.result?.totalTokens ?? Math.ceil(messages.reduce((s, m) => s + m.content.length / 4, 0));
        await deductTokens(userId, tokensUsed, "admin_provider", route?.replace("/api/", "") ?? "unknown").catch(() => {});
      }
      return r.content;
    }
  } catch (e) {
    console.warn("Admin provider call failed:", e?.message ?? e);
  }

  // 3) Platform fallback
  const content = await callPlatformAI(messages, { userId, route });
  // Deduct tokens for platform calls too
  if (userId !== "system") {
    await deductTokens(userId, Math.ceil(messages.reduce((s, m) => s + m.content.length / 4, 0)), "glm", route?.replace("/api/", "") ?? "unknown").catch(() => {});
  }
  return content;
}

/**
 * Ask the model for JSON only. Strips ```json fences and parses.
 */
export async function callAIJson<T = unknown>(
  messages: ChatMessage[],
  userApiKey?: string | null,
  ctx?: { userId?: string; route?: string }
): Promise<T> {
  const raw = await callAI(messages, userApiKey, ctx);
  return parseJsonLoose<T>(raw);
}

/** Strip code fences and parse. Throws on invalid JSON. */
export function parseJsonLoose<T = unknown>(raw: string): T {
  let s = raw.trim();
  // strip ```json ... ``` or ``` ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // strip leading non-{ or non-[ chars
  const firstObj = s.search(/[{[]/);
  if (firstObj > 0) s = s.slice(firstObj);
  const lastObj = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastObj >= 0) s = s.slice(0, lastObj + 1);
  return JSON.parse(s) as T;
}

// Backwards-compat exports (callers may import callPlatformAI and callBYOKAI directly)
export { callPlatformAI, callBYOKAI };
