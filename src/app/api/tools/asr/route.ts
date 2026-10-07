import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isASREnabled, callASR } from "@/lib/toolhub-client";

export const runtime = "nodejs";
export const maxDuration = 65;

/** POST /api/tools/asr — speech-to-text (Voice Answer / Dictation) */
export async function POST(req: NextRequest) {
  try { await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const enabled = await isASREnabled();
  if (!enabled) return NextResponse.json({ error: "Voice transcription is not enabled", unsupported: true }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const audioBase64 = (body?.audio ?? "").toString();
  if (!audioBase64) return NextResponse.json({ error: "Audio (base64) is required" }, { status: 400 });
  if (audioBase64.length > 10_000_000) return NextResponse.json({ error: "Audio too large (max 10 MB)" }, { status: 413 });

  const result = await callASR({ audioBase64, format: body.format, language: body.language });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
