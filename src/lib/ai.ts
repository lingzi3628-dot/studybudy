/**
 * AI helper — unified entrypoint for all AI calls in the app.
 *
 * Resolution order:
 *   1. BYOK (if user has encrypted_api_key set → call OpenAI-compatible endpoint with their key)
 *   2. Admin-configured providers (load from ai_providers table, try each in priority order)
 *   3. Platform AI fallback (z-ai-web-dev-sdk, no key needed in sandbox)
 *
 * Every call is logged to ai_call_logs (provider, model, tokens, cost, status).
 *
 * IMPORTANT — Token deduction is owned by the calling route via
 * checkAndDeductTokens() from monetization.ts. By default callAI() will NOT
 * re-check permissions or deduct tokens again, because that would
 * double-charge users. Pass { alreadyCharged: false } only for system-level
 * calls (no userId or unmonetized route).
 */
import ZAI from "z-ai-web-dev-sdk";
import { db } from "./db";
import { decryptApiKey } from "./crypto";
import { callWithProviders, logAiCall } from "./ai-providers";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type CallAIContext = {
  userId?: string;
  route?: string;
  /** Set to true (default) when the caller has already invoked
   * checkAndDeductTokens() and we should skip the second deduction here.
   * Set to false ONLY for unmonetized/system routes. */
  alreadyCharged?: boolean;
};

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
    // Phase 25 — add timeout to prevent 504 on Vercel (10s max for serverless)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI request timed out (10s)")), 10000)
    );
    const completion = await Promise.race([
      client.chat.completions.create({ messages } as any),
      timeoutPromise,
    ]);
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
 * Token deduction is owned by the CALLING ROUTE via checkAndDeductTokens().
 * This function intentionally does NOT deduct tokens or re-check permission,
 * because doing so would double-charge users (the route already charged them
 * before invoking us).
 *
 * 1. If userApiKey is provided (BYOK), use it via OpenAI-compatible fetch.
 * 2. Else try admin-configured providers in priority order.
 * 3. Else fall back to z-ai-web-dev-sdk (platform).
 */
export async function callAI(
  messages: ChatMessage[],
  userApiKey?: string | null,
  ctx?: CallAIContext
): Promise<string> {
  const userId = ctx?.userId ?? "system";
  const route = ctx?.route;

  // 1) BYOK
  if (userApiKey && userApiKey.trim()) {
    try {
      const content = await callBYOKAI(messages, userApiKey.trim(), {
        userId,
        route,
      });
      return content;
    } catch (e: any) {
      console.warn("BYOK call failed, falling back to model-specific provider:", e?.message ?? e);
    }
  }

  // 1.5) Phase 22g — Model-specific provider
  // If the user has a currentModel set (e.g. "study_buddy_pro"), look up
  // the ModelMapping to find the linked providerId + modelIdentifier.
  // This makes switching StudyBuddies actually change which AI model is used.
  if (userId && userId !== "system") {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { currentModel: true },
      });
      if (user?.currentModel && user.currentModel !== "study_buddy_free") {
        const mapping = await db.modelMapping.findUnique({
          where: { modelName: user.currentModel },
        });
        if (mapping?.providerId) {
          // Load the specific provider
          const provider = await db.aiProvider.findUnique({
            where: { id: mapping.providerId },
          });
          if (provider && provider.enabled) {
            const apiKey = provider.apiKeyEncrypted
              ? decryptApiKey(provider.apiKeyEncrypted)
              : "";
            // Allow keyless providers (e.g. Pollinations)
            if (apiKey || provider.providerType === "pollinations") {
              try {
                const { callProvider } = await import("./ai-providers");
                const result = await callProvider(provider as any, messages, {
                  userId,
                  route,
                });
                if (result.content) {
                  return result.content;
                }
                console.warn("Model-specific provider returned empty, falling through");
              } catch (e: any) {
                console.warn("Model-specific provider failed, falling through:", e?.message);
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn("Model lookup failed, using default resolution:", e?.message);
    }
  }

  // 2) Admin-configured providers (default: try all enabled providers in priority order)
  try {
    const r = await callWithProviders(messages, { userId, route });
    if (r.content) {
      return r.content;
    }
  } catch (e: any) {
    console.warn("Admin provider call failed:", e?.message ?? e);
  }

  // 3) Platform fallback
  const content = await callPlatformAI(messages, { userId, route });
  return content;
}

/**
 * Ask the model for JSON only. Strips ```json fences and parses.
 */
export async function callAIJson<T = unknown>(
  messages: ChatMessage[],
  userApiKey?: string | null,
  ctx?: CallAIContext
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
