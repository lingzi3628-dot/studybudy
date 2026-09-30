import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/migrate-users
 *
 * Scans all users and returns those whose profiles need migration:
 *   - track = "mixed" (legacy)
 *   - track = dev/data/ml/aiapp/web/backend/server (legacy dev tracks)
 *   - track = university/college/tvet but course is null
 *
 * Returns: { users: [{ id, email, name, track, course, grade, createdAt }] }
 */
export async function GET() {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  // Find users with legacy/broken profiles
  const users = await db.user.findMany({
    where: {
      OR: [
        { track: "mixed" },
        { track: "dev" },
        { track: "data" },
        { track: "ml" },
        { track: "aiapp" },
        { track: "web" },
        { track: "backend" },
        { track: "server" },
        // Higher-ed without a course
        { AND: [
          { track: { in: ["university", "college", "tvet"] } },
          { course: null },
        ]},
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      track: true,
      course: true,
      grade: true,
      createdAt: true,
      lastActive: true,
    },
    orderBy: { lastActive: "desc" },
    take: 500,
  }).catch(() => []);

  return NextResponse.json({
    users: users.map(u => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      lastActive: u.lastActive?.toISOString() || null,
    })),
    summary: {
      total: users.length,
      mixed: users.filter(u => u.track === "mixed").length,
      legacyDev: users.filter(u => ["dev", "data", "ml", "aiapp", "web", "backend", "server"].includes(u.track || "")).length,
      higherEdNoCourse: users.filter(u => ["university", "college", "tvet"].includes(u.track || "") && !u.course).length,
    },
  });
}

/**
 * POST /api/admin/migrate-users
 *
 * Bulk-update users' track + course.
 * Body: {
 *   updates: [{ userId, track, course?, grade? }]
 * }
 *
 * Each update sets the user's track + course (or grade for K-12/secondary).
 * Returns: { updated: number, failed: number }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    updates?: Array<{ userId: string; track: string; course?: string; grade?: string }>;
  };

  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return NextResponse.json({ error: "updates array is required" }, { status: 400 });
  }

  let updated = 0;
  let failed = 0;

  for (const u of body.updates) {
    if (!u.userId || !u.track) { failed++; continue; }
    const data: any = { track: u.track };
    if (u.course) data.course = u.course;
    if (u.grade) data.grade = u.grade;
    // If switching to K-12/secondary, clear course
    if (u.track === "k12" || u.track === "secondary") data.course = null;
    try {
      await db.user.update({ where: { id: u.userId }, data });
      updated++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ updated, failed });
}
