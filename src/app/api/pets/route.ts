import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/pets
 *
 * Returns all pets (catalog) with an `owned` boolean reflecting whether the
 * user has acquired each pet (via UserPet join).
 */
export async function GET() {
  const user = await getCurrentUser();

  const [pets, ownedRows] = await Promise.all([
    db.pet.findMany({ orderBy: { createdAt: "asc" } }).catch(() => []),
    db.userPet.findMany({
      where: { userId: user.id },
      include: { pet: true },
    }).catch(() => []),
  ]);

  const ownedByPetId = new Map(ownedRows.map((r): [string, (typeof ownedRows)[number]] => [r.petId, r]));

  return NextResponse.json({
    pets: pets.map((p) => {
      const owned = ownedByPetId.get(p.id);
      return {
        ...p,
        owned: Boolean(owned),
        userPetId: owned?.id ?? null,
        petLevel: owned?.petLevel ?? null,
        petXp: owned?.petXp ?? null,
        lastFed: owned?.lastFed ?? null,
      };
    }),
    coinBalance: user.coinBalance,
  });
}
