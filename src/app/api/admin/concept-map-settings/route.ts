import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/concept-map-settings */
export async function GET() {
  await requireAdminJwt();
  let settings: any = null;
  try {
    settings = await db.conceptMapSettings.findUnique({ where: { id: 1 } });
  } catch (e: any) {
    console.error("ConceptMapSettings fetch failed:", e?.message);
  }

  return NextResponse.json({
    enabled: settings?.enabled ?? true,
    tokenCost: settings?.tokenCost ?? 300,
    freeDailyLimit: settings?.freeDailyLimit ?? 1,
    updatedAt: settings?.updatedAt ?? null,
  });
}

/** PUT /api/admin/concept-map-settings */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.tokenCost === "number") data.tokenCost = Math.max(0, Math.min(10000, body.tokenCost));
  if (typeof body.freeDailyLimit === "number") data.freeDailyLimit = Math.max(0, Math.min(1000, body.freeDailyLimit));

  try {
    const existing = await db.conceptMapSettings.findUnique({ where: { id: 1 } });
    if (existing) {
      await db.conceptMapSettings.update({ where: { id: 1 }, data });
    } else {
      await db.conceptMapSettings.create({ data: { id: 1, ...data } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
  }

  await logAdminActionViaJwt(admin, "concept_map_settings.update", data);
  return NextResponse.json({ ok: true });
}
