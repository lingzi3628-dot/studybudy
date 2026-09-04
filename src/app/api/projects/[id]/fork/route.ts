import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/projects/[id]/fork
 *
 * Phase 60 — Fork a public project. Creates a copy of the project
 * (with all files) under the current user's account.
 *
 * The forked project:
 *   - buddyId: same as original
 *   - title: "{original title} (fork)"
 *   - isPublic: false (user can make it public later)
 *   - tags: original tags + "fork"
 *
 * Returns the new project.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const original = await db.project.findUnique({
    where: { id },
    include: { files: true },
  });

  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!original.isPublic && original.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Create the fork
  const forked = await db.project.create({
    data: {
      userId: user.id,
      buddyId: original.buddyId,
      title: `${original.title} (fork)`,
      description: original.description,
      tags: [...original.tags, "fork"],
      isPublic: false,
      files: {
        create: original.files.map((f) => ({
          path: f.path,
          language: f.language,
          content: f.content,
          isEntry: f.isEntry,
        })),
      },
    },
    include: { files: { select: { id: true, path: true } } },
  });

  return NextResponse.json({
    project: {
      id: forked.id,
      buddyId: forked.buddyId,
      title: forked.title,
      fileCount: forked.files.length,
    },
  });
}
