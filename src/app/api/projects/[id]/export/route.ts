import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/projects/[id]/export — Phase 54 (WebBuddy)
 *
 * Downloads the whole project as a ZIP archive. Used by WebBuilderScreen's
 * "Download ZIP" button (also works for dev/data projects — the format is
 * generic: every ProjectFile becomes an entry at its stored path).
 *
 * Response: application/zip attachment named <project-slug>.zip
 * Only the owner (or a public project) can export.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const project = await db.project.findUnique({
    where: { id },
    select: { userId: true, isPublic: true, title: true, buddyId: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.userId !== user.id && !project.isPublic) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const files = await db.projectFile.findMany({
    where: { projectId: id },
    select: { path: true, content: true },
    orderBy: { path: "asc" },
  });
  if (files.length === 0) {
    return NextResponse.json({ error: "Project has no files to export" }, { status: 400 });
  }

  // Lazy-load archiver so it never sits in the serverless cold-start path.
  const archiver = (await import("archiver")).default;

  const safeTitle =
    project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project";

  const chunks: Buffer[] = [];
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    archive.on("data", (c: Buffer) => chunks.push(c));
    archive.on("end", () => resolve());
    archive.on("error", reject);
  });

  for (const f of files) {
    archive.append(f.content, { name: f.path });
  }
  // Small README so the folder isn't cryptic when unzipped later.
  archive.append(
    `# ${project.title}\n\nExported from StudyBuddy ${project.buddyId} on ${new Date().toISOString()}.\nEntry file: index.html (websites) or the ★-marked file.\n`,
    { name: "STUDYBUDDY.md" }
  );
  void archive.finalize();
  await done;

  const zip = Buffer.concat(chunks);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
