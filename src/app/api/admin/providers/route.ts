import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { encryptApiKey, maskApiKey } from "@/lib/crypto";

export const runtime = "nodejs";

const VALID_TYPES = ["openai", "glm", "gemini", "openrouter", "huggingface", "pollinations"];

/**
 * GET /api/admin/providers — list all providers with masked API keys.
 */
export async function GET() {
  await requireAdmin();
  const providers = await db.aiProvider.findMany({
    orderBy: [{ priority: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({
    providers: providers.map((p) => ({
      ...p,
      apiKeyMasked: p.apiKeyEncrypted ? maskApiKey(p.apiKeyEncrypted) : null,
      apiKeyEncrypted: undefined, // never expose the encrypted key to the client
    })),
  });
}

/**
 * POST /api/admin/providers
 * Body: { name, providerType, apiKey?, baseUrl?, model?, maxTokens?, costPer1kTokens?, priority?, enabled?, isDefault? }
 * Encrypts the API key with AES-256-CBC.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));

  const name = (body.name ?? "").toString().trim();
  const providerType = (body.providerType ?? "").toString().trim();
  if (!name || !providerType) {
    return NextResponse.json({ error: "Missing name or providerType" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(providerType)) {
    return NextResponse.json({ error: `Invalid providerType. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }

  const apiKey = (body.apiKey ?? "").toString().trim();
  const data: any = {
    name,
    providerType,
    baseUrl: body.baseUrl ?? null,
    model: body.model ?? null,
    maxTokens: body.maxTokens ?? 2048,
    costPer1kTokens: body.costPer1kTokens ?? 0,
    priority: body.priority ?? 100,
    enabled: body.enabled !== false,
    isDefault: body.isDefault === true,
  };
  if (apiKey) {
    data.apiKeyEncrypted = encryptApiKey(apiKey);
  }

  // If isDefault=true, clear the previous default
  if (data.isDefault) {
    await db.aiProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }

  const provider = await db.aiProvider.create({ data });
  await logAdminAction(admin.id, "provider.create", { providerId: provider.id, name });
  return NextResponse.json({ provider });
}
