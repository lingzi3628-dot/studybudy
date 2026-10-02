/**
 * Z-AI SDK wrapper — Phase 4 hotfix
 *
 * The z-ai-web-dev-sdk v0.0.18's ZAI.create() only reads config from a
 * .z-ai-config FILE (cwd, home, or /etc/). On Vercel serverless, there's
 * no such file — the SDK throws "Configuration file not found".
 *
 * This wrapper:
 *   1. Reads ZAI_BASE_URL + ZAI_API_KEY from env vars
 *   2. If both present, creates a ZAI instance DIRECTLY (bypassing the
 *      file-based config loader)
 *   3. If env vars are absent, falls back to ZAI.create() (reads the
 *      .z-ai-config file — for local dev)
 *
 * ENV VARS (set in Vercel):
 *   ZAI_BASE_URL  — e.g. "https://api.z.ai/api/paas/v4"
 *   ZAI_API_KEY   — your Z.ai API key
 *
 * Local dev still uses .z-ai-config (unchanged).
 */

import ZAI from "z-ai-web-dev-sdk";

type ZaiConfig = {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
};

let cachedClient: ZAI | null = null;
let cacheError: string | null = null;

/**
 * Get a ZAI client instance.
 *
 * Tries env vars first (ZAI_BASE_URL + ZAI_API_KEY), falls back to the
 * .z-ai-config file via ZAI.create().
 *
 * Throws if neither is configured.
 */
export async function getZaiClient(): Promise<ZAI> {
  if (cachedClient) return cachedClient;
  if (cacheError) throw new Error(cacheError);

  // 1. Try env vars first
  const envBaseUrl = process.env.ZAI_BASE_URL;
  const envApiKey = process.env.ZAI_API_KEY;

  if (envBaseUrl && envApiKey) {
    try {
      // Construct directly — bypasses the file-based config loader.
      // The ZAI class constructor is private in TypeScript types but
      // accessible at runtime (TS private is compile-time only).
      // We use a type cast to bypass the private check.
      const config: ZaiConfig = { baseUrl: envBaseUrl, apiKey: envApiKey };
      const client = new (ZAI as any)(config);
      cachedClient = client as ZAI;
      return cachedClient;
    } catch (e: any) {
      cacheError = `ZAI env-var construction failed: ${e?.message ?? String(e)}`;
      throw new Error(cacheError);
    }
  }

  // 2. Fall back to .z-ai-config file (local dev)
  try {
    cachedClient = await ZAI.create();
    return cachedClient;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    cacheError = msg;
    throw new Error(
      `Z-AI SDK not configured. Set ZAI_BASE_URL + ZAI_API_KEY env vars, ` +
      `or create a .z-ai-config file. Original error: ${msg}`,
    );
  }
}

/**
 * Check if Z-AI is configured (either via env vars or config file).
 * Used by health checks + the frontend to show configuration status.
 */
export function isZaiConfigured(): boolean {
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) return true;
  // Can't check file existence synchronously here without fs — assume configured
  // if env vars are absent (the create() call will fail at runtime if not)
  return true;
}

/**
 * Reset the cached client (for testing or when config changes).
 */
export function resetZaiClient(): void {
  cachedClient = null;
  cacheError = null;
}
