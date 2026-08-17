/**
 * AI helper.
 *
 * - Platform calls: use z-ai-web-dev-sdk (GLM, no key needed in sandbox).
 * - BYOK: when the user has set an encrypted_api_key, use OpenAI-compatible
 *   chat/completions endpoint with their key.
 *
 * Both paths return the same shape: the raw content string from the model.
 */
import ZAI from "z-ai-web-dev-sdk";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

/**
 * Call the platform AI (z-ai-web-dev-sdk / GLM).
 * Returns the assistant's message content as a string.
 */
export async function callPlatformAI(messages: ChatMessage[]): Promise<string> {
  const client = await ZAI.create();
  const completion = await client.chat.completions.create({
    messages,
    // let the SDK choose the default model
  } as any);
  // OpenAI-compatible response shape
  const content: string =
    completion?.choices?.[0]?.message?.content ??
    completion?.choices?.[0]?.delta?.content ??
    "";
  if (!content) throw new Error("AI returned an empty response");
  return content;
}

/**
 * Call an OpenAI-compatible endpoint with the user's BYOK key.
 */
export async function callBYOKAI(
  messages: ChatMessage[],
  apiKey: string,
  opts: { baseUrl?: string; model?: string } = {}
): Promise<string> {
  const baseUrl = (opts.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = opts.model || "gpt-4o-mini";
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
    throw new Error(`BYOK AI call failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("BYOK AI returned an empty response");
  return content;
}

/**
 * Unified entrypoint. If userApiKey is provided, use BYOK path.
 * Otherwise fall back to platform AI.
 */
export async function callAI(
  messages: ChatMessage[],
  userApiKey?: string | null
): Promise<string> {
  if (userApiKey && userApiKey.trim()) {
    return callBYOKAI(messages, userApiKey.trim());
  }
  return callPlatformAI(messages);
}

/**
 * Ask the model for JSON only. Strips ```json fences and parses.
 */
export async function callAIJson<T = unknown>(
  messages: ChatMessage[],
  userApiKey?: string | null
): Promise<T> {
  const raw = await callAI(messages, userApiKey);
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
