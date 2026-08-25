import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/timetable
 *   Returns the user's weekly timetable.
 *
 * POST /api/curriculum/timetable
 *   Body: { dayOfWeek (0-6), startTime ("16:00"), endTime ("17:00"), subjectId?, subjectName, notes? }
 *   Creates a timetable slot.
 *
 * DELETE /api/curriculum/timetable
 *   Body: { id }
 */
export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  try {
    const slots = await db.timetable.findMany({
      where: { userId: user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json({ slots });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ slots: [] });
    return NextResponse.json({ error: "Failed to load timetable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const dayOfWeek = Number(body?.dayOfWeek);
  const startTime = (body?.startTime ?? "").toString().trim();
  const endTime = (body?.endTime ?? "").toString().trim();
  const subjectName = (body?.subjectName ?? "").toString().trim();
  const subjectId = (body?.subjectId ?? "").toString().trim() || null;
  const notes = (body?.notes ?? "").toString().trim() || null;

  if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: "dayOfWeek must be 0-6" }, { status: 400 });
  }
  if (!startTime || !endTime || !subjectName) {
    return NextResponse.json({ error: "startTime, endTime, and subjectName are required" }, { status: 400 });
  }

  try {
    const slot = await db.timetable.create({
      data: { userId: user.id, dayOfWeek, startTime, endTime, subjectName, subjectId, notes },
    });
    return NextResponse.json({ slot });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "You already have a slot at this time" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create slot" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? "").toString().trim();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await db.timetable.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to delete slot" }, { status: 500 });
  }
}
