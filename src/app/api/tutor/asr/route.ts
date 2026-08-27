import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/tutor/asr
 * Body: { audioBase64: string }  (base64-encoded audio data, no prefix)
 *
 * Transcribes spoken audio to text using z-ai-web-dev-sdk ASR.
 * Returns { text: string }.
 *
 * Used for the AI Tutor voice mode — user records audio in the browser,
 * uploads base64, gets back transcribed text which is then sent to /api/tutor/chat.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const audioBase64 = (body?.audioBase64 ?? "").toString().trim();

  if (!audioBase64) {
    return NextResponse.json({ error: "audioBase64 is required" }, { status: 400 });
  }

  // Strip data URL prefix if present
  const base64 = audioBase64.replace(/^data:[^;]+;base64,/, "");

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const client = await ZAI.create();

    const response: any = await client.audio.asr.create({
      file_base64: base64,
    });

    const text = (response?.text ?? "").toString().trim();

    if (!text) {
      return NextResponse.json(
        { error: "Could not transcribe audio — try speaking more clearly" },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (e: any) {
    console.error("[tutor/asr] error:", e?.message);
    return NextResponse.json(
      { error: "ASR failed: " + (e?.message ?? "unknown error") },
      { status: 500 }
    );
  }
}
