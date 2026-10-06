import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { WEB_TEMPLATES } from "@/lib/web-templates";

export const runtime = "nodejs";

/**
 * GET /api/web-templates
 *
 * Returns ALL available web templates:
 *   1. Hardcoded built-in templates (from web-templates.ts — always free)
 *   2. Admin-uploaded templates from ExploreProject (category="template")
 *      — can be free, featured, or paid (isFeatured flag for now; paid
 *        tier will be added when monetization for templates is built)
 *
 * The Web Builder's templates modal fetches this endpoint and displays
 * both types. Admin uploads new templates via the Explore tab (zip upload)
 * with category="template" — they appear here automatically.
 *
 * Response shape:
 *   { templates: [{ id, name, emoji, description, category, isFeatured, isPaid, source }] }
 */
export async function GET() {
  // 1. Built-in hardcoded templates (always free, never featured)
  const builtIn = WEB_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    description: t.description,
    category: "built-in",
    isFeatured: false,
    isPaid: false,
    source: "builtin" as const,
  }));

  // 2. Admin-uploaded templates from ExploreProject
  let dbTemplates: any[] = [];
  try {
    const projects = await db.exploreProject.findMany({
      where: {
        category: "template",
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        isFeatured: true,
        tags: true,
        projectUrl: true,
      },
      orderBy: [
        { isFeatured: "desc" },
        { createdAt: "desc" },
      ],
      take: 50,
    });

    dbTemplates = projects.map((p) => ({
      id: p.id,
      name: p.title,
      emoji: "📦", // admin-uploaded — no emoji, use box
      description: p.description ?? "Admin-uploaded template",
      category: "uploaded",
      isFeatured: p.isFeatured,
      isPaid: false, // Phase 9 — paid templates not yet implemented
      source: "db" as const,
      thumbnailUrl: p.thumbnailUrl,
      projectUrl: p.projectUrl,
      tags: p.tags,
    }));
  } catch {
    // DB error — return only built-in templates
  }

  // Merge: featured first, then built-in, then uploaded
  const featured = dbTemplates.filter((t) => t.isFeatured);
  const nonFeatured = dbTemplates.filter((t) => !t.isFeatured);

  return NextResponse.json({
    templates: [
      ...featured,
      ...builtIn,
      ...nonFeatured,
    ],
  });
}
