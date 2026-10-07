import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolhubEnabled, callImageGen } from "@/lib/toolhub-client";

export const runtime = "nodejs";
export const maxDuration = 65;

/** POST /api/tools/image-gen — generate study illustration (Study Image Studio) */
export async function POST(req: NextRequest) {
  try { await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const enabled = await isToolhubEnabled();
  if (!enabled) return NextResponse.json({ error: "Tools Hub is not enabled", unsupported: true }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const prompt = (body?.prompt ?? "").toString();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  if (prompt.length > 1000) return NextResponse.json({ error: "Prompt too long (max 1000 chars)" }, { status: 413 });

  const result = await callImageGen({ prompt, size: body.size, style: body.style });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
