import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidBuddyId, DEFAULT_BUDDY_ID } from "@/lib/buddies/registry";

export const runtime = "nodejs";

/**
 * GET /api/projects?buddyId=...
 *
 * Phase 47 — List the current user's saved projects.
 * Optional `buddyId` query param filters to projects from a specific buddy.
 *
 * Response:
 *   { projects: [{ id, buddyId, title, description, tags, isPublic,
 *                   starCount, fileCount, createdAt, updatedAt, lastFile }] }
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const buddyIdParam = url.searchParams.get("buddyId");

  const where: any = { userId: user.id };
  if (buddyIdParam && isValidBuddyId(buddyIdParam)) {
    where.buddyId = buddyIdParam;
  }

  const projects = await db.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      files: {
        select: { id: true, path: true, isEntry: true, updatedAt: true },
        orderBy: { path: "asc" },
      },
    },
  });

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      buddyId: p.buddyId,
      title: p.title,
      description: p.description,
      tags: p.tags,
      isPublic: p.isPublic,
      starCount: p.starCount,
      conversationId: p.conversationId,
      fileCount: p.files.length,
      // The "entry file" — shown as the preview filename in the project list.
      // Falls back to the first file alphabetically if no isEntry flag set.
      entryFile: p.files.find((f) => f.isEntry)?.path ?? p.files[0]?.path ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

/**
 * POST /api/projects
 * Body: { buddyId?, title, description?, tags?, files?: [{path, language, content, isEntry?}] }
 *
 * Create a new project with optional initial files. Defaults:
 *   buddyId: "dev" if not provided
 *   files:   empty array if not provided (the user can add files later via PUT /api/projects/[id]/files)
 *
 * Response: { project: {...} }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    buddyId?: string;
    title?: string;
    description?: string;
    tags?: string[];
    files?: Array<{ path: string; language?: string; content: string; isEntry?: boolean }>;
    conversationId?: string;
  };

  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "title too long (max 200)" }, { status: 400 });

  const buddyId = body.buddyId && isValidBuddyId(body.buddyId) ? body.buddyId : DEFAULT_BUDDY_ID;
  const tags = Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t) => t.toString().slice(0, 50)) : [];

  // Create the project + initial files in one transaction
  const project = await db.project.create({
    data: {
      userId: user.id,
      buddyId,
      title,
      description: body.description?.slice(0, 1000) ?? null,
      tags,
      conversationId: body.conversationId ?? null,
      files: body.files && body.files.length > 0 ? {
        create: body.files.slice(0, 100).map((f) => ({
          path: f.path.slice(0, 500),
          language: f.language ?? "text",
          content: f.content,
          isEntry: !!f.isEntry,
        })),
      } : undefined,
    },
    include: { files: { select: { id: true, path: true, language: true, isEntry: true } } },
  });

  return NextResponse.json({
    project: {
      id: project.id,
      buddyId: project.buddyId,
      title: project.title,
      description: project.description,
      tags: project.tags,
      conversationId: project.conversationId,
      fileCount: project.files.length,
      entryFile: project.files.find((f) => f.isEntry)?.path ?? project.files[0]?.path ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
  });
}
