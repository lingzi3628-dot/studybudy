import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-room/[topicId]/state
 *
 * Returns the full Phase 15 Study Room state for the user + topic:
 *  - room state (theme, placedObjects, soundSettings, daily chest status, pet info)
 *  - unlocked objects (UserRoomObject) and pets (UserPet) owned by the user
 *  - all available themes, objects, and pets (catalog) for the customization UI
 *
 * If the room state doesn't exist, it's created with defaults.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  // Verify the topic exists (avoids creating orphan room states)
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Get or create room state with defaults
  const room = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: { userId: user.id, topicId, lastVisited: new Date() },
    update: { lastVisited: new Date() },
  }).catch(() => null);

  if (!room) {
    return NextResponse.json({ error: "Failed to load room state." }, { status: 500 });
  }

  // Determine premium status once
  const isPremium = Boolean(
    user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)
  );

  // ── Catalog data + ownership ──────────────────────────────────
  const [themes, allObjects, allPets, ownedObjectIds, ownedUserPets, themePurchases] = await Promise.all([
    db.roomTheme.findMany({ orderBy: { createdAt: "asc" } }).catch(() => []),
    db.roomObject.findMany({ orderBy: { createdAt: "asc" } }).catch(() => []),
    db.pet.findMany({ orderBy: { createdAt: "asc" } }).catch(() => []),
    db.userRoomObject.findMany({
      where: { userId: user.id },
      select: { objectId: true },
    }).catch(() => []),
    db.userPet.findMany({
      where: { userId: user.id },
      include: { pet: true },
    }).catch(() => []),
    // Track theme purchases via coin transactions (reason = theme_purchase:<name>)
    db.coinTransaction.findMany({
      where: { userId: user.id, reason: { startsWith: "theme_purchase:" } },
      select: { reason: true },
    }).catch(() => []),
  ]);

  const ownedObjectIdSet = new Set(ownedObjectIds.map((o) => o.objectId));
  const ownedUserPetByPetId = new Map(
    ownedUserPets.map((p): [string, (typeof ownedUserPets)[number]] => [p.petId, p])
  );
  const purchasedThemeNames = new Set(
    themePurchases
      .map((t) => t.reason.replace("theme_purchase:", ""))
      .filter(Boolean)
  );

  // ── Active pet info (from UserPet joined with Pet) ───────────
  let activePet: any = null;
  if (room.petId) {
    // room.petId references UserPet.id (per schema comment)
    const up = ownedUserPets.find((p) => p.id === room.petId);
    if (up) {
      activePet = buildPetStatus(up);
    }
  }

  // ── Daily chest status ───────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const canOpenDailyChest =
    !room.lastDailyChestOpened ||
    new Date(room.lastDailyChestOpened).getTime() < today.getTime();

  // Determine current theme object (defaults if not set)
  const currentTheme = themes.find((t) => t.name === room.roomTheme) ?? null;

  return NextResponse.json({
    room: {
      id: room.id,
      topicId: room.topicId,
      roomTheme: room.roomTheme,
      placedObjects: (room.placedObjects as any[]) ?? [],
      soundSettings: (room.soundSettings as any) ?? {
        fireplace: 0,
        rain: 0,
        birds: 0,
        lofi: 0,
        pages: 0,
      },
      petId: room.petId,
      lastDailyChestOpened: room.lastDailyChestOpened,
      canOpenDailyChest,
      lastVisited: room.lastVisited,
    },
    currentTheme,
    activePet,
    // All themes — "owned" reflects: free, OR already purchased, OR premium-user
    themes: themes.map((t) => ({
      ...t,
      owned: t.coinCost === 0 || purchasedThemeNames.has(t.name) || (t.isPremium && isPremium),
    })),
    // All room objects — "owned" comes from UserRoomObject join
    objects: allObjects.map((o) => ({
      ...o,
      owned: ownedObjectIdSet.has(o.id),
    })),
    // All pets — "owned" comes from UserPet join
    pets: allPets.map((p) => ({
      ...p,
      owned: ownedUserPetByPetId.has(p.id),
    })),
    // The user's owned pets with level/xp info
    userPets: ownedUserPets.map((up) => ({
      userPetId: up.id,
      petId: up.petId,
      name: up.pet.name,
      emoji: up.pet.emoji,
      petLevel: up.petLevel,
      petXp: up.petXp,
      lastFed: up.lastFed,
      happiness: computeHappiness(up.lastFed),
    })),
    balances: {
      coins: user.coinBalance,
      tokens: user.tokenBalance,
      isPremium,
    },
  });
}

/** Build the active-pet status payload (used by /state and /pets/status). */
function buildPetStatus(up: any) {
  return {
    userPetId: up.id,
    petId: up.petId,
    name: up.pet.name,
    emoji: up.pet.emoji,
    petLevel: up.petLevel,
    petXp: up.petXp,
    lastFed: up.lastFed,
    happiness: computeHappiness(up.lastFed),
    xpForNextLevel: 100 * up.petLevel, // level N+1 requires 100*N petXp
  };
}

/**
 * Happiness: 100 right after feeding, drops ~4/hour, floors at 0.
 * Never-fed pets start at 50.
 */
function computeHappiness(lastFed: Date | null): number {
  if (!lastFed) return 50;
  const hoursSince = (Date.now() - new Date(lastFed).getTime()) / 3_600_000;
  return Math.max(0, Math.round(100 - hoursSince * 4));
}
