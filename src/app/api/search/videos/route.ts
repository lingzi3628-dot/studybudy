import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { checkAndDeductTokens } from "@/lib/monetization";

export const runtime = "nodejs";

/** POST /api/search/videos — search YouTube videos */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const query = (body.query ?? "").toString().trim();
  const maxResults = Math.min(10, Math.max(1, Number(body.maxResults ?? 5)));

  if (!query) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  // Get settings
  let settings: any = null;
  try {
    settings = await db.searchSettings.findUnique({ where: { id: 1 } });
  } catch {}

  const videoEnabled = settings?.videoSearchEnabled ?? true;
  if (!videoEnabled) {
    return NextResponse.json({ error: "Video search is disabled" }, { status: 403 });
  }

  // Get YouTube API key (decrypt if stored)
  let apiKey = "";
  if (settings?.youtubeApiKeyEncrypted) {
    apiKey = decryptApiKey(settings.youtubeApiKeyEncrypted);
  }
  if (!apiKey) {
    return NextResponse.json({ error: "YouTube API key not configured" }, { status: 503 });
  }

  // Check & deduct tokens
  const deduct = await checkAndDeductTokens(user.id, "video_search");
  if (!deduct.ok) {
    return NextResponse.json({ error: deduct.error }, { status: 402 });
  }

  // Call YouTube Data API
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 403) {
        return NextResponse.json({ error: "YouTube API quota exceeded or invalid key" }, { status: 503 });
      }
      return NextResponse.json({ error: `YouTube API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const videos = (data.items ?? []).map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title ?? "Untitled",
      thumbnail: `https://i.yimg.com/vi/${item.id?.videoId}/hqdefault.jpg`,
      channel: item.snippet?.channelTitle ?? "Unknown",
    })).filter((v: any) => v.videoId);

    return NextResponse.json({
      videos,
      cost: deduct.costTokens,
      remaining: deduct.newBalance,
      dailyRemaining: deduct.remaining,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 502 });
  }
}
