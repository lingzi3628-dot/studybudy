import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEarnCenterData } from "@/lib/earn";

export const runtime = "nodejs";

/** GET /api/user/earn-center — today's earned + available actions with rewards */
export async function GET() {
  const user = await getCurrentUser();
  const data = await getEarnCenterData(user.id);
  if (!data) {
    return NextResponse.json({ error: "Failed to load earn center" }, { status: 500 });
  }
  return NextResponse.json(data);
}
