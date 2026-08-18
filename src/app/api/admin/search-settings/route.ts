import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { encryptApiKey, decryptApiKey, maskApiKey } from "@/lib/crypto";

export const runtime = "nodejs";

/** GET /api/admin/search-settings */
export async function GET() {
  await requireAdminJwt();
  let settings: any = null;
  try {
    settings = await db.searchSettings.findUnique({ where: { id: 1 } });
  } catch {}

  // Fallback defaults
  const result = {
    hasYoutubeKey: Boolean(settings?.youtubeApiKeyEncrypted),
    youtubeKeyMasked: settings?.youtubeApiKeyEncrypted ? maskApiKey(settings.youtubeApiKeyEncrypted) : null,
    pollinationsBaseUrl: settings?.pollinationsBaseUrl ?? "https://image.pollinations.ai/prompt/",
    imageSearchEnabled: settings?.imageSearchEnabled ?? true,
    videoSearchEnabled: settings?.videoSearchEnabled ?? true,
    imageTokenCost: settings?.imageTokenCost ?? 10,
    videoTokenCost: settings?.videoTokenCost ?? 50,
    freeDailyImageLimit: settings?.freeDailyImageLimit ?? 5,
    freeDailyVideoLimit: settings?.freeDailyVideoLimit ?? 3,
  };
  return NextResponse.json(result);
}

/** PUT /api/admin/search-settings */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.youtubeApiKey === "string" && body.youtubeApiKey.trim()) {
    data.youtubeApiKeyEncrypted = encryptApiKey(body.youtubeApiKey.trim());
  }
  if (typeof body.pollinationsBaseUrl === "string") data.pollinationsBaseUrl = body.pollinationsBaseUrl;
  if (typeof body.imageSearchEnabled === "boolean") data.imageSearchEnabled = body.imageSearchEnabled;
  if (typeof body.videoSearchEnabled === "boolean") data.videoSearchEnabled = body.videoSearchEnabled;
  if (typeof body.imageTokenCost === "number") data.imageTokenCost = body.imageTokenCost;
  if (typeof body.videoTokenCost === "number") data.videoTokenCost = body.videoTokenCost;
  if (typeof body.freeDailyImageLimit === "number") data.freeDailyImageLimit = body.freeDailyImageLimit;
  if (typeof body.freeDailyVideoLimit === "number") data.freeDailyVideoLimit = body.freeDailyVideoLimit;

  try {
    // Upsert (id=1, single row)
    const existing = await db.searchSettings.findUnique({ where: { id: 1 } });
    if (existing) {
      await db.searchSettings.update({ where: { id: 1 }, data });
    } else {
      await db.searchSettings.create({ data: { id: 1, ...data } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
  }

  await logAdminActionViaJwt(admin, "search_settings.update", data);
  return NextResponse.json({ ok: true });
}
