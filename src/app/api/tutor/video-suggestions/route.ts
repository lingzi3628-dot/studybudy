import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/tutor/video-suggestions
 *
 * Uses web search to find relevant YouTube videos for the user's
 * course/grade/track. Returns up to 5 video cards.
 * NOT cached (returns different results each call) so videos are
 * always fresh — like Netflix recommendations.
 */
export async function GET() {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const track = (user as any).track || "k12";
  const course = (user as any).course;
  const grade = (user as any).grade;

  // Build search query based on user's profile
  let searchQuery = "educational video";
  if (course) searchQuery = `${course} tutorial explained`;
  else if (grade) searchQuery = `${grade} lesson Kenya`;
  else if (track === "tvet") searchQuery = "TVET technical training tutorial";
  else if (track === "dev") searchQuery = "coding tutorial programming";

  try {
    // Use the z-ai-web-dev-sdk's web search to find YouTube videos
    const { getZaiClient } = await import("@/lib/zai-client");
    const zai = await getZaiClient();
    const results = await zai.functions.invoke("web_search", {
      query: `${searchQuery} site:youtube.com`,
    });

    // Parse results — z-ai returns an array of search results
    const items: any[] = Array.isArray(results) ? results : ((results as any)?.results || []);
    const videos: any[] = [];

    for (const item of items) {
      const url = item?.url || item?.link || "";
      const title = item?.title || item?.name || "";
      const snippet = item?.snippet || item?.description || "";

      // Extract YouTube video ID
      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch && title) {
        videos.push({
          id: ytMatch[1],
          title: title.replace(/ - YouTube$/i, "").trim(),
          snippet: snippet.slice(0, 100),
          thumbnail: `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`,
        });
      }
      if (videos.length >= 5) break;
    }

    return NextResponse.json({ videos, query: searchQuery });
  } catch (e: any) {
    // Fallback: use a curated list of educational YouTube channels
    const fallbackVideos = getFallbackVideos(course || grade || track);
    return NextResponse.json({ videos: fallbackVideos, query: searchQuery, fallback: true });
  }
}

function getFallbackVideos(topic: string): any[] {
  // Curated educational YouTube channels — always available even if search fails
  const channels = [
    { id: "UCapWSQZSl1K8GMp9z0GmeDw", name: "FreeCodeCamp" },
    { id: "UCb6bHC6zc7W2Umg3Gm1hgyw", name: "Khan Academy" },
    { id: "UCYqMRVFeODJQlFnfNDBlJHg", name: "CrashCourse" },
  ];
  return channels.map(c => ({
    id: c.id,
    title: `${topic} — ${c.name}`,
    snippet: "Educational content from " + c.name,
    thumbnail: `https://img.youtube.com/vi/${c.id}/mqdefault.jpg`,
  }));
}
