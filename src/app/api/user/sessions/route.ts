import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user/sessions — recent login/logout events for the current user. */
export async function GET() {
  const user = await getCurrentUser();
  const sessions = await db.userSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ sessions });
}
