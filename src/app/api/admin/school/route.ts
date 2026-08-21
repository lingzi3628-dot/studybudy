import { NextRequest, NextResponse } from "next/server";
import {
  requireAdminJwt as requireAdmin,
  logAdminActionViaJwt as logAdminAction,
} from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/school
 *
 * Lists all School rows (newest first) with student counts. Used by the
 * admin Schools management panel.
 */
export async function GET() {
  await requireAdmin();
  const schools = await db.school.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { students: true } } },
  }).catch(() => []);
  return NextResponse.json({ schools });
}

/**
 * POST /api/admin/school
 * Body: { name, level, county? }
 *
 * Creates a new School. `name` must be unique. `level` must be
 * 'primary' or 'secondary'.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    level?: string;
    county?: string;
  };

  const name = (body.name ?? "").toString().trim();
  const level = (body.level ?? "").toString().trim().toLowerCase();
  const county = (body.county ?? "").toString().trim() || null;

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }
  if (level !== "primary" && level !== "secondary") {
    return NextResponse.json(
      { error: "level must be 'primary' or 'secondary'" },
      { status: 400 }
    );
  }

  try {
    const school = await db.school.create({
      data: { name, level, county },
    });
    await logAdminAction(admin, "school.create", {
      schoolId: school.id,
      name,
      level,
    });
    return NextResponse.json({ school });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A school with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Create failed.", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
