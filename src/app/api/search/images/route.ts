import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFreeRateLimit, refundDailySlot } from "@/lib/monetization";

export const runtime = "nodejs";
// Allow up to 60s for sequential image generation with retries
export const maxDuration = 60;

const DEFAULT_POLLINATIONS = "https://image.pollinations.ai/prompt/";

/**
 * POST /api/search/images — generate AI images via Pollinations
 *
 * FREE for all users — rate-limited (default 5/day for free, unlimited for premium).
 * Does NOT cost tokens.
 *
 * Pollinations heavily rate-limits concurrent requests (HTTP 429).
 * To work around this, we fetch images SERVER-SIDE sequentially with
 * retry-on-429 logic, then return as base64 data URLs so the browser
 * always displays them (no client-side rate limit issues).
 *
 * Body: { prompt, count }
 * Returns: { images: [dataUrl, ...], cost: 0, remaining, dailyRemaining, isPremium }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt ?? "").toString().trim();
  // Default to 2 images — 4 frequently hits Pollinations rate limits
  const count = Math.min(4, Math.max(1, Number(body.count ?? 2)));

  if (!prompt || prompt.length > 500) {
    return NextResponse.json({ error: "Prompt required (max 500 chars)" }, { status: 400 });
  }

  // Get admin-configured settings
  let settings: any = null;
  try {
    settings = await db.searchSettings.findUnique({ where: { id: 1 } });
  } catch {}

  const pollinationsUrl = settings?.pollinationsBaseUrl || DEFAULT_POLLINATIONS;
  const imageEnabled = settings?.imageSearchEnabled ?? true;
  if (!imageEnabled) {
    return NextResponse.json({ error: "Image search is disabled by admin" }, { status: 403 });
  }

  // Free rate-limit check (NO token deduction — images are free)
  const limit = await checkFreeRateLimit(user.id, "image_search");
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.error, code: limit.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
      { status: 402 }
    );
  }

  const baseUrl = pollinationsUrl.replace(/\/$/, "");
  const images: string[] = [];
  let lastError: string | null = null;

  for (let i = 0; i < count; i++) {
    // Pollinations rejects seed values > 999,999 with HTTP 500.
    // Use a small random seed in the valid range.
    const seed = Math.floor(Math.random() * 999_999) + i * 7;
    const url = `${baseUrl}/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true`;

    let attempt = 0;
    let fetched = false;
    while (attempt < 3 && !fetched) {
      attempt++;
      try {
        // Use AbortController (more compatible than AbortSignal.timeout)
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; StudyBuddyBot/1.0)",
            "Accept": "image/*,*/*",
          },
        });
        clearTimeout(tid);

        if (res.status === 429) {
          // Rate limited — wait and retry
          console.log(`image ${i+1} attempt ${attempt}: 429, retrying in ${1500 * attempt}ms`);
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        if (!res.ok) {
          console.log(`image ${i+1} attempt ${attempt}: HTTP ${res.status}`);
          lastError = `Pollinations returned ${res.status}`;
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }

        const buf = await res.arrayBuffer();
        if (buf.byteLength < 100) {
          // Too small — likely an error response
          lastError = "Pollinations returned empty image";
          continue;
        }

        const b64 = Buffer.from(buf).toString("base64");
        images.push(`data:image/jpeg;base64,${b64}`);
        fetched = true;
        console.log(`image ${i+1} fetched: ${buf.byteLength} bytes`);
      } catch (e: any) {
        console.error(`image ${i+1} attempt ${attempt} error:`, e?.message);
        lastError = e?.message ?? "fetch failed";
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    if (!fetched) {
      console.log(`image ${i+1} failed after 3 attempts: ${lastError}`);
    }

    // Small delay between successful fetches to avoid throttling
    if (fetched && i < count - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (images.length === 0) {
    // All failed — refund the daily slot
    await refundDailySlot(user.id, "image_search");
    return NextResponse.json(
      {
        error: "Image generation failed. Pollinations may be busy — please try again in a moment.",
        detail: lastError,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    images,
    cost: 0,
    remaining: user.tokenBalance,
    dailyRemaining: limit.remaining,
    isPremium: limit.isPremium,
    requested: count,
    generated: images.length,
  });
}
