import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/model-mappings */
export async function GET() {
  await requireAdminJwt();
  const mappings = await db.modelMapping.findMany({
    orderBy: { tokenCostMultiplier: "asc" },
  });
  return NextResponse.json({ mappings });
}

/** POST /api/admin/model-mappings — create or update */
export async function POST(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const mapping = await db.modelMapping.upsert({
    where: { modelName: body.modelName },
    create: body,
    update: body,
  });
  return NextResponse.json({ mapping });
}
