import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/user/tokens — current token balance + reset date */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    tokenBalance: user.tokenBalance ?? 0,
    currentModel: user.currentModel ?? "study_buddy_free",
    planId: user.planId,
    subscriptionExpiry: user.subscriptionExpiry,
    tokenResetDate: user.tokenResetDate,
  });
}
