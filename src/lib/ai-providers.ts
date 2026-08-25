/**
 * AI provider management — load admin-configured providers,
 * call them in priority order, log every call to ai_call_logs.
 */
import { db } from "./db";
import { decryptApiKey } from "./crypto";
import type { ChatMessage } from "./ai";

export type ProviderRow = {
  id: string;
  name: string;
  providerType: string;
  enabled: boolean;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number;
  costPer1kTokens: number;
  isDefault: boolean;
  priority: number;
  apiKeyEncrypted: string | null;
};

export type ProviderCallResult = {
  content: string;
  providerId: string | null;
  providerType: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number;
  status: "success" | "error";
  errorMessage: string | null;
};

/** Load all enabled providers, ordered by priority (then is_default desc).
 *  Phase 22g: Pollinations providers don't need an API key — include them
 *  even if apiKeyEncrypted is null. */
export async function loadEnabledProviders(): Promise<ProviderRow[]> {
  return db.aiProvider.findMany({
    where: {
      enabled: true,
      OR: [
        { apiKeyEncrypted: { not: null } },
        { providerType: "pollinations" },
      ],
    },
    orderBy: [{ priority: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  }) as Promise<ProviderRow[]>;
}

/** Export callProvider so it can be called directly for model-specific routing. */
export async function callProvider(
  provider: ProviderRow,
  messages: ChatMessage[],
  opts?: { userId?: string; route?: string }
): Promise<ProviderCallResult> {
  const apiKey = provider.apiKeyEncrypted
    ? decryptApiKey(provider.apiKeyEncrypted)
    : "";

  // Phase 22g: Pollinations is keyless — allow it without an API key
  if (!apiKey && provider.providerType !== "pollinations") {
    return {
      content: "",
      providerId: provider.id,
      providerType: provider.providerType,
      model: provider.model,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cost: 0,
      status: "error",
      errorMessage: "Provider has no API key set",
    };
  }

  const baseUrl = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = provider.model || "gpt-4o-mini";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: provider.maxTokens,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        content: "",
        providerId: provider.id,
        providerType: provider.providerType,
        model,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cost: 0,
        status: "error",
        errorMessage: `HTTP ${res.status}: ${txt.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    const content: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";
    const usage = data?.usage;
    const promptTokens = usage?.prompt_tokens ?? null;
    const completionTokens = usage?.completion_tokens ?? null;
    const totalTokens = usage?.total_tokens ?? null;
    const cost = totalTokens ? (totalTokens / 1000) * provider.costPer1kTokens : 0;

    return {
      content,
      providerId: provider.id,
      providerType: provider.providerType,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
      status: content ? "success" : "error",
      errorMessage: content ? null : "Empty response from provider",
    };
  } catch (e: any) {
    return {
      content: "",
      providerId: provider.id,
      providerType: provider.providerType,
      model,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cost: 0,
      status: "error",
      errorMessage: e?.message ?? String(e),
    };
  }
}

/**
 * Try each enabled provider in priority order until one succeeds.
 * Returns the content + the result of the winning call.
 * Logs every attempt (success or failure) to ai_call_logs.
 */
export async function callWithProviders(
  messages: ChatMessage[],
  ctx: { userId: string; route?: string }
): Promise<{ content: string; result: ProviderCallResult | null }> {
  const providers = await loadEnabledProviders();

  if (providers.length === 0) {
    return { content: "", result: null };
  }

  for (const provider of providers) {
    const result = await callProvider(provider, messages, { userId: ctx.userId, route: ctx.route });
    // log this attempt
    await logAiCall(ctx.userId, result, ctx.route);

    if (result.status === "success" && result.content) {
      return { content: result.content, result };
    }
    // else try the next provider
  }

  // all providers failed
  return { content: "", result: null };
}

/** Insert a row into ai_call_logs. */
export async function logAiCall(
  userId: string,
  result: ProviderCallResult,
  route?: string
): Promise<void> {
  try {
    await db.aiCallLog.create({
      data: {
        userId,
        providerId: result.providerId,
        providerType: result.providerType,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        cost: result.cost,
        status: result.status,
        errorMessage: result.errorMessage,
        route,
      },
    });
  } catch (e) {
    console.warn("Failed to log AI call", e);
  }
}
