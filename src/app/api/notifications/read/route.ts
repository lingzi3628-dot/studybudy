import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** POST /api/notifications/read — mark notifications as read */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { id?: string; all?: boolean };

  if (body.all) {
    await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    }).catch(() => null);
    return NextResponse.json({ ok: true, markedAll: true });
  }

  if (body.id) {
    await db.notification.updateMany({
      where: { id: body.id, userId: user.id },
      data: { read: true },
    }).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Provide id or all=true" }, { status: 400 });
}
