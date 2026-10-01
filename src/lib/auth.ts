/**
 * Auth helper — direct email/password auth via JWT cookie.
 *
 * Reads the `user_token` HTTP-only cookie, verifies the JWT,
 * looks up the user in the DB. Throws 401 if not authenticated.
 *
 * Clerk is NOT used. All auth is handled by /api/auth/* routes.
 */
import { cookies } from "next/headers";
import { db } from "./db";
import { verifyUserToken, getUserCookieName } from "./user-jwt";

export type AppUser = {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  plan: "free" | "pro";
  grade: string | null;
  track: string | null;      // Phase 88.6 — CRITICAL: was missing, caused ALL higher-ed AI Tutor bugs
  course: string | null;     // Phase 88.6 — CRITICAL: was missing, caused ALL higher-ed AI Tutor bugs
  subjects: string[];
  ambitions: string[];
  learningLanguage: string;
  onboardingCompleted: boolean;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
  darkMode: boolean;
  lastLogin: Date | null;
  // Monetization fields
  tokenBalance: number;
  currentModel: string;
  planId: string | null;
  subscriptionExpiry: Date | null;
  tokenResetDate: Date | null;
  hasApiKey: boolean;
  // Phase 13 — coin economy
  coinBalance: number;
  freeModelRestingUntil: Date | null;
};

/**
 * Returns the current user from the user_token JWT cookie.
 * Throws 401 "Authentication required" if not authenticated.
 *
 * Phase 90.1 — Performance optimization:
 * - Only writes `lastActive` once per 60 seconds per user (was every API call)
 * - Uses an in-memory Map to track the last write time per user ID
 * - Saves 1 DB write per request when user was active within the last minute
 */
const lastActiveCache = new Map<string, number>(); // userId → timestamp
const LAST_ACTIVE_TTL = 60_000; // 60 seconds

export async function getCurrentUser(): Promise<AppUser> {
  const cookieStore = await cookies();
  const userToken = cookieStore.get(getUserCookieName())?.value;
  const userPayload = verifyUserToken(userToken);

  if (userPayload) {
    const user = await db.user.findUnique({
      where: { id: userPayload.userId },
    });
    if (user && !user.banned) {
      // Phase 90.1 — Only update lastActive once per minute per user
      const now = Date.now();
      const lastWrite = lastActiveCache.get(user.id) || 0;
      if (now - lastWrite > LAST_ACTIVE_TTL) {
        lastActiveCache.set(user.id, now);
        db.user.update({
          where: { id: user.id },
          data: { lastActive: new Date() },
        }).catch(() => {}); // fire-and-forget — don't block the response
      }
      return toAppUser(user);
    }
  }

  const e = new Error("Authentication required");
  (e as any).status = 401;
  (e as any).code = "UNAUTHORIZED";
  throw e;
}

function toAppUser(u: any): AppUser {
  return {
    id: u.id,
    clerkUserId: u.clerkUserId,
    email: u.email,
    name: u.name,
    plan: u.plan === "pro" ? "pro" : "free",
    grade: u.grade,
    track: u.track ?? "k12",       // Phase 88.6 — CRITICAL: was missing
    course: u.course ?? null,      // Phase 88.6 — CRITICAL: was missing
    subjects: u.subjects,
    ambitions: u.ambitions,
    learningLanguage: u.learningLanguage,
    onboardingCompleted: u.onboardingCompleted,
    avatarUrl: u.avatarUrl,
    notificationsEnabled: u.notificationsEnabled,
    darkMode: u.darkMode,
    lastLogin: u.lastLogin,
    // Monetization
    tokenBalance: u.tokenBalance ?? 50,
    currentModel: u.currentModel ?? "study_buddy_free",
    planId: u.planId,
    subscriptionExpiry: u.subscriptionExpiry,
    tokenResetDate: u.tokenResetDate,
    hasApiKey: Boolean(u.encryptedApiKey),
    // Phase 13 — coin economy
    coinBalance: u.coinBalance ?? 0,
    freeModelRestingUntil: u.freeModelRestingUntil,
  };
}

/** Always false — Clerk is not used. Kept for backward compat. */
export function isClerkConfigured(): boolean {
  return false;
}
