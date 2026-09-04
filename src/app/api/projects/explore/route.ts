import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/projects/explore?buddyId=...&q=...&sort=...
 *
 * Phase 60 — Public Project Marketplace
 *
 * Lists PUBLIC projects from ALL users. Supports:
 *   - buddyId filter (e.g. "dev", "web", "ml")
 *   - q search (title/description/tags)
 *   - sort: "stars" (default) | "recent" | "trending"
 *
 * Returns projects with author info (name + avatar).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const buddyId = url.searchParams.get("buddyId");
  const q = url.searchParams.get("q")?.toLowerCase().trim();
  const sort = url.searchParams.get("sort") ?? "stars";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 24)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  // Build the where clause — only public projects
  const where: any = { isPublic: true };
  if (buddyId) where.buddyId = buddyId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q } },
    ];
  }

  // Sort order
  let orderBy: any;
  if (sort === "recent") orderBy = { updatedAt: "desc" };
  else if (sort === "trending") {
    // "Trending" = projects updated in the last 7 days, sorted by stars
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    where.updatedAt = { gte: weekAgo };
    orderBy = { starCount: "desc" };
  } else {
    orderBy = { starCount: "desc" };
  }

  const projects = await db.project.findMany({
    where,
    orderBy,
    take: limit,
    skip: offset,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      files: { select: { id: true, path: true, isEntry: true }, orderBy: { path: "asc" } },
    },
  });

  // Try to get the current user (best-effort — explore is public, auth optional)
  let currentUserId: string | null = null;
  try { currentUserId = (await getCurrentUser()).id; } catch { /* not authed — fine */ }

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      buddyId: p.buddyId,
      title: p.title,
      description: p.description,
      tags: p.tags,
      starCount: p.starCount,
      fileCount: p.files.length,
      entryFile: p.files.find((f) => f.isEntry)?.path ?? p.files[0]?.path ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      author: {
        id: p.user.id,
        name: p.user.name ?? "Anonymous",
        avatarUrl: p.user.avatarUrl,
      },
      isOwn: p.user.id === currentUserId,
    })),
    total: projects.length,
    hasMore: projects.length === limit,
  });
}
