import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/learning-path-templates/[id] */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdminJwt();
  const { id } = await params;
  const template = await db.learningPath.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { orderIndex: "asc" },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      },
    },
  }).catch(() => null);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

/** PUT /api/admin/learning-path-templates/[id] — update template metadata */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminJwt();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.skill === "string") data.skill = body.skill;
  if (typeof body.level === "string") data.level = body.level;
  if (typeof body.goal === "string") data.goal = body.goal || null;
  if (typeof body.subject === "string") data.subject = body.subject || null;
  if (typeof body.isPublished === "boolean") data.isPublished = body.isPublished;
  if (typeof body.coverImageUrl === "string") data.coverImageUrl = body.coverImageUrl || null;
  if (typeof body.status === "string") data.status = body.status;

  const updated = await db.learningPath.update({
    where: { id },
    data,
  }).catch((e: any) => {
    console.error("template update failed:", e?.message);
    return null;
  });

  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  await logAdminActionViaJwt(admin, "template.update", { id, data });
  return NextResponse.json({ template: updated });
}

/** DELETE /api/admin/learning-path-templates/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminJwt();
  const { id } = await params;

  await db.learningPath.delete({ where: { id } }).catch(() => null);
  await logAdminActionViaJwt(admin, "template.delete", { id });
  return NextResponse.json({ ok: true });
}
