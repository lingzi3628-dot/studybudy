import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptApiKey, decryptApiKey, maskApiKey } from "@/lib/crypto";
import { callBYOKAI } from "@/lib/ai";

export const runtime = "nodejs";

/** GET /api/user/api-key — return whether the user has an API key set + masked version. */
export async function GET() {
  const user = await getCurrentUser();
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });
  return NextResponse.json({
    hasKey: Boolean(u?.encryptedApiKey),
    maskedKey: u?.encryptedApiKey ? maskApiKey(u.encryptedApiKey) : null,
  });
}

/**
 * POST /api/user/api-key
 * Body: { apiKey, baseUrl?, model? }
 *
 * Encrypts and stores the user's BYOK key. Validates by making a tiny test
 * AI call to the OpenAI-compatible endpoint with their key.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const apiKey = (body.apiKey ?? "").toString().trim();

  // Phase 78 — Auto-detect provider from key prefix.
  let baseUrl = (body.baseUrl ?? "").toString().trim();
  let model = (body.model ?? "").toString().trim();
  if (!baseUrl) {
    if (apiKey.startsWith("mstrl_")) { baseUrl = "https://api.mistral.ai/v1"; model = model || "mistral-small-latest"; }
    else if (apiKey.startsWith("gsk_")) { baseUrl = "https://api.groq.com/openai/v1"; model = model || "llama-3.3-70b-versatile"; }
    else if (apiKey.startsWith("sk-ant-")) { baseUrl = "https://api.anthropic.com/v1"; model = model || "claude-3-5-sonnet-20241022"; }
    else { baseUrl = "https://api.openai.com/v1"; model = model || "gpt-4o-mini"; }
  }

  if (!apiKey) {
    return NextResponse.json({ error: "Missing apiKey" }, { status: 400 });
  }

  // Validate by sending a tiny test message.
  try {
    await callBYOKAI(
      [
        { role: "system", content: "You are a test endpoint. Reply with the single word 'ok'." },
        { role: "user", content: "Reply with ok." },
      ],
      apiKey,
      { baseUrl, model, userId: user.id, route: "/api/user/api-key" }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Key validation failed", detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }

  const encrypted = encryptApiKey(apiKey);
  await db.user.update({
    where: { id: user.id },
    data: { encryptedApiKey: encrypted },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/user/api-key — clears the stored key. */
export async function DELETE() {
  const user = await getCurrentUser();
  await db.user.update({
    where: { id: user.id },
    data: { encryptedApiKey: null },
  });
  return NextResponse.json({ ok: true });
}

// helper exported for other server-side callers (e.g. existing endpoints)
export async function getUserApiKey(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true },
  });
  if (!u?.encryptedApiKey) return null;
  return decryptApiKey(u.encryptedApiKey) || null;
}
