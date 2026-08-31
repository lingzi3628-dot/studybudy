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

  // 1.5) Phase 22g + Phase 36 — Model-specific provider
  // If the user has a currentModel set (e.g. "study_buddy_pro"), look up
  // the ModelMapping to find the linked providerId + modelIdentifier.
  // This makes switching StudyBuddies actually change which AI model is used.
  //
  // IMPORTANT: If the ModelMapping exists but has NO providerId (the buddy is
  // disconnected from any API in the Visual API Studio), we STOP here and
  // throw an error — we do NOT silently fall through to the platform AI.
  // This ensures the user knows their selected buddy isn't connected, rather
  // than getting a reply from a random default provider.
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

        if (mapping && !mapping.providerId) {
          // The buddy exists but is NOT connected to any API.
          // Don't fall through to platform AI — tell the user to connect it.
          throw new Error(
            `🥲 ${mapping.displayName} ${mapping.emoji} is not connected to an API yet. ` +
            `Ask an admin to connect it in the AI Studio (Admin → AI Providers), ` +
            `or switch to a different Study Buddy in the Profile menu.`
          );
        }

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
                // Provider returned empty — this is a real failure, don't silently fall through
                throw new Error(
                  `${mapping.displayName} ${mapping.emoji} connected to ${provider.name} but got an empty response. ` +
                  `The API may be down or misconfigured. Try another Study Buddy.`
                );
              } catch (e: any) {
                // If it's our custom error (disconnected or empty response), re-throw it
                if (e?.message?.includes("not connected") || e?.message?.includes("empty response")) {
                  throw e;
                }
                // Provider call failed (network, auth, etc.) — don't silently fall through
                console.warn("Model-specific provider failed:", e?.message);
                throw new Error(
                  `${mapping.displayName} ${mapping.emoji} → ${provider.name} API call failed: ${e?.message ?? "unknown error"}. ` +
                  `Try another Study Buddy or ask an admin to check the API key.`
                );
              }
            } else {
              // Provider has no API key and is not keyless
              throw new Error(
                `${mapping.displayName} ${mapping.emoji} is connected to ${provider.name} but that API has no key set. ` +
                `Ask an admin to add an API key in the AI Studio.`
              );
            }
          } else if (provider && !provider.enabled) {
            // Provider is disabled
            throw new Error(
              `${mapping.displayName} ${mapping.emoji} is connected to ${provider.name} but that API is disabled. ` +
              `Ask an admin to enable it in the AI Studio.`
            );
          }
        }
      }
    } catch (e: any) {
      // Re-throw our custom "not connected" / "empty response" / "disabled" errors
      if (e?.message?.includes("not connected") || e?.message?.includes("empty response") || e?.message?.includes("API has no key") || e?.message?.includes("API is disabled") || e?.message?.includes("API call failed")) {
        throw e;
      }
      // Other errors (DB lookup failed, etc.) — fall through to default resolution
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

// ============================================================
// Phase 52 — Streaming AI support
// ============================================================

/**
 * Parse an OpenAI-compatible SSE body (ReadableStream) and yield text deltas.
 * Handles `data: {...}` lines with choices[0].delta.content, stops on [DONE].
 */
async function* parseOpenAIStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by \n\n
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta =
              json?.choices?.[0]?.delta?.content ??
              json?.choices?.[0]?.message?.content ??
              "";
            if (delta) yield delta as string;
          } catch {
            // ignore malformed chunks (keepalives etc.)
          }
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/**
 * Stream an OpenAI-compatible endpoint via fetch (used for BYOK).
 * Yields text deltas. Returns via generator — usage logging is the caller's job
 * (best-effort log happens inside this function on completion).
 */
