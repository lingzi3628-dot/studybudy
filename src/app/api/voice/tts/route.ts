import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/voice/tts
 * Body: { text }
 *
 * Stub — premium-only. Returns 501 Not Implemented for now.
 * Future: use browser SpeechSynthesis API client-side (no tokens needed)
 * or server-side TTS provider.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (!isPremium) {
    return NextResponse.json(
      { error: "Voice interaction is a premium feature.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
      { status: 402 }
    );
  }
  return NextResponse.json(
    { error: "TTS is not yet configured. The browser's built-in SpeechSynthesis API can be used client-side.", status: "not_implemented" },
    { status: 501 }
  );
}
