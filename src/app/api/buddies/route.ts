import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listBuddyMetadata, isValidBuddyId, getBuddy } from "@/lib/buddies/registry";

export const runtime = "nodejs";

// Phase 78 — Track → buddy mapping. Controls which buddies each track sees.
// K12 students only see StudyBuddy. ML track sees ML + Data + Dev. Etc.
const TRACK_BUDDIES: Record<string, string[]> = {
  k12: ["study"],
  tvet: ["tvet", "study"],
  dev: ["dev", "web", "backend", "server"],
  data: ["data", "dev"],
  ml: ["ml", "data", "dev"],
  aiapp: ["ai", "dev", "web", "backend"],
  web: ["web", "dev", "backend"],
  backend: ["backend", "dev", "server"],
  server: ["server", "backend", "dev"],
  mixed: ["study", "dev", "data", "ml", "ai", "web", "backend", "server", "tvet"],
};

/**
 * GET /api/buddies
 *
 * Phase 47 — List all registered buddies with their metadata.
 * Phase 78 — Now FILTERS buddies by the user's track.
 * K12 students only see StudyBuddy. ML track sees ML+Data+Dev. Etc.
 */
export async function GET() {
  let activeBuddyId = "study";
  let userTrack: string | null = null;
  try {
    const user = await getCurrentUser();
    activeBuddyId = "study";
    // Phase 78 — Get the user's track to filter buddies.
    const { db } = await import("@/lib/db");
    const u = await db.user.findUnique({
      where: { id: user.id },
      select: { track: true },
    });
    userTrack = u?.track ?? "k12";
    void user;
  } catch {
    // Not authed — return defaults (all buddies)
  }

  const allBuddies = listBuddyMetadata();

  // Phase 78 — Filter by track if we know it.
  let buddies = allBuddies;
  if (userTrack && TRACK_BUDDIES[userTrack]) {
    const allowedIds = new Set(TRACK_BUDDIES[userTrack]);
    buddies = allBuddies.filter((b) => allowedIds.has(b.id));
  }

  return NextResponse.json({
    buddies,
    defaultBuddyId: "study",
    activeBuddyId,
    track: userTrack,
  });
}

export { isValidBuddyId, getBuddy };
