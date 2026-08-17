import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDueCards } from "@/lib/progression";

export const runtime = "nodejs";

/** GET /api/review/queue — up to 20 cards due now for current user */
export async function GET() {
  const user = await getCurrentUser();
  const cards = await getDueCards(user.id, 20);
  return NextResponse.json({ cards });
}
