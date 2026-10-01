import { NextRequest, NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/user/onboarding
 * Body: { role, grade, subjects[], ambitions[], preferred_language, avatar_url, name }
 *
 * Saves onboarding answers. Sets onboarding_completed = true.
 * If already onboarded, returns 400.
 */
export async function POST(req: NextRequest) {
  const csrfError = verifyCsrf(req);
  if (csrfError) return csrfError;
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));

  // Look up the current state
  const existing = await db.user.findUnique({
    where: { id: user.id },
    select: { onboardingCompleted: true },
  });

  if (existing?.onboardingCompleted) {
    return NextResponse.json(
      { error: "Onboarding already completed. Use PUT /api/user/profile to update individual fields." },
      { status: 400 }
    );
  }

  // Build update payload — only set fields that are actually provided
  const data: any = { onboardingCompleted: true };
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.grade === "string") data.grade = body.grade;
  // Phase 51 — save the education track (k12 | secondary | university | college | tvet | dev | mixed)
  if (typeof body.track === "string") data.track = body.track;
  // Phase 85.3 — save the course name (for university/college/tvet users)
  if (typeof body.course === "string") data.course = body.course;
  if (Array.isArray(body.subjects)) data.subjects = body.subjects.filter((s: any) => typeof s === "string");
  if (Array.isArray(body.ambitions)) data.ambitions = body.ambitions.filter((s: any) => typeof s === "string");
  if (typeof body.preferred_language === "string") data.learningLanguage = body.preferred_language;
  if (typeof body.avatar_url === "string") data.avatarUrl = body.avatar_url;

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      grade: true,
      subjects: true,
      ambitions: true,
      learningLanguage: true,
      avatarUrl: true,
      onboardingCompleted: true,
    },
  });

  return NextResponse.json({ user: updated });
}
