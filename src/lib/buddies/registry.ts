/**
 * Buddy Registry — Phase 47 Foundation
 *
 * Central registry of all buddies. Each future phase (48-54) imports
 * its buddy definition and adds it here.
 *
 * The chat route uses getBuddy(id) to look up the system-prompt builder.
 * The /api/buddies route uses listBuddyMetadata() to render the picker.
 * The client-side BuddySwitcher uses the same metadata.
 */

import type { Buddy, BuddyId, BuddyMetadata } from "./types";
import { studyBuddy } from "./study";
import { devBuddy } from "./dev";
import { dataBuddy } from "./data";
import { mlBuddy } from "./ml";
import { aiBuddy } from "./ai";
import { webBuddy } from "./web";
import { backendBuddy } from "./backend";
import { serverBuddy } from "./server";
import { tvetBuddy } from "./tvet";

/**
 * All registered buddies, keyed by id. Order matters for the picker UI
 * (StudyBuddy first because it's the default for K-12 users).
 */
const REGISTRY: Record<BuddyId, Buddy> = {
  study: studyBuddy,
  dev: devBuddy,
  data: dataBuddy,
  ml: mlBuddy,
  ai: aiBuddy,
  web: webBuddy,
  backend: backendBuddy,
  server: serverBuddy,
  tvet: tvetBuddy,
};

/**
 * Ordered list of buddy ids — used by the picker to render in a
 * predictable order (default first, then by phase number).
 */
const ORDERED_IDS: BuddyId[] = ["study", "dev", "data", "ml", "ai", "web", "backend", "server", "tvet"];

/**
 * Get a buddy by id. Returns the StudyBuddy if the id is unknown
 * (defensive — never throws, so the chat route always works).
 */
export function getBuddy(id: string | null | undefined): Buddy {
  if (id && id in REGISTRY) return REGISTRY[id as BuddyId];
  return REGISTRY.study;
}

/**
 * Check if a buddy id is valid (registered).
 */
export function isValidBuddyId(id: string): id is BuddyId {
  return id in REGISTRY;
}

/**
 * List all buddies in display order. Used by /api/buddies.
 */
export function listBuddies(): Buddy[] {
  return ORDERED_IDS.map((id) => REGISTRY[id]);
}

/**
 * List all buddy metadata (no system prompts) in display order.
 * Used by the client-side picker UI.
 */
export function listBuddyMetadata(): BuddyMetadata[] {
  return ORDERED_IDS.map((id) => {
    const { buildSystemPrompt, ...metadata } = REGISTRY[id];
    return metadata;
  });
}

/**
 * The default buddy id — used when no buddyId is provided in the request.
 * Kept as a constant so the chat route, the AI Tutor screen, and the
 * store all agree on the default.
 */
export const DEFAULT_BUDDY_ID: BuddyId = "study";
