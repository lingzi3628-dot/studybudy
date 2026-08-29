import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/projects/[id]
 *
 * Phase 47 — Fetch a single project with all its files. Verifies the
 * caller owns the project (or the project is public).
 *
 * Response:
 *   { project: { id, buddyId, title, description, tags, isPublic, starCount,
 *                createdAt, updatedAt, conversationId, files: [{id, path, language, content, isEntry}] } }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      files: {
        orderBy: [{ isEntry: "desc" }, { path: "asc" }],
        select: { id: true, path: true, language: true, content: true, isEntry: true, updatedAt: true },
      },
    },
  });

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Auth: must own the project, OR the project must be public
  if (project.userId !== user.id && !project.isPublic) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({
    project: {
      id: project.id,
      userId: project.userId,
      buddyId: project.buddyId,
      title: project.title,
      description: project.description,
      tags: project.tags,
      isPublic: project.isPublic,
      starCount: project.starCount,
      conversationId: project.conversationId,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      files: project.files.map((f) => ({
        id: f.id,
        path: f.path,
        language: f.language,
        content: f.content,
        isEntry: f.isEntry,
        updatedAt: f.updatedAt.toISOString(),
      })),
    },
  });
}

/**
 * PATCH /api/projects/[id]
 * Body: { title?, description?, tags?, isPublic? }
 *
 * Update project metadata. Only the owner can do this.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    description?: string;
    tags?: string[];
    isPublic?: boolean;
  };

  // Verify ownership
  const existing = await db.project.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const data: any = {};
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    data.title = t.slice(0, 200);
  }
  if (body.description !== undefined) data.description = body.description?.slice(0, 1000) ?? null;
  if (body.tags !== undefined) data.tags = body.tags.slice(0, 20).map((t) => t.toString().slice(0, 50));
  if (body.isPublic !== undefined) data.isPublic = !!body.isPublic;

  const updated = await db.project.update({ where: { id }, data });
  return NextResponse.json({ project: { id: updated.id, title: updated.title, updatedAt: updated.updatedAt.toISOString() } });
}

/**
 * DELETE /api/projects/[id]
 *
 * Delete a project and all its files. Only the owner can do this.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const existing = await db.project.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Cascade delete will remove ProjectFile rows automatically
  await db.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
