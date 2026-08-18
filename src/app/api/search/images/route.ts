import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";

const DEFAULT_POLLINATIONS = "https://image.pollinations.ai/prompt/";

/** POST /api/search/images — generate AI image URLs via Pollinations */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt ?? "").toString().trim();
  const count = Math.min(8, Math.max(1, Number(body.count ?? 4)));

  if (!prompt || prompt.length > 500) {
    return NextResponse.json({ error: "Prompt required (max 500 chars)" }, { status: 400 });
  }

  // Get settings (admin-configurable)
  let settings: any = null;
  try {
    settings = await db.searchSettings.findUnique({ where: { id: 1 } });
  } catch {}

  const pollinationsUrl = settings?.pollinationsBaseUrl || DEFAULT_POLLINATIONS;
  const imageEnabled = settings?.imageSearchEnabled ?? true;
  if (!imageEnabled) {
    return NextResponse.json({ error: "Image search is disabled by admin" }, { status: 403 });
  }

  // Check & deduct tokens
  const deduct = await checkAndDeductTokens(user.id, "image_search");
  if (!deduct.ok) {
    return NextResponse.json(
      { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance },
      { status: 402 }
    );
  }

  try {
    // Generate image URLs with unique seeds — Pollinations renders on-demand
    const baseUrl = pollinationsUrl.replace(/\/$/, "");
    const seeds: number[] = [];
    const timestamp = Date.now();
    for (let i = 0; i < count; i++) {
      seeds.push(timestamp + i * 7777 + Math.floor(Math.random() * 1000));
    }

    const images = seeds.map((seed) =>
      `${baseUrl}/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true`
    );

    return NextResponse.json({
      images,
      cost: deduct.costTokens,
      remaining: deduct.newBalance,
      dailyRemaining: deduct.remaining,
    });
  } catch (e: any) {
    // Refund tokens if image generation fails
    await refundTokens(user.id, "image_search", deduct.costTokens);
    return NextResponse.json(
      { error: "Failed to generate images", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
