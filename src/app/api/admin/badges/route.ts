import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/badges — list all badges */
export async function GET() {
  await requireAdminJwt();
  const badges = await db.badge.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { userBadges: true } } },
  }).catch(() => []);
  return NextResponse.json({ badges });
}

/** POST /api/admin/badges — create a new badge */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    slug?: string;
    description?: string;
    icon?: string;
    criteria?: any;
  };

  const name = (body.name ?? "").toString().trim();
  const slug = (body.slug ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_");
  if (!name || !slug) {
    return NextResponse.json({ error: "Name and slug required" }, { status: 400 });
  }

  const existing = await db.badge.findUnique({ where: { slug } }).catch(() => null);
  if (existing) {
    return NextResponse.json({ error: "Badge with this slug already exists" }, { status: 409 });
  }

  const badge = await db.badge.create({
    data: {
      name,
      slug,
      description: body.description ? String(body.description).slice(0, 300) : null,
      icon: body.icon ? String(body.icon).slice(0, 10) : "🏅",
      criteria: body.criteria ?? null,
    },
  });

  await logAdminActionViaJwt(admin, "badge.create", { id: badge.id, slug });
  return NextResponse.json({ badge });
}
