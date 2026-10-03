import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { loadEnabledProviders } from "@/lib/ai-providers";
import { getZaiClient } from "@/lib/zai-client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/admin/providers/diagnose
 *
 * Diagnoses why AI calls might fail for users. Shows:
 *   - All configured providers (with key status: decrypts OK / fails / missing)
 *   - Which providers would be tried (enabled + has key)
 *   - Whether the Z-AI platform fallback is configured
 *   - Recent AI call log errors (last 10)
 */
export async function GET() {
  let admin;
  try { admin = await requireAdminJwt(); }
  catch { return NextResponse.json({ error: "Admin auth required" }, { status: 401 }); }

  const diagnosis: any = {
    timestamp: new Date().toISOString(),
    adminEmail: admin.adminEmail,
  };

  // 1. Check all providers
  const allProviders = await db.aiProvider.findMany({
    orderBy: [{ priority: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });

  diagnosis.providers = allProviders.map((p) => {
    let keyStatus: string = "missing";
    let keyPrefix: string | null = null;
    if (p.apiKeyEncrypted) {
      const decrypted = decryptApiKey(p.apiKeyEncrypted);
      if (decrypted) {
        keyStatus = "ok";
        keyPrefix = decrypted.slice(0, 8) + "…";
      } else {
        keyStatus = "decryption_failed";
      }
    } else if (p.providerType === "pollinations") {
      keyStatus = "keyless_ok";
    }

    return {
      id: p.id,
      name: p.name,
      providerType: p.providerType,
      enabled: p.enabled,
      isDefault: p.isDefault,
      priority: p.priority,
      model: p.model,
      baseUrl: p.baseUrl,
      keyStatus,
      keyPrefix,
    };
  });

  // 2. Check which providers would actually be tried
  const enabledProviders = await loadEnabledProviders();
  diagnosis.enabledProviderCount = enabledProviders.length;
  diagnosis.enabledProviders = enabledProviders.map((p) => ({
    name: p.name,
    type: p.providerType,
    model: p.model,
  }));

  // 3. Check Z-AI platform fallback
  diagnosis.zaiPlatform = {
    envBaseUrl: process.env.ZAI_BASE_URL ? "set" : "NOT SET",
    envApiKey: process.env.ZAI_API_KEY ? "set" : "NOT SET",
  };
  try {
    await getZaiClient();
    diagnosis.zaiPlatform.clientStatus = "ok";
  } catch (e: any) {
    diagnosis.zaiPlatform.clientStatus = "failed";
    diagnosis.zaiPlatform.error = e?.message ?? String(e);
  }

  // 4. Recent AI call errors (last 10)
  const recentErrors = await db.aiCallLog.findMany({
    where: { status: "error" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      providerType: true,
      model: true,
      errorMessage: true,
      route: true,
      createdAt: true,
    },
  });
  diagnosis.recentErrors = recentErrors;

  // 5. Summary + recommendations
  const workingProviders = diagnosis.providers.filter(
    (p: any) => p.enabled && (p.keyStatus === "ok" || p.keyStatus === "keyless_ok"),
  );
  diagnosis.summary = {
    totalProviders: diagnosis.providers.length,
    enabledProviders: diagnosis.enabledProviderCount,
    workingProviders: workingProviders.length,
    zaiConfigured: diagnosis.zaiPlatform.clientStatus === "ok",
  };

  if (workingProviders.length === 0 && diagnosis.zaiPlatform.clientStatus !== "ok") {
    diagnosis.recommendation =
      "NO AI PROVISION AVAILABLE. Either: (1) enable + fix API keys for at least one provider, " +
      "OR (2) set ZAI_BASE_URL + ZAI_API_KEY env vars for the platform fallback. " +
      "Until one of these is done, all AI tutor calls will fail.";
  } else if (workingProviders.length === 0) {
    diagnosis.recommendation =
      "No admin providers are working, but the Z-AI platform fallback is configured. " +
      "Users will get responses from the free GLM model. To use a different model, " +
      "fix the API keys on your providers (likely the API_KEY_ENCRYPTION_SECRET changed).";
  } else {
    diagnosis.recommendation =
      `${workingProviders.length} provider(s) working. Users should get AI responses.`;
  }

  logger.info("admin diagnose", { admin: admin.adminEmail, summary: diagnosis.summary });
  return NextResponse.json(diagnosis);
}
