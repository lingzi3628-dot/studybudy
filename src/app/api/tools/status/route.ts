import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolhubEnabled } from "@/lib/toolhub-client";

export const runtime = "nodejs";

/**
 * GET /api/tools/status
 *
 * Returns whether Tools Hub is enabled. The frontend uses this to decide
 * whether to show Tools Hub buttons (🔍 Explain, 🟣 ASR mic, 🎨 Image, etc.).
 * When Tools Hub is disabled, ALL those buttons are hidden — no clutter,
 * no errors, no noise.
 */
export async function GET() {
  try { await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const enabled = await isToolhubEnabled();
  return NextResponse.json({ enabled });
}
