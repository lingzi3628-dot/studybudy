import { NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";

export const runtime = "nodejs";

/** POST /api/admin/search-settings/test — test YouTube API key */
export async function POST() {
  await requireAdminJwt();

  let apiKey = "";
  try {
    const settings = await db.searchSettings.findUnique({ where: { id: 1 } });
    if (settings?.youtubeApiKeyEncrypted) {
      apiKey = decryptApiKey(settings.youtubeApiKeyEncrypted);
    }
  } catch {}

  if (!apiKey) {
    return NextResponse.json({ status: "error", error: "No YouTube API key configured" });
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=test&maxResults=1&key=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ status: "success", message: "YouTube API key works!", results: data.items?.length ?? 0 });
    } else {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ status: "error", error: `YouTube API returned ${res.status}: ${txt.slice(0, 200)}` });
    }
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e?.message ?? "Failed to test key" });
  }
}
