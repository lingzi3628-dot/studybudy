import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/learning-path-templates — list all templates (published + unpublished)
 */
export async function GET() {
  await requireAdminJwt();
  const templates = await db.learningPath.findMany({
    where: { isTemplate: true },
    orderBy: { createdAt: "desc" },
    include: {
      modules: { select: { id: true, title: true, _count: { select: { items: true } } } },
      _count: { select: { modules: true } },
    },
  }).catch(() => []);
  return NextResponse.json({ templates });
}

/**
 * POST /api/admin/learning-path-templates — create a new template
 * Body: { skill, level, goal?, subject?, isPublished?, coverImageUrl? }
 *
 * Saves path with isTemplate=true, userId=null.
 * Modules/items can be added via separate endpoints or AI generation.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({})) as {
    skill?: string;
    level?: string;
    goal?: string;
    subject?: string;
    isPublished?: boolean;
    coverImageUrl?: string;
  };

  const skill = (body.skill ?? "").toString().trim();
  const level = (body.level ?? "beginner").toString().trim();
  const goal = (body.goal ?? "").toString().trim() || null;
  const subject = (body.subject ?? "").toString().trim() || null;

  if (!skill) {
    return NextResponse.json({ error: "Skill required" }, { status: 400 });
  }

  const template = await db.learningPath.create({
    data: {
      userId: null,
      skill,
      level,
      goal,
      subject,
      roadmap: { modules: [] },
      status: "active",
      isTemplate: true,
      isPublished: body.isPublished === true,
      coverImageUrl: body.coverImageUrl ?? null,
    },
  });

  await logAdminActionViaJwt(admin, "template.create", { id: template.id, skill });
  return NextResponse.json({ template });
}
