import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/pets — list all Pet rows (newest first) with adoption counts. */
export async function GET() {
  await requireAdmin();
  const pets = await db.pet.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { userPets: true } } },
  }).catch(() => []);
  return NextResponse.json({ pets });
}

/**
 * POST /api/admin/pets
 * Body: { name, emoji, description?, coinCost?, isPremium?, levelRequired? }
 * `name` must be unique.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    emoji?: string;
    description?: string;
    coinCost?: number;
    isPremium?: boolean;
    levelRequired?: number;
  };

  const name = (body.name ?? "").toString().trim();
  const emoji = (body.emoji ?? "").toString().trim();
  if (!name || !emoji) {
    return NextResponse.json(
      { error: "name and emoji are required." },
      { status: 400 }
    );
  }

  try {
    const pet = await db.pet.create({
      data: {
        name,
        emoji,
        description: body.description ?? null,
        coinCost: Math.max(0, body.coinCost ?? 100),
        isPremium: body.isPremium === true,
        levelRequired: Math.max(1, body.levelRequired ?? 1),
      },
    });
    await logAdminAction(admin, "pet.create", { petId: pet.id, name });
    return NextResponse.json({ pet });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A pet with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Create failed." }, { status: 500 });
  }
}
