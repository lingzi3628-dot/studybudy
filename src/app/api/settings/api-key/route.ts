import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";
import { callBYOKAI } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * POST /api/settings/api-key
 * Body: { apiKey: string, baseUrl?: string, model?: string }
 *
 * - Encrypts the key with AES-256-CBC and stores in users.encrypted_api_key.
 * - Validates by making a tiny test call to the user's endpoint.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const apiKey = (body.apiKey ?? "").toString().trim();
  const baseUrl = (body.baseUrl ?? "https://api.openai.com/v1").toString().trim();
  const model = (body.model ?? "gpt-4o-mini").toString().trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing apiKey" },
      { status: 400 }
    );
  }

  // Validate by sending a tiny test message.
  try {
    await callBYOKAI(
      [
        { role: "system", content: "You are a test endpoint. Reply with the single word 'ok'." },
        { role: "user", content: "Reply with ok." },
      ],
      apiKey,
      { baseUrl, model }
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

/** DELETE /api/settings/api-key — clears the stored key */
export async function DELETE() {
  const user = await getCurrentUser();
  await db.user.update({
    where: { id: user.id },
    data: { encryptedApiKey: null },
  });
  return NextResponse.json({ ok: true });
}

/** GET /api/settings/api-key — returns whether a key is set (never the key itself) */
export async function GET() {
  const user = await getCurrentUser();
  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });
  return NextResponse.json({ hasKey: Boolean(fresh?.encryptedApiKey) });
}

// helper for callers who need to read the decrypted key server-side
export async function getUserApiKey(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true },
  });
  if (!u?.encryptedApiKey) return null;
  return decryptApiKey(u.encryptedApiKey) || null;
}
