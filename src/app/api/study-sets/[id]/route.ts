import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/study-sets/[id] — fetch set with cards + per-user review state */
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;

  const set = await db.studySet.findFirst({
    where: { id, userId: user.id },
    include: {
      cards: {
        orderBy: { createdAt: "asc" },
        include: {
          cardReviews: {
            where: { userId: user.id },
            select: {
              dueDate: true,
              easeFactor: true,
              repetitions: true,
              lapses: true,
            },
          },
        },
      },
    },
  });

  if (!set) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    studySet: {
      ...set,
      cards: set.cards.map((c) => ({
        ...c,
        review: c.cardReviews[0] ?? null,
      })),
    },
  });
}

/** DELETE /api/study-sets/[id] — cascade delete set + cards */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;

  const owned = await db.studySet.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.studySet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
