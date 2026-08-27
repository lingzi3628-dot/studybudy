import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/tutor/tts
 * Body: { text: string, voice?: string, speed?: number }
 *
 * Generates speech audio for the given text using z-ai-web-dev-sdk TTS.
 * Returns audio/wav binary response that the frontend can play in <audio>.
 *
 * Voices: tongtong, chuichui, xiaochen, jam, kazi, douji, luodo
 * Speed: 0.5 to 2.0 (default 1.0)
 *
 * Text length limit: 1024 chars per request. The frontend splits longer
 * text into chunks.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const text = (body?.text ?? "").toString().trim();
  const voice = (body?.voice ?? "tongtong").toString();
  const speed = Math.min(2.0, Math.max(0.5, Number(body?.speed) || 1.0));

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > 1024) {
    return NextResponse.json(
      { error: "Text too long (max 1024 chars). Split into chunks." },
      { status: 413 }
    );
  }

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const client = await ZAI.create();

    const response = await client.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    console.error("[tutor/tts] error:", e?.message);
    return NextResponse.json(
      { error: "TTS generation failed: " + (e?.message ?? "unknown error") },
      { status: 500 }
    );
  }
}
