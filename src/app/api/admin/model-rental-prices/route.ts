import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/model-rental-prices */
export async function GET() {
  await requireAdminJwt();
  const prices = await db.modelRentalPrice.findMany({
    orderBy: [{ modelName: "asc" }, { durationMinutes: "asc" }],
  }).catch(() => []);
  return NextResponse.json({ prices });
}

/** POST /api/admin/model-rental-prices — create new */
export async function POST(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({})) as {
    modelName?: string;
    durationMinutes?: number;
    coinCost?: number;
  };
  if (!body.modelName || !body.durationMinutes || typeof body.coinCost !== "number") {
    return NextResponse.json({ error: "modelName, durationMinutes, coinCost required" }, { status: 400 });
  }
  try {
    const price = await db.modelRentalPrice.create({
      data: {
        modelName: body.modelName,
        durationMinutes: Math.max(1, Math.min(10080, body.durationMinutes)), // max 1 week
        coinCost: Math.max(0, body.coinCost),
      },
    });
    return NextResponse.json({ price });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Price for this model+duration already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
