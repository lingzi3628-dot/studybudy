import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { parseFormData, extractZipToBase64 } from "@/lib/upload-helpers";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdir, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — enough for npm install + build

/**
 * POST /api/admin/explore/upload
 *
 * Accepts a ZIP file + metadata. Auto-detects if it's a:
 *   1. Static site (plain HTML/CSS/JS) → serve directly
 *   2. React/Vite/Next.js project (source code) → auto-build → serve dist/
 *
 * For React/Vite projects:
 *   - Extracts the zip to a temp directory
 *   - Runs `npm install` + `npm run build` (or `vite build`)
 *   - Reads the dist/ folder
 *   - Base64-encodes the built files
 *   - Stores in DB — the built site renders perfectly
 *
 * Build timeout: 4 minutes (leaves 1 min buffer for upload + DB write)
 * If build fails, falls back to storing the source + showing "build required" page
 */
export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdminJwt(); }
  catch { return NextResponse.json({ error: "Admin required" }, { status: 401 }); }

  const parsed = await parseFormData(req, {
    maxFileSize: 4 * 1024 * 1024,
    allowedExts: ["zip"],
  });
  if (parsed instanceof NextResponse) return parsed;

  const { file, fields } = parsed;

  const title = (fields.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const description = (fields.description ?? "").trim() || null;
  const track = (fields.track ?? "k12").trim();
  const gradeLevel = (fields.gradeLevel ?? "").trim() || null;
  const subject = (fields.subject ?? "General").trim();
  const course = (fields.course ?? "").trim() || null;
  const category = (fields.category ?? "interactive").trim();
  const tags = (fields.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const isFeatured = fields.isFeatured === "true";
  const customEntry = (fields.entryFile ?? "").trim() || null;

  // Extract the zip
  const extracted = await extractZipToBase64(file, {
    maxTotalSize: 3 * 1024 * 1024,
    customEntry,
  });

  if ("error" in extracted) {
    return NextResponse.json({ error: extracted.error }, { status: 422 });
  }

  let { filesMap, entryFile, thumbnailPath, totalSize, fileCount } = extracted;

  // ============================================================
  // Phase 10 — Auto-build React/Vite projects
  // ============================================================
  // Detect if this is an unbuilt React/Vite project
  const hasPackageJson = Boolean(filesMap["package.json"]);
  const hasViteConfig = Boolean(filesMap["vite.config.ts"] || filesMap["vite.config.js"]);
  const hasTsxFiles = Object.keys(filesMap).some(f => f.endsWith(".tsx") || f.endsWith(".jsx"));

  let buildResult: { built: boolean; error?: string; buildLog?: string; builtFiles?: Record<string, string> } = { built: false };

  if (hasPackageJson && (hasViteConfig || hasTsxFiles)) {
    // This is a React/Vite project that needs building
    buildResult = await tryBuildProject(filesMap);

    if (buildResult.built && buildResult.builtFiles) {
      // Replace the source files with the built files
      filesMap = buildResult.builtFiles;
      // Find the new entry file (index.html in dist/)
      entryFile = filesMap["index.html"] ? "index.html" : entryFile;
      fileCount = Object.keys(filesMap).length;
      totalSize = Object.values(filesMap).reduce((sum, b64) => sum + b64.length, 0);
    }
    // If build failed, we keep the source files — the serve route will
    // detect the .tsx references and show the "build required" page
  }

  // Build the project URL
  const projectId = crypto.randomUUID();
  const projectUrl = `/api/explore/serve/${projectId}/${entryFile}`;

  const thumbnailUrl = thumbnailPath
    ? `/api/explore/serve/${projectId}/${thumbnailPath}`
    : null;

  try {
    const project = await db.exploreProject.create({
      data: {
        id: projectId,
        title,
        description,
        track,
        gradeLevel,
        subject,
        course,
        category,
        tags,
        files: filesMap,
        entryFile: entryFile!,
        projectUrl,
        thumbnailUrl,
        fileSize: totalSize,
        isPublished: true,
        isFeatured,
        authorId: admin.userId,
      },
    });

    await logAdminActionViaJwt(admin, "explore.upload", {
      projectId: project.id,
      title,
      fileCount,
      totalSize,
      built: buildResult.built,
      buildError: buildResult.error,
    });

    return NextResponse.json({
      ok: true,
      built: buildResult.built,
      buildError: buildResult.error,
      project: {
        id: project.id,
        title: project.title,
        projectUrl: project.projectUrl,
        thumbnailUrl: project.thumbnailUrl,
      },
    });
  } catch (e: any) {
    console.error("[admin/explore/upload] DB error:", e?.message);
    return NextResponse.json(
      { error: `Failed to save project: ${e?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }
}

// ============================================================
// Build a React/Vite project: extract → npm install → build → read dist/
// ============================================================

async function tryBuildProject(
  filesMap: Record<string, string>,
): Promise<{ built: boolean; error?: string; buildLog?: string; builtFiles?: Record<string, string> }> {
  const buildDir = join(tmpdir(), `explore-build-${Date.now()}`);
  const buildTimeout = 240_000; // 4 minutes

  try {
    // Step 1: Write all source files to a temp directory
    await mkdir(buildDir, { recursive: true });
    for (const [filePath, base64] of Object.entries(filesMap)) {
      const fullPath = join(buildDir, filePath);
      const dir = fullPath.slice(0, fullPath.lastIndexOf("/"));
      if (dir && !existsSync(dir)) await mkdir(dir, { recursive: true });
      await writeFile(fullPath, Buffer.from(base64, "base64"));
    }

    // Step 2: Check if node + npm are available
    try {
      await execAsync("node --version", { timeout: 5_000 });
    } catch {
      return { built: false, error: "Node.js not available on the server" };
    }

    // Step 3: npm install
    console.log("[explore-build] Running npm install...");
    const installResult = await execAsync("npm install --prefer-offline --no-audit --no-fund", {
      cwd: buildDir,
      timeout: buildTimeout,
      maxBuffer: 10 * 1024 * 1024,
    }).catch((e: any) => {
      return { stdout: e?.stdout ?? "", stderr: e?.stderr ?? e?.message ?? "npm install failed" };
    });

    if (installResult.stderr && installResult.stderr.includes("ERR!")) {
      return { built: false, error: `npm install failed: ${installResult.stderr.slice(0, 500)}` };
    }

    // Step 4: Run the build command
    // Read package.json to find the build script
    let buildCmd = "npm run build";
    try {
      const pkgContent = await readFile(join(buildDir, "package.json"), "utf-8");
      const pkg = JSON.parse(pkgContent);
      if (pkg.scripts?.build) {
        buildCmd = "npm run build";
      } else if (pkg.scripts?.["vite-build"]) {
        buildCmd = "npm run vite-build";
      } else if (existsSync(join(buildDir, "vite.config.ts")) || existsSync(join(buildDir, "vite.config.js"))) {
        buildCmd = "npx vite build";
      } else {
        return { built: false, error: "No build script found in package.json" };
      }
    } catch {
      return { built: false, error: "Failed to read package.json" };
    }

    console.log(`[explore-build] Running ${buildCmd}...`);
    const buildResult = await execAsync(buildCmd, {
      cwd: buildDir,
      timeout: buildTimeout,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_ENV: "production",
        // Vite needs to know it's building for production
        CI: "false", // don't treat warnings as errors
      },
    }).catch((e: any) => {
      return { stdout: e?.stdout ?? "", stderr: e?.stderr ?? e?.message ?? "build failed" };
    });

    // Step 5: Check if dist/ exists (Vite output)
    const distDir = join(buildDir, "dist");
    if (!existsSync(distDir)) {
      // Try build/ folder (CRA output)
      const buildOutDir = join(buildDir, "build");
      if (!existsSync(buildOutDir)) {
        return {
          built: false,
          error: `Build completed but no dist/ or build/ folder found. Build output: ${(buildResult.stdout || "").slice(0, 300)}`,
        };
      }
      // Use build/ instead
      const builtFiles = await readDirToBase64(buildOutDir);
      return { built: true, builtFiles };
    }

    // Step 6: Read dist/ files as base64
    const builtFiles = await readDirToBase64(distDir);

    if (Object.keys(builtFiles).length === 0) {
      return { built: false, error: "dist/ folder is empty after build" };
    }

    console.log(`[explore-build] Build successful — ${Object.keys(builtFiles).length} files in dist/`);
    return { built: true, builtFiles };

  } catch (err: any) {
    return { built: false, error: `Build error: ${err?.message ?? err}` };
  } finally {
    // Clean up temp directory
    rm(buildDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Read all files in a directory recursively + return as { path: base64 } map.
 * Paths are relative to the directory root (no leading slash).
 */
async function readDirToBase64(dir: string, basePath: string = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const entries = await readdir(dir).catch(() => []);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = basePath ? `${basePath}/${entry}` : entry;

    const s = await stat(fullPath).catch(() => null);
    if (!s) continue;

    if (s.isDirectory()) {
      // Recurse into subdirectory
      const sub = await readDirToBase64(fullPath, relPath);
      Object.assign(result, sub);
    } else {
      // Read file as base64
      const buffer = await readFile(fullPath);
      result[relPath] = buffer.toString("base64");
    }
  }

  return result;
}
