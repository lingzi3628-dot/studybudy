import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";

/**
 * POST /api/voice/transcribe
 * Body: { audio (base64) }
 *
 * Stub endpoint — returns a friendly error explaining that voice
 * transcription is not yet integrated. Future implementation would
 * use OpenAI Whisper or similar. Premium-only.
 *
 * Free for now (returns 501 Not Implemented).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  // Premium check
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (!isPremium) {
    return NextResponse.json(
      { error: "Voice interaction is a premium feature.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
      { status: 402 }
    );
  }
  return NextResponse.json(
    { error: "Voice transcription is not yet configured. Coming soon!", status: "not_implemented" },
    { status: 501 }
  );
}
