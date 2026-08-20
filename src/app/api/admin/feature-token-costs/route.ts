import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/feature-token-costs */
export async function GET() {
  await requireAdminJwt();
  const costs = await db.featureTokenCost.findMany({
    orderBy: { featureName: "asc" },
  }).catch(() => []);
  return NextResponse.json({ costs });
}

/** PUT /api/admin/feature-token-costs — bulk update or single */
export async function PUT(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  // Body can be: { featureName, tokenCost } OR { costs: [{featureName, tokenCost}] }
  if (Array.isArray(body.costs)) {
    for (const c of body.costs) {
      if (c.featureName && typeof c.tokenCost === "number") {
        const existing = await db.featureTokenCost.findUnique({ where: { featureName: c.featureName } }).catch(() => null);
        if (existing) {
          await db.featureTokenCost.update({ where: { id: existing.id }, data: { tokenCost: Math.max(0, c.tokenCost) } });
        } else {
          await db.featureTokenCost.create({ data: { featureName: c.featureName, tokenCost: Math.max(0, c.tokenCost) } });
        }
      }
    }
    return NextResponse.json({ ok: true, updated: body.costs.length });
  }

  if (body.featureName && typeof body.tokenCost === "number") {
    const existing = await db.featureTokenCost.findUnique({ where: { featureName: body.featureName } }).catch(() => null);
    let result;
    if (existing) {
      result = await db.featureTokenCost.update({ where: { id: existing.id }, data: { tokenCost: Math.max(0, body.tokenCost) } });
    } else {
      result = await db.featureTokenCost.create({ data: { featureName: body.featureName, tokenCost: Math.max(0, body.tokenCost) } });
    }
    return NextResponse.json({ ok: true, cost: result });
  }

  return NextResponse.json({ error: "Provide featureName+tokenCost OR costs array" }, { status: 400 });
}
