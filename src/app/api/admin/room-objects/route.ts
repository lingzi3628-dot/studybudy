import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const VALID_TYPES = ["furniture", "decoration", "special"];

/** GET /api/admin/room-objects — list all RoomObject rows (newest first). */
export async function GET() {
  await requireAdmin();
  const objects = await db.roomObject.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { userRoomObjects: true } } },
  }).catch(() => []);
  return NextResponse.json({ objects });
}

/**
 * POST /api/admin/room-objects
 * Body: { name, type, icon, description?, coinCost?, isPremium?, levelRequired? }
 * `name` must be unique.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    type?: string;
    icon?: string;
    description?: string;
    coinCost?: number;
    isPremium?: boolean;
    levelRequired?: number;
  };

  const name = (body.name ?? "").toString().trim();
  const type = (body.type ?? "").toString().trim();
  const icon = (body.icon ?? "").toString().trim();
  if (!name || !type || !icon) {
    return NextResponse.json(
      { error: "name, type, and icon are required." },
      { status: 400 }
    );
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const obj = await db.roomObject.create({
      data: {
        name,
        type,
        icon,
        description: body.description ?? null,
        coinCost: Math.max(0, body.coinCost ?? 0),
        isPremium: body.isPremium === true,
        levelRequired: Math.max(1, body.levelRequired ?? 1),
      },
    });
    await logAdminAction(admin, "room_object.create", { objectId: obj.id, name, type });
    return NextResponse.json({ object: obj });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "An object with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Create failed." }, { status: 500 });
  }
}
