import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolhubEnabled, callWebSearch } from "@/lib/toolhub-client";

export const runtime = "nodejs";
export const maxDuration = 35;

/** POST /api/tools/search — web search (Research Assistant) */
export async function POST(req: NextRequest) {
  try { await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const enabled = await isToolhubEnabled();
  if (!enabled) return NextResponse.json({ error: "Tools Hub is not enabled", unsupported: true }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const query = (body?.query ?? "").toString();
  if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });

  const result = await callWebSearch({ query, num: body.num });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