async function* streamBYOKAI(
  messages: ChatMessage[],
  apiKey: string,
  opts: { baseUrl?: string; model?: string; userId: string; route?: string }
): AsyncGenerator<string> {
  const baseUrl = (opts.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = opts.model || "gpt-4o-mini";
  let full = "";
  let errorMessage: string | null = null;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.7, stream: true }),
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      errorMessage = `HTTP ${res.status}: ${txt.slice(0, 200)}`;
    } else {
      for await (const delta of parseOpenAIStream(res.body as any)) {
        full += delta;
        yield delta;
      }
      if (!full) errorMessage = "Empty stream from BYOK AI";
    }
  } catch (e: any) {
    errorMessage = e?.message ?? String(e);
  }

  // log the call (best-effort, mirrors callBYOKAI)
  try {
    await logAiCall(opts.userId, {
      content: full,
      providerId: null,
      providerType: "byok",
      model,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cost: 0,
      status: full ? "success" : "error",
      errorMessage,
    }, opts.route);
  } catch {}

  if (!full && errorMessage) {
    throw new Error(errorMessage);
  }
}

/**
 * Streaming entrypoint — mirrors callAI()'s resolution order:
 *   1. BYOK (streamed via OpenAI-compatible fetch)
 *   2. Model mapping / admin providers (non-streamed — yielded as one chunk)
 *   3. Platform fallback (GLM SDK, streamed via stream:true)
 *
 * Yields text deltas in order. The full reply === concat of all yielded deltas
 * EXCEPT when a non-streaming fallback path throws — then the error propagates.
 */
export async function* streamAI(
  messages: ChatMessage[],
  userApiKey: string | null | undefined,
  ctx?: CallAIContext
): AsyncGenerator<string> {
  const userId = ctx?.userId ?? "system";
  const route = ctx?.route;

  // 1) BYOK — true streaming
  if (userApiKey && userApiKey.trim()) {
    let streamed = false;
    try {
      for await (const delta of streamBYOKAI(messages, userApiKey.trim(), { userId, route })) {
        streamed = true;
        yield delta;
      }
      if (streamed) return;
    } catch (e: any) {
      console.warn("BYOK stream failed, falling back:", e?.message ?? e);
      // If nothing was yielded yet, fall through to default resolution.
      if (streamed) return;
    }
  }

  // 2 + 3) Model mapping / admin providers / platform.
  // Only the platform GLM path supports true streaming today; the rest
  // resolve via callAI() and are yielded as a single chunk (client renders
  // progressively anyway).
  let content = "";
  try {
    content = await callAI(messages, null, ctx);
  } catch (e: any) {
    throw e;
  }
  if (content) yield content;
}

/**
 * Stream from the platform GLM SDK directly (stream:true → raw SSE body).
 * Used by the tutor chat stream route for the fast free-model path.
 * Throws if the platform stream fails — caller decides fallback.
 */
export async function* streamPlatformAI(
  messages: ChatMessage[],
  ctx?: CallAIContext
): AsyncGenerator<string> {
  const userId = ctx?.userId ?? "system";
  const route = ctx?.route;
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const client = await ZAI.create();
  const body: any = await client.chat.completions.create({
    messages,
    stream: true,
  } as any);

  // SDK returns the raw ReadableStream when the response is an SSE stream.
  if (!body || typeof (body as any).getReader !== "function") {
    // Non-stream response (JSON) — extract and yield once.
    const content =
      body?.choices?.[0]?.message?.content ??
      body?.choices?.[0]?.delta?.content ??
      "";
    if (!content) throw new Error("Platform AI returned empty response");
    yield content;
  } else {
    let full = "";
    for await (const delta of parseOpenAIStream(body as any)) {
      full += delta;
      yield delta;
    }
    // log (best-effort)
    try {
      await logAiCall(userId, {
        content: full,
        providerId: null,
        providerType: "glm",
        model: "glm-default",
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cost: 0,
        status: full ? "success" : "error",
        errorMessage: full ? null : "Empty stream from platform AI",
      }, route);
    } catch {}
    if (!full) throw new Error("Empty stream from platform AI");
  }
}
