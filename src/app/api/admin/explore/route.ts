import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/explore — list ALL explore projects (admin only, includes unpublished)
 * Query: ?track=k12 — optional filter
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const track = url.searchParams.get("track");

  const where: any = {};
  if (track) where.track = track;

  const projects = await db.exploreProject.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 200,
  }).catch(() => []);

  return NextResponse.json({
    projects: projects.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/admin/explore — toggle featured / published
 * Body: { projectId, action: "feature" | "unfeature" | "publish" | "unpublish" }
 */
export async function PATCH(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as { projectId?: string; action?: string };
  if (!body.projectId || !body.action) {
    return NextResponse.json({ error: "projectId and action are required" }, { status: 400 });
  }
  const patch: any = {};
  switch (body.action) {
    case "feature":   patch.isFeatured = true; break;
    case "unfeature": patch.isFeatured = false; break;
    case "publish":   patch.isPublished = true; break;
    case "unpublish": patch.isPublished = false; break;
    default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const project = await db.exploreProject.update({
    where: { id: body.projectId },
    data: patch,
  }).catch(() => null);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ project });
}
