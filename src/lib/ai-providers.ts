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
  apiKeysEncrypted: any; // Json — array of encrypted keys for rotation
  apiKeyRotationIndex: number;
  dailyBudgetUsd: number | null;
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

/** Export callProvider so it can be called directly for model-specific routing.
 *  Phase 35: API key rotation — cycles through apiKeysEncrypted array when one
 *  hits a 429 rate-limit error. If no rotation keys, falls back to the single
 *  apiKeyEncrypted.
 */
export async function callProvider(
  provider: ProviderRow,
  messages: ChatMessage[],
  opts?: { userId?: string; route?: string }
): Promise<ProviderCallResult> {
  // Build the list of API keys to try (rotation)
  const rotationKeys: string[] = [];
  if (Array.isArray(provider.apiKeysEncrypted) && provider.apiKeysEncrypted.length > 0) {
    for (const enc of provider.apiKeysEncrypted) {
      if (typeof enc === "string" && enc) {
        const dec = decryptApiKey(enc);
        if (dec) rotationKeys.push(dec);
      }
    }
  }
  // Always include the primary key as a fallback
  if (provider.apiKeyEncrypted) {
    const primary = decryptApiKey(provider.apiKeyEncrypted);
    if (primary && !rotationKeys.includes(primary)) {
      rotationKeys.unshift(primary);
    }
  }
  // Start at the rotation index
  const startIdx = Math.min(provider.apiKeyRotationIndex ?? 0, Math.max(rotationKeys.length - 1, 0));

  // Pollinations is keyless — allow it without an API key
  if (rotationKeys.length === 0 && provider.providerType !== "pollinations") {
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

  // Try each key in the rotation, starting at startIdx.
  // On 429 (rate limit), advance to the next key.
  for (let attempt = 0; attempt < Math.max(rotationKeys.length, 1); attempt++) {
    const keyIdx = (startIdx + attempt) % Math.max(rotationKeys.length, 1);
    const apiKey = rotationKeys[keyIdx] ?? "";

    try {
      // Pollinations uses a different API format — GET request
      let res: Response;
      if (provider.providerType === "pollinations") {
        const url = `${baseUrl}/openai?model=${model}&messages=${encodeURIComponent(JSON.stringify(messages))}`;
        res = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        res = await fetch(`${baseUrl}/chat/completions`, {
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
            messages,
            max_tokens: provider.maxTokens,
            temperature: 0.7,
          }),
        });
      }

      if (res.status === 429 && rotationKeys.length > 1) {
        // Rate-limited on this key — try the next one in the rotation
        // Persist the new rotation index so we don't keep hitting the same bad key
        try {
          await db.aiProvider.update({
            where: { id: provider.id },
            data: { apiKeyRotationIndex: (keyIdx + 1) % rotationKeys.length },
          });
        } catch {}
        continue; // try next key
      }

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

      const data = provider.providerType === "pollinations"
        ? { choices: [{ message: { content: await res.text() } }] }
        : await res.json();
      const content: string =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.delta?.content ??
        "";
      const usage = data?.usage;
      const promptTokens = usage?.prompt_tokens ?? null;
      const completionTokens = usage?.completion_tokens ?? null;
      const totalTokens = usage?.total_tokens ?? null;
      const cost = totalTokens ? (totalTokens / 1000) * provider.costPer1kTokens : 0;

      // Persist the working rotation index so future calls start with the good key
      if (rotationKeys.length > 1 && keyIdx !== startIdx) {
        try {
          await db.aiProvider.update({
            where: { id: provider.id },
            data: { apiKeyRotationIndex: keyIdx },
          });
        } catch {}
      }

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
      // Network error — try next key if available
      if (attempt < rotationKeys.length - 1) continue;
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

  // All keys exhausted
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
    errorMessage: "All API keys exhausted (rate-limited or errored)",
  };
}

/**
 * Check if a provider has exceeded its daily budget.
 * Returns true if the provider is over budget (should be skipped).
 * Phase 35: cost tracking + budget caps.
 */
async function isOverBudget(provider: ProviderRow): Promise<boolean> {
  if (!provider.dailyBudgetUsd || provider.dailyBudgetUsd <= 0) return false;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const logs = await db.aiCallLog.aggregate({
    _sum: { cost: true },
    where: {
      providerId: provider.id,
      createdAt: { gt: startOfDay },
      status: "success",
    },
  });
  const spentToday = logs._sum.cost ?? 0;
  return spentToday >= provider.dailyBudgetUsd;
}

/**
 * Try each enabled provider in priority order until one succeeds.
 * Returns the content + the result of the winning call.
 * Logs every attempt (success or failure) to ai_call_logs.
 *
 * Phase 35: budget-aware fallback chain — providers over their daily budget
 * are skipped automatically, falling through to the next provider in priority
 * order. This implements automatic fallback without manual configuration.
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
    // Phase 35: skip providers over their daily budget
    if (provider.dailyBudgetUsd && provider.dailyBudgetUsd > 0) {
      const overBudget = await isOverBudget(provider);
      if (overBudget) {
        // Log the skip for transparency
        await logAiCall(ctx.userId, {
          content: "",
          providerId: provider.id,
          providerType: provider.providerType,
          model: provider.model,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          cost: 0,
          status: "error",
          errorMessage: `Skipped — daily budget of $${provider.dailyBudgetUsd} reached`,
        }, ctx.route);
        continue; // try the next provider in the fallback chain
      }
    }

    const result = await callProvider(provider, messages, { userId: ctx.userId, route: ctx.route });
    // log this attempt
    await logAiCall(ctx.userId, result, ctx.route);

    if (result.status === "success" && result.content) {
      return { content: result.content, result };
    }
    // else try the next provider (fallback)
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
