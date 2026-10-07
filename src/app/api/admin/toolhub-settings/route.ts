import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { encryptApiKey, maskApiKey, decryptApiKey } from "@/lib/crypto";
import {
  testConnection,
  clearToolhubSettingsCache,
} from "@/lib/toolhub-client";

export const runtime = "nodejs";

/**
 * GET /api/admin/toolhub-settings
 *
 * Returns the current Tools Hub settings. The API key is masked — the
 * admin sees "sbth_…abc" instead of the full key. The full key is
 * never sent to the browser.
 */
export async function GET() {
  await requireAdminJwt();
  let settings: any = null;
  try {
    settings = await db.toolhubSettings.findUnique({ where: { id: 1 } });
  } catch {}

  const hasKey = Boolean(settings?.apiKeyEncrypted);
  let keyMasked: string | null = null;
  if (hasKey) {
    try {
      const decrypted = decryptApiKey(settings.apiKeyEncrypted);
      keyMasked = maskApiKey(decrypted);
    } catch {
      keyMasked = "(decryption failed)";
    }
  }

  const result = {
    enabled: settings?.enabled ?? false,
    hasApiKey: hasKey,
    apiKeyMasked: keyMasked,
    baseUrl: settings?.baseUrl ?? "https://toolhub.space-z.ai",
    codeSandboxEnabled: settings?.codeSandboxEnabled ?? true,
    tutorEnabled: settings?.tutorEnabled ?? false,
    // Phase 9 — per-tool toggles
    ttsEnabled: settings?.ttsEnabled ?? true,
    asrEnabled: settings?.asrEnabled ?? true,
    vlmEnabled: settings?.vlmEnabled ?? true,
    imageGenEnabled: settings?.imageGenEnabled ?? true,
    searchEnabled: settings?.searchEnabled ?? true,
    webReaderEnabled: settings?.webReaderEnabled ?? true,
    lastTestedAt: settings?.lastTestedAt ?? null,
    lastTestOk: settings?.lastTestOk ?? null,
    lastTestError: settings?.lastTestError ?? null,
  };
  return NextResponse.json(result);
}

/**
 * PUT /api/admin/toolhub-settings
 *
 * Body fields (all optional — only provided fields are updated):
 *   - enabled: boolean
 *   - apiKey: string (plaintext — will be encrypted before storage)
 *   - baseUrl: string
 *   - codeSandboxEnabled: boolean
 *   - tutorEnabled: boolean
 */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.baseUrl === "string" && body.baseUrl.trim()) {
    data.baseUrl = body.baseUrl.trim();
  }
  if (typeof body.codeSandboxEnabled === "boolean") data.codeSandboxEnabled = body.codeSandboxEnabled;
  if (typeof body.tutorEnabled === "boolean") data.tutorEnabled = body.tutorEnabled;
  // Phase 9 — per-tool toggles
  if (typeof body.ttsEnabled === "boolean") data.ttsEnabled = body.ttsEnabled;
  if (typeof body.asrEnabled === "boolean") data.asrEnabled = body.asrEnabled;
  if (typeof body.vlmEnabled === "boolean") data.vlmEnabled = body.vlmEnabled;
  if (typeof body.imageGenEnabled === "boolean") data.imageGenEnabled = body.imageGenEnabled;
  if (typeof body.searchEnabled === "boolean") data.searchEnabled = body.searchEnabled;
  if (typeof body.webReaderEnabled === "boolean") data.webReaderEnabled = body.webReaderEnabled;
  if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    data.apiKeyEncrypted = encryptApiKey(body.apiKey.trim());
  }

  try {
    const existing = await db.toolhubSettings.findUnique({ where: { id: 1 } });
    if (existing) {
      await db.toolhubSettings.update({ where: { id: 1 }, data });
    } else {
      await db.toolhubSettings.create({ data: { id: 1, ...data } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
  }

  clearToolhubSettingsCache();

  await logAdminActionViaJwt(admin, "toolhub_settings.update", {
    enabled: data.enabled,
    baseUrl: data.baseUrl,
    codeSandboxEnabled: data.codeSandboxEnabled,
    tutorEnabled: data.tutorEnabled,
    apiKeyUpdated: Boolean(data.apiKeyEncrypted),
  });
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/toolhub-settings/test
 *
 * Tests the connection by calling listTools() (via testConnection).
 * Updates lastTestedAt / lastTestOk / lastTestError in the DB.
 */
export async function POST() {
  await requireAdminJwt();
  const result = await testConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
