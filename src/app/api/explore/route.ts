import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/explore — list explore projects relevant to the current user
 *
 * Filter logic:
 *   1. Only published projects (isPublished = true)
 *   2. Match the user's education track (k12 | secondary | university | college | tvet | dev)
 *   3. Match the user's gradeLevel if set; otherwise show projects with gradeLevel = null (general)
 *   4. If ?subject=X is provided, filter by subject
 *
 * Query params:
 *   ?track=... — override user's track (admin preview)
 *   ?gradeLevel=... — override user's grade
 *   ?subject=... — filter by subject
 *   ?category=... — filter by category
 *
 * Returns: { projects: [...] }
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const queryTrack = url.searchParams.get("track");
  const queryGrade = url.searchParams.get("gradeLevel");
  const subject = url.searchParams.get("subject");
  const category = url.searchParams.get("category");

  // Get current user (optional — Explore is viewable even without auth for preview)
  // Phase 12 fix — make auth completely optional. Previously, getCurrentUser()
  // was called TWICE and if the user's token expired, the second call would
  // throw an error that crashed the route (returning 500 instead of projects).
  // Now we wrap BOTH calls in a single try/catch + only call once.
  let userTrack: string | null = null;
  let userGrade: string | null = null;
  let userCourse: string | null = null;
  try {
    const user = await getCurrentUser();
    if (user) {
      userTrack = (user as any).track || null;
      userGrade = (user as any).grade || null;
      userCourse = (user as any).course || null;
    }
  } catch {
    // Not logged in or token expired — anonymous browsing allowed
    // Use defaults (k12 track, no grade filter)
  }

  const track = queryTrack || userTrack || "k12";
  const gradeLevel = queryGrade || userGrade;

  // Build where clause
  const where: any = {
    isPublished: true,
    track,
  };

  if (track === "k12" || track === "secondary") {
    // Match either the exact grade OR null (general for track)
    if (gradeLevel) {
      where.OR = [{ gradeLevel }, { gradeLevel: null }];
    } else {
      where.gradeLevel = null;
    }
  } else if (track === "university" || track === "college" || track === "tvet") {
    // Filter by course: user's course OR null (general for track)
    if (userCourse) {
      where.OR = [{ course: userCourse }, { course: null }];
    } else {
      where.course = null;
    }
  }

  if (subject && subject !== "All") where.subject = subject;
  if (category && category !== "All") where.category = category;

  const projects = await db.exploreProject.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { starCount: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      description: true,
      track: true,
      gradeLevel: true,
      subject: true,
      category: true,
      tags: true,
      projectUrl: true,
      thumbnailUrl: true,
      fileSize: true,
      viewCount: true,
      forkCount: true,
      starCount: true,
      isFeatured: true,
      authorId: true,
      createdAt: true,
    },
  }).catch(() => []);

  return NextResponse.json({
    projects: projects.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    filter: { track, gradeLevel, subject, category },
  });
}
