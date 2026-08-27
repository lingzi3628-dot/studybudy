import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/tutor/asr
 * Body: { audioBase64: string }  (base64-encoded audio data, may include data URL prefix)
 *
 * Transcribes spoken audio to text using z-ai-web-dev-sdk ASR.
 * Returns { text: string }.
 *
 * The SDK returns the response from the upstream ASR API as a JSON object.
 * The shape can vary — we defensively look for the transcription text in
 * multiple possible fields (text, result, transcript, data.text, etc.).
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

  // Strip data URL prefix if present (e.g. "data:audio/webm;base64,...")
  const base64 = audioBase64.replace(/^data:[^;]+;base64,/, "");

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const client = await ZAI.create();

    const response: any = await client.audio.asr.create({
      file_base64: base64,
    });

    // The SDK returns response.json() — the exact shape depends on the
    // upstream API. Try multiple known fields:
    const text =
      (response?.text ?? "").toString().trim() ||
      (response?.transcript ?? "").toString().trim() ||
      (response?.result ?? "").toString().trim() ||
      (response?.data?.text ?? "").toString().trim() ||
      (response?.data?.transcript ?? "").toString().trim() ||
      "";

    if (!text) {
      console.error("[tutor/asr] no text found in response:", JSON.stringify(response).slice(0, 500));
      return NextResponse.json(
        { error: "Could not transcribe audio — try speaking more clearly", raw: response },
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
