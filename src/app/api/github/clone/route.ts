import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/github/clone
 *
 * Clones a GitHub repo into a Study Buddy project.
 * Uses the GitHub API to fetch all files from the repo's default branch.
 * No git clone needed — we use the Contents API + Trees API.
 *
 * Body:
 *   - repoUrl: "https://github.com/user/repo" or "user/repo"
 *   - buddyId: "web" | "dev" (which workspace to open in)
 *
 * If the user has a connected GitHub account, uses their token (higher rate
 * limit). Otherwise, uses unauthenticated requests (60 req/hour limit).
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const repoUrl = (body?.repoUrl ?? "").toString().trim();
  const buddyId = body?.buddyId === "dev" ? "dev" : "web";

  if (!repoUrl) return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });

  // Parse the repo URL — accept "https://github.com/user/repo" or "user/repo"
  let repo: string;
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  if (match) {
    repo = match[1].replace(/\.git$/, "");
  } else if (repoUrl.includes("/") && !repoUrl.startsWith("http")) {
    repo = repoUrl.replace(/\.git$/, "");
  } else {
    return NextResponse.json({ error: "Invalid GitHub URL. Use https://github.com/user/repo or user/repo" }, { status: 400 });
  }

  // Get GitHub token (if user has connected their account)
  let githubToken: string | null = null;
  if (user.githubTokenEncrypted) {
    try {
      const { decryptApiKey } = await import("@/lib/crypto");
      githubToken = decryptApiKey(user.githubTokenEncrypted);
    } catch {}
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "StudyBuddy-AI",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  // Step 1: Get the repo info (name, default branch)
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!repoRes.ok) {
    if (repoRes.status === 404) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    return NextResponse.json({ error: `GitHub API error: ${repoRes.status}` }, { status: 502 });
  }
  const repoInfo = await repoRes.json();
  const repoName = repoInfo.name;
  const defaultBranch = repoInfo.default_branch || "main";

  // Step 2: Get the full file tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${defaultBranch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) {
    return NextResponse.json({ error: `Failed to fetch repo tree: ${treeRes.status}` }, { status: 502 });
  }
  const treeData = await treeRes.json();
  const tree = Array.isArray(treeData.tree) ? treeData.tree : [];

  // Step 3: Filter to files only (skip directories, submodules, symlinks)
  // Also skip files > 1MB (Contents API limit) and common non-code files
  const MAX_FILES = 100; // cap to prevent rate limiting
  const SKIP_DIRS = [".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", "venv"];
  const SKIP_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".mp3", ".zip", ".tar", ".gz", ".pdf"];

  const fileEntries = tree
    .filter((item: any) => {
      if (item.type !== "blob") return false;
      if (item.size > 1_000_000) return false; // skip files > 1MB
      const path = item.path;
      if (SKIP_DIRS.some(d => path.startsWith(d + "/") || path === d)) return false;
      if (SKIP_EXTS.some(ext => path.toLowerCase().endsWith(ext))) return false;
      return true;
    })
    .slice(0, MAX_FILES);

  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "No code files found in this repository" }, { status: 422 });
  }

  // Step 4: Create a new Project
  const projectTitle = `${repoName} (cloned)`;
  const project = await db.project.create({
    data: {
      userId: user.id,
      buddyId,
      title: projectTitle,
      description: `Cloned from github.com/${repo}`,
      tags: [repo.split("/")[0]],
    },
  });

  // Step 5: Fetch each file's content via the Contents API
  const languageMap: Record<string, string> = {
    html: "html", htm: "html", css: "css", scss: "scss",
    js: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript",
    jsx: "javascript", json: "json", md: "markdown", py: "python", sql: "sql",
    go: "go", rs: "rust", java: "java", c: "c", cpp: "cpp", sh: "bash",
    yaml: "yaml", yml: "yaml", xml: "xml", svg: "xml", txt: "text",
  };

  let entryFile: string | null = null;
  let filesCreated = 0;

  for (const entry of fileEntries) {
    try {
      const fileRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${entry.path}?ref=${defaultBranch}`,
        { headers }
      );
      if (!fileRes.ok) continue;

      const fileData = await fileRes.json();
      if (fileData.encoding !== "base64" || !fileData.content) continue;

      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      const ext = entry.path.split(".").pop()?.toLowerCase() || "";

      // Detect entry file (index.html or first .html file)
      if (!entryFile && (entry.path === "index.html" || entry.path.endsWith(".html"))) {
        entryFile = entry.path;
      }

      await db.projectFile.create({
        data: {
          projectId: project.id,
          path: entry.path,
          language: languageMap[ext] || "text",
          content,
          isEntry: entry.path === "index.html",
        },
      });
      filesCreated++;
    } catch {
      // Skip files that fail to fetch
    }
  }

  return NextResponse.json({
    ok: true,
    project: {
      id: project.id,
      title: project.title,
      buddyId: project.buddyId,
    },
    filesCloned: filesCreated,
    totalFilesInRepo: fileEntries.length,
    entryFile,
  });
}
