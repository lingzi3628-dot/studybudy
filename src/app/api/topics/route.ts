import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/topics?q=algebra&subject=Math
 * Search topics by name (case-insensitive substring) or by subject.
 * If no query, returns recently created topics.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const subject = (url.searchParams.get("subject") ?? "").trim();
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 20));

  const where: any = {};
  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }
  if (subject) {
    where.subject = { equals: subject, mode: "insensitive" };
  }

  const topics = await db.topic.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      _count: { select: { cards: true } },
    },
  });

  return NextResponse.json({
    topics: topics.map((t) => ({
      id: t.id,
      subject: t.subject,
      name: t.name,
      description: t.description,
      createdAt: t.createdAt,
      cardCount: t._count.cards,
    })),
  });
}

/**
 * POST /api/topics
 * Body: { name, subject, description? }
 * Upserts by (subject, name) — if the topic exists, returns it; otherwise creates a new one.
 * This is the entrypoint when a user taps "Open Study Room" from Search or Home.
 */
export async function POST(req: NextRequest) {
  // says Study Room is accessible without login → use getCurrentUser() which
  // returns the dev user when Clerk isn't configured.
  await getCurrentUser();

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  const subjectRaw = (body.subject ?? "General").toString().trim() || "General";
  const description = body.description ?? null;

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  // Normalise subject to "Mathematics" if user types "Math"
  const subject = normaliseSubject(subjectRaw);

  const topic = await db.topic.upsert({
    where: {
      subject_name: { subject, name },
    },
    create: { subject, name, description },
    update: description ? { description } : {},
  });

  return NextResponse.json({ topic });
}

/** Map common aliases to a canonical subject name. */
function normaliseSubject(s: string): string {
  const lower = s.toLowerCase();
  if (lower === "math" || lower === "maths") return "Mathematics";
  if (lower === "sci") return "Science";
  if (lower === "eng") return "English";
  if (lower === "swa") return "Kiswahili";
  if (lower === "code" || lower === "programming" || lower === "cs") return "Coding";
  if (lower === "lang" || lower === "language") return "Language";
  // Capitalise first letter
  return s.charAt(0).toUpperCase() + s.slice(1);
}
