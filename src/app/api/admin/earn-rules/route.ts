import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/earn-rules */
export async function GET() {
  await requireAdminJwt();
  const rules = await db.earnRule.findMany({ orderBy: { action: "asc" } }).catch(() => []);
  return NextResponse.json({ rules });
}

/** POST /api/admin/earn-rules — create new */
export async function POST(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({})) as {
    action?: string;
    coinReward?: number;
    xpReward?: number;
    tokenReward?: number;
    dailyLimit?: number;
  };
  if (!body.action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }
  try {
    const rule = await db.earnRule.create({
      data: {
        action: body.action,
        coinReward: Math.max(0, body.coinReward ?? 0),
        xpReward: Math.max(0, body.xpReward ?? 0),
        tokenReward: Math.max(0, body.tokenReward ?? 0),
        dailyLimit: Math.max(0, body.dailyLimit ?? 0),
      },
    });
    return NextResponse.json({ rule });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Action already exists" }, { status: 409 });
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
