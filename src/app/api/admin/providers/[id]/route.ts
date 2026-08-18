import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { encryptApiKey } from "@/lib/crypto";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/admin/providers/[id]
 * Body: { name?, providerType?, apiKey?, baseUrl?, model?, maxTokens?, costPer1kTokens?, priority?, enabled?, isDefault? }
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (body.name) data.name = body.name;
  if (body.providerType) data.providerType = body.providerType;
  if (typeof body.baseUrl === "string") data.baseUrl = body.baseUrl || null;
  if (typeof body.model === "string") data.model = body.model || null;
  if (typeof body.maxTokens === "number") data.maxTokens = body.maxTokens;
  if (typeof body.costPer1kTokens === "number") data.costPer1kTokens = body.costPer1kTokens;
  if (typeof body.priority === "number") data.priority = body.priority;
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;

  // If a new apiKey is provided, encrypt it
  const apiKey = (body.apiKey ?? "").toString().trim();
  if (apiKey) {
    data.apiKeyEncrypted = encryptApiKey(apiKey);
  }

  // If isDefault=true, clear the previous default
  if (body.isDefault === true) {
    await db.aiProvider.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    data.isDefault = true;
  } else if (body.isDefault === false) {
    data.isDefault = false;
  }

  const updated = await db.aiProvider.update({ where: { id }, data });
  await logAdminAction(admin.id, "provider.update", { providerId: id, changes: { ...data, apiKey: data.apiKeyEncrypted ? "[redacted]" : undefined } });
  return NextResponse.json({ provider: updated });
}

/**
 * DELETE /api/admin/providers/[id]
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  await db.aiProvider.delete({ where: { id } });
  await logAdminAction(admin.id, "provider.delete", { providerId: id });
  return NextResponse.json({ ok: true });
}
