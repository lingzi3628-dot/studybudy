import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolhubEnabled, callVLM } from "@/lib/toolhub-client";

export const runtime = "nodejs";
export const maxDuration = 65;

/** POST /api/tools/vlm — image understanding (Diagram Explainer) */
export async function POST(req: NextRequest) {
  try { await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const enabled = await isToolhubEnabled();
  if (!enabled) return NextResponse.json({ error: "Tools Hub is not enabled", unsupported: true }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const imageBase64 = (body?.image ?? "").toString();
  if (!imageBase64) return NextResponse.json({ error: "Image (base64) is required" }, { status: 400 });
  if (imageBase64.length > 5_000_000) return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 413 });

  const result = await callVLM({ imageBase64, mimeType: body.mimeType, prompt: body.prompt });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
