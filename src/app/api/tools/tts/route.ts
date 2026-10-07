// Generic tool proxy pattern — each tool route follows this shape.
// Copy-paste-adapted for each Tools Hub plugin.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolhubEnabled, callTTS } from "@/lib/toolhub-client";

export const runtime = "nodejs";
export const maxDuration = 35;

/** POST /api/tools/tts — text-to-speech (Lesson Narrator) */
export async function POST(req: NextRequest) {
  try { await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const enabled = await isToolhubEnabled();
  if (!enabled) return NextResponse.json({ error: "Tools Hub is not enabled", unsupported: true }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const text = (body?.text ?? "").toString();
  if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: "Text too long (max 5000 chars)" }, { status: 413 });

  const result = await callTTS({ text, voice: body.voice, speed: body.speed, format: body.format });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
