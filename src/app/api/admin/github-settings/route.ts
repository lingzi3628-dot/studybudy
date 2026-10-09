import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { encryptApiKey } from "@/lib/crypto";

export const runtime = "nodejs";

/** GET /api/admin/github-settings — returns GitHub OAuth settings */
export async function GET() {
  await requireAdminJwt();
  let settings: any = null;
  try {
    settings = await db.githubSettings.findUnique({ where: { id: 1 } });
  } catch {}

  return NextResponse.json({
    enabled: settings?.enabled ?? false,
    hasClientId: Boolean(settings?.clientId),
    clientId: settings?.clientId ?? "",
    hasClientSecret: Boolean(settings?.clientSecretEncrypted),
    allowedOrgs: settings?.allowedOrgs ?? "",
  });
}

/** PUT /api/admin/github-settings — saves GitHub OAuth settings */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.clientId === "string" && body.clientId.trim()) data.clientId = body.clientId.trim();
  if (typeof body.allowedOrgs === "string") data.allowedOrgs = body.allowedOrgs.trim() || null;
  if (typeof body.clientSecret === "string" && body.clientSecret.trim()) {
    data.clientSecretEncrypted = encryptApiKey(body.clientSecret.trim());
  }

  try {
    const existing = await db.githubSettings.findUnique({ where: { id: 1 } });
    if (existing) {
      await db.githubSettings.update({ where: { id: 1 }, data });
    } else {
      await db.githubSettings.create({ data: { id: 1, ...data } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
  }

  await logAdminActionViaJwt(admin, "github_settings.update", data);
  return NextResponse.json({ ok: true });
}
