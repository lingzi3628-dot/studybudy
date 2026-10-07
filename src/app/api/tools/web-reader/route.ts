import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isWebReaderEnabled, callWebReader } from "@/lib/toolhub-client";

export const runtime = "nodejs";
export const maxDuration = 35;

/** POST /api/tools/web-reader — extract text from URL (Web Content Extractor) */
export async function POST(req: NextRequest) {
  try { await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const enabled = await isWebReaderEnabled();
  if (!enabled) return NextResponse.json({ error: "Web content extraction is not enabled", unsupported: true }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const url = (body?.url ?? "").toString();
  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  // Basic URL validation
  try { new URL(url); } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }

  const result = await callWebReader({ url });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
