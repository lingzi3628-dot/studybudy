import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/user/profile
 * Returns current user's profile (no sensitive fields).
 */
export async function GET() {
  const user = await getCurrentUser();
  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      banned: true,
      grade: true,
      track: true,
      subjects: true,
      ambitions: true,
      learningLanguage: true,
      avatarUrl: true,
      notificationsEnabled: true,
      darkMode: true,
      onboardingCompleted: true,
      lastLogin: true,
      lastActive: true,
      createdAt: true,
      encryptedApiKey: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      ...profile,
      hasApiKey: Boolean(profile.encryptedApiKey),
      encryptedApiKey: undefined,
    },
  });
}

/**
 * PUT /api/user/profile
 * Body: { name?, grade?, subjects?, ambitions?, preferred_language?, avatar_url?, notifications_enabled?, dark_mode? }
 *
 * Updates individual profile fields. Does NOT change onboarding_completed.
 * Use POST /api/user/onboarding to complete onboarding.
 */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name || null;
  if (typeof body.grade === "string") data.grade = body.grade || null;
  // Phase 51 — update the education track (k12 | dev | data | ml | tvet | mixed)
  if (typeof body.track === "string") data.track = body.track || "k12";
  if (Array.isArray(body.subjects)) data.subjects = body.subjects.filter((s: any) => typeof s === "string");
  if (Array.isArray(body.ambitions)) data.ambitions = body.ambitions.filter((s: any) => typeof s === "string");
  if (typeof body.preferred_language === "string") data.learningLanguage = body.preferred_language;
  if (typeof body.avatar_url === "string") data.avatarUrl = body.avatar_url || null;
  if (typeof body.notifications_enabled === "boolean") data.notificationsEnabled = body.notifications_enabled;
  if (typeof body.dark_mode === "boolean") data.darkMode = body.dark_mode;

  // Never let users self-promote to admin or unban themselves
  if (body.role === "admin" || body.role === "user") data.role = body.role;
  if (body.banned !== undefined) {
    return NextResponse.json(
      { error: "Cannot self-ban/unban. Contact an admin." },
      { status: 403 }
    );
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      banned: true,
      grade: true,
      track: true,
      subjects: true,
      ambitions: true,
      learningLanguage: true,
      avatarUrl: true,
      notificationsEnabled: true,
      darkMode: true,
      onboardingCompleted: true,
    },
  });

  return NextResponse.json({ user: updated });
}
