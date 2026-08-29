import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/projects/[id]/files
 *
 * Phase 47 — List all files in a project (without contents — use
 * /api/projects/[id] for the full project with file contents, or
 * GET /api/projects/[id]/files?path=... for a single file with content).
 *
 * Response:
 *   { files: [{ id, path, language, isEntry, updatedAt }] }
 *
 * Query params:
 *   path=<filename>     — return only the file at this path, with content
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const url = new URL(req.url);
  const pathFilter = url.searchParams.get("path");

  // Verify access
  const project = await db.project.findUnique({
    where: { id },
    select: { userId: true, isPublic: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.userId !== user.id && !project.isPublic) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (pathFilter) {
    // Single file with content
    const file = await db.projectFile.findUnique({
      where: { projectId_path: { projectId: id, path: pathFilter } },
      select: { id: true, path: true, language: true, content: true, isEntry: true, updatedAt: true },
    });
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
    return NextResponse.json({ file: { ...file, updatedAt: file.updatedAt.toISOString() } });
  }

  // All files (no content — too heavy for a list view)
  const files = await db.projectFile.findMany({
    where: { projectId: id },
    orderBy: [{ isEntry: "desc" }, { path: "asc" }],
    select: { id: true, path: true, language: true, isEntry: true, updatedAt: true },
  });

  return NextResponse.json({
    files: files.map((f) => ({ ...f, updatedAt: f.updatedAt.toISOString() })),
  });
}

/**
 * PUT /api/projects/[id]/files
 * Body: { files: [{ path, language?, content, isEntry? }] }
 *
 * Bulk upsert files in a project. For each file:
 *   - If a ProjectFile with the same path exists, update it.
 *   - Otherwise, create it.
 *
 * The `isEntry` flag is set on at most ONE file per project — if any file
 * has isEntry=true, all others are reset to false (atomic in the same tx).
 *
 * Response: { ok: true, updated: <count> }
 *
 * Used by the code editor (Phase 48+) to save the user's changes.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    files: Array<{ path: string; language?: string; content: string; isEntry?: boolean }>;
  };

  if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "files array required" }, { status: 400 });
  }
  if (body.files.length > 100) {
    return NextResponse.json({ error: "Too many files (max 100 per request)" }, { status: 400 });
  }

  // Verify ownership
  const project = await db.project.findUnique({ where: { id }, select: { userId: true } });
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Validate each file
  for (const f of body.files) {
    if (!f.path || typeof f.path !== "string") {
      return NextResponse.json({ error: "Each file requires a 'path' field" }, { status: 400 });
    }
    if (f.path.length > 500) {
      return NextResponse.json({ error: `File path too long: ${f.path.slice(0, 50)}…` }, { status: 400 });
    }
    if (typeof f.content !== "string") {
      return NextResponse.json({ error: `File ${f.path}: content must be a string` }, { status: 400 });
    }
  }

  // Find the new entry file (if any)
  const newEntryFile = body.files.find((f) => f.isEntry);

  await db.$transaction(async (tx) => {
    // If a new entry file is being set, clear the old isEntry flag
    if (newEntryFile) {
      await tx.projectFile.updateMany({
        where: { projectId: id, isEntry: true },
        data: { isEntry: false },
      });
    }

    // Upsert each file
    for (const f of body.files!) {
      await tx.projectFile.upsert({
        where: { projectId_path: { projectId: id, path: f.path } },
        create: {
          projectId: id,
          path: f.path,
          language: f.language ?? "text",
          content: f.content,
          isEntry: !!f.isEntry,
        },
        update: {
          language: f.language ?? "text",
          content: f.content,
          isEntry: !!f.isEntry,
        },
      });
    }

    // Bump the project's updatedAt timestamp
    await tx.project.update({ where: { id }, data: { updatedAt: new Date() } });
  });

  return NextResponse.json({ ok: true, updated: body.files.length });
}

/**
 * DELETE /api/projects/[id]/files?path=<filename>
 *
 * Delete a single file from a project. Only the owner can do this.
 * The entry file cannot be deleted — the user must first set another file
 * as the entry point.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path query param required" }, { status: 400 });

  const project = await db.project.findUnique({ where: { id }, select: { userId: true } });
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Don't allow deleting the entry file
  const file = await db.projectFile.findUnique({
    where: { projectId_path: { projectId: id, path } },
    select: { id: true, isEntry: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (file.isEntry) {
    return NextResponse.json({
      error: "Cannot delete the entry file. Set another file as the entry point first.",
    }, { status: 400 });
  }

  await db.projectFile.delete({ where: { id: file.id } });
  return NextResponse.json({ ok: true });
}
