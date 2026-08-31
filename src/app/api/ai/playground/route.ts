import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/playground — Phase 56 (AIBuddy / AI App Dev track)
 *
 * The Prompt Playground's backend: run ONE (system, user) prompt pair with
 * sampling controls and return the output + latency. Used for side-by-side
 * A/B comparison of prompt variants in PromptPlaygroundScreen.
 *
 * Body:
 *   systemPrompt   string  — the system message (can be empty)
 *   userPrompt     string  — required
 *   temperature    number? — 0..1.5 (default: provider default)
 *   maxTokens      number? — 1..4096 (default: provider default)
 *
 * Monetization: feature key "playground" (cost 8, free cap 50/day) — added
 * to FLAT_COSTS + FREE_DAILY_LIMITS in Phase 56. Tokens are refunded on
 * failure, same as the tutor routes.
 *
 * NOTE: this endpoint intentionally does NOT persist conversations — the
 * playground is for fast iteration. Saving prompt versions to a Project is
 * done client-side via /api/projects.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const systemPrompt = (body?.systemPrompt ?? "").toString();
  const userPrompt = (body?.userPrompt ?? "").toString().trim();
  const temperatureRaw = Number(body?.temperature);
  const maxTokensRaw = Number(body?.maxTokens);

  const temperature = Number.isFinite(temperatureRaw)
    ? Math.min(1.5, Math.max(0, temperatureRaw))
    : undefined;
  const maxTokens = Number.isFinite(maxTokensRaw)
    ? Math.min(4096, Math.max(1, Math.round(maxTokensRaw)))
    : undefined;

  if (!userPrompt) {
    return NextResponse.json({ error: "userPrompt is required" }, { status: 400 });
  }
  if (userPrompt.length > 32_000 || systemPrompt.length > 32_000) {
    return NextResponse.json({ error: "Prompt too long (32k char limit)" }, { status: 400 });
  }

  // Deduct tokens (feature added in Phase 56)
  const deduct = await checkAndDeductTokens(user.id, "playground");
  if (!deduct.ok) {
    const status = deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED" ? 402 : 500;
    return NextResponse.json({ error: deduct.error, code: deduct.code, needsUpgrade: status === 402 }, { status });
  }

  // BYOK resolution — same pattern as /api/search and /api/generate/cards
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const messages: ChatMessage[] = [];
  if (systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const startedAt = Date.now();
  try {
    const output = await callAI(messages, apiKey, {
      userId: user.id,
      route: "/api/ai/playground",
      temperature,
      maxTokens,
    });
    const durationMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: true,
      output,
      durationMs,
      // Rough char/4 token estimate — real usage lands in ai_call_logs for
      // providers that report it.
      estTokens: Math.ceil((systemPrompt.length + userPrompt.length + output.length) / 4),
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    await refundTokens(user.id, "playground", deduct.costTokens);
    return NextResponse.json(
      { error: e?.message ?? "AI call failed", durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
