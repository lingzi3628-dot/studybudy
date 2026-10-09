import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/explore/[id]/fork
 *
 * Copies an ExploreProject's files to the user's Project list.
 * The user can then edit the project in Web Builder / Dev Buddy.
 *
 * No GitHub account needed — this is an in-app fork.
 * If the user HAS a connected GitHub account, we also create a real
 * GitHub repo (via the GitHub API) and push the files.
 *
 * Body:
 *   - buddyId: "web" | "dev" (which workspace to open the fork in)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const buddyId = body?.buddyId === "dev" ? "dev" : "web";

  // Fetch the ExploreProject
  const exploreProject = await db.exploreProject.findUnique({
    where: { id },
  }).catch(() => null);

  if (!exploreProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!exploreProject.files || typeof exploreProject.files !== "object") {
    return NextResponse.json({ error: "Project has no files to fork" }, { status: 422 });
  }

  const filesMap = exploreProject.files as Record<string, string>;

  // Create a new Project for the user
  const projectTitle = `${exploreProject.title} (fork)`;
  const project = await db.project.create({
    data: {
      userId: user.id,
      buddyId,
      title: projectTitle,
      description: exploreProject.description ?? `Forked from ${exploreProject.title}`,
      tags: Array.isArray(exploreProject.tags) ? exploreProject.tags : [],
    },
  });

  // Create ProjectFile rows from the base64 files
  const fileEntries = Object.entries(filesMap);
  for (const [filePath, base64] of fileEntries) {
    // Decode base64 to text (for code files) or keep as-is for binary
    let content: string;
    try {
      content = Buffer.from(base64, "base64").toString("utf-8");
    } catch {
      content = base64; // fallback
    }

    // Detect language from file extension
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const languageMap: Record<string, string> = {
      html: "html", htm: "html",
      css: "css", scss: "scss",
      js: "javascript", mjs: "javascript",
      ts: "typescript", tsx: "typescript",
      jsx: "javascript",
      json: "json",
      md: "markdown",
      py: "python",
      sql: "sql",
      go: "go",
      rs: "rust",
      java: "java",
      c: "c", cpp: "cpp",
      sh: "bash",
      yaml: "yaml", yml: "yaml",
      xml: "xml",
      svg: "xml",
      txt: "text",
    };

    await db.projectFile.create({
      data: {
        projectId: project.id,
        path: filePath,
        language: languageMap[ext] || "text",
        content,
        isEntry: filePath === exploreProject.entryFile,
      },
    });
  }

  // Increment forkCount on the original ExploreProject
  await db.exploreProject.update({
    where: { id },
    data: { forkCount: { increment: 1 } },
  }).catch(() => {});

  // Check if user has GitHub connected — if so, create a real repo
  let githubRepoUrl: string | null = null;
  if (user.githubTokenEncrypted) {
    try {
      const { decryptApiKey } = await import("@/lib/crypto");
      const token = decryptApiKey(user.githubTokenEncrypted);
      if (token) {
        const repoName = projectTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50);

        // Create repo via GitHub API
        const createRes = await fetch("https://api.github.com/user/repos", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: repoName,
            description: `Forked from ${exploreProject.title} on Study Buddy AI`,
            private: false,
            auto_init: true,
          }),
        });

        if (createRes.ok) {
          const repo = await createRes.json();
          githubRepoUrl = repo.html_url;

          // Push files to the repo via the GitHub Contents API
          for (const [filePath, base64] of fileEntries) {
            // Skip files that are too large for the Contents API (1MB limit)
            if (base64.length > 1_300_000) continue;

            await fetch(`https://api.github.com/repos/${repo.full_name}/contents/${filePath}`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: `Add ${filePath}`,
                content: base64,
              }),
            }).catch(() => {}); // best-effort — don't fail the fork if some files fail
          }
        }
      }
    } catch {
      // GitHub push failed — the in-app fork still succeeded
    }
  }

  return NextResponse.json({
    ok: true,
    project: {
      id: project.id,
      title: project.title,
      buddyId: project.buddyId,
    },
    githubRepoUrl, // null if GitHub not connected or push failed
  });
}
