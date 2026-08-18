import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/plans — public list of all plans */
export async function GET() {
  const plans = await db.plan.findMany({
    orderBy: { price: "asc" },
    select: { id: true, name: true, slug: true, price: true, currency: true, tokenLimit: true, dailyQuizLimit: true, dailyFlashcardGenLimit: true, features: true },
  });
  return NextResponse.json({ plans });
}
