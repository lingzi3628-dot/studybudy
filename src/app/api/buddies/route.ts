import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listBuddyMetadata, isValidBuddyId, getBuddy } from "@/lib/buddies/registry";

export const runtime = "nodejs";

/**
 * GET /api/buddies
 *
 * Phase 47 — List all registered buddies with their metadata.
 * Used by the client-side BuddySwitcher to render the picker UI.
 *
 * Response shape:
 *   {
 *     buddies: BuddyMetadata[],   // ordered, default first
 *     defaultBuddyId: "study",
 *     activeBuddyId: "study",      // user's persisted preference
 *   }
 *
 * The response NEVER includes system prompts (those are server-side only).
 */
export async function GET() {
  // Best-effort: if the user is authed, return their persisted buddy preference
  let activeBuddyId = "study";
  try {
    const user = await getCurrentUser();
    // Phase 47: we store the user's preferred buddy in localStorage on the client.
    // The server doesn't need to persist it (yet) — the client sends `buddyId`
    // in the chat request body. We just return the default here.
    activeBuddyId = "study";
    void user; // suppress unused var warning
  } catch {
    // Not authed — return defaults
  }

  return NextResponse.json({
    buddies: listBuddyMetadata(),
    defaultBuddyId: "study",
    activeBuddyId,
  });
}

/**
 * For server-side buddy lookup (used by /api/tutor/chat).
 * Exported for internal use; the route uses getBuddy() directly from the registry.
 */
export { isValidBuddyId, getBuddy };
