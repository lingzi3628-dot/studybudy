import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTrack, getCourseByName } from "@/lib/education/catalog";

export const runtime = "nodejs";

/**
 * GET /api/user/course-switch — list the current user's course switch requests
 */
export async function GET() {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const requests = await db.courseSwitchRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  }).catch(() => []);

  return NextResponse.json({ requests });
}

/**
 * POST /api/user/course-switch — submit a new course switch request
 * Body: { toCourse: string }
 *
 * The user's current track stays the same — only the course changes.
 * Status starts as 'pending'. Admin reviews and approves/rejects.
 * On approval, user.course is updated to toCourse.
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({})) as { toCourse?: string; reason?: string };
  const toCourse = body.toCourse?.trim();
  if (!toCourse) {
    return NextResponse.json({ error: "toCourse is required" }, { status: 400 });
  }

  // Verify the course exists in the catalog
  const course = getCourseByName(toCourse);
  if (!course) {
    return NextResponse.json({ error: "Course not found in catalog" }, { status: 400 });
  }

  // Verify the course's track matches the user's current track
  const userTrack = (user as any).track || "k12";
  if (course.track !== userTrack) {
    return NextResponse.json({
      error: `This course is for the ${course.track} track, but you are on ${userTrack}. You can only switch courses within your current track.`,
    }, { status: 400 });
  }

  // If the user is already on this course, no-op
  if ((user as any).course === toCourse) {
    return NextResponse.json({ error: "You are already enrolled in this course" }, { status: 400 });
  }

  // Check there's no pending request already
  const existing = await db.courseSwitchRequest.findFirst({
    where: { userId: user.id, status: "pending" },
  }).catch(() => null);
  if (existing) {
    return NextResponse.json({
      error: "You already have a pending course switch request. Please wait for admin review.",
    }, { status: 400 });
  }

  // Create the request
  const request = await db.courseSwitchRequest.create({
    data: {
      userId: user.id,
      fromTrack: userTrack,
      fromCourse: (user as any).course || null,
      toTrack: userTrack,
      toCourse,
    },
  });

  return NextResponse.json({ request });
}
