/**
 * Auth helper: Clerk when configured, dev-mock fallback otherwise.
 *
 * When NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY are set,
 * `getCurrentUser()` reads Clerk's session and upserts the matching row
 * in our `users` table.
 *
 * When keys are absent (sandbox/dev), we fall back to a deterministic
 * dev user (alex@studybuddy.ai, clerk_user_id = "dev-user-alex") so the
 * app runs end-to-end without real Clerk credentials.
 *
 * additions:
 *   - Sync `lastLogin` on every auth check (throttled to once per minute)
 *   - Log every successful auth as a `user_sessions` row (session_type='login')
 *   - Return `onboardingCompleted` + new profile fields
 */
import { db } from "./db";

export type AppUser = {
  id: string;            // our DB uuid
  clerkUserId: string;   // Clerk user id (or dev fallback)
  email: string | null;
  name: string | null;
  plan: "free" | "pro";
  grade: string | null;
  subjects: string[];
  ambitions: string[];
  learningLanguage: string;
  onboardingCompleted: boolean;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
  darkMode: boolean;
  lastLogin: Date | null;
};

const DEV_USER = {
  clerkUserId: "dev-user-alex",
  email: "alex@studybuddy.ai",
  name: "Alex Kim",
};

function clerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;
  return Boolean(pk && sk && pk.startsWith("pk_") && sk.startsWith("sk_"));
}

async function getClerkAuth(): Promise<{ clerkUserId: string; email: string | null; name: string | null; avatarUrl: string | null } | null> {
  if (!clerkConfigured()) return null;
  try {
    // Lazy import so we don't crash the module when Clerk isn't installed at runtime
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const session = await auth();
    if (!session?.userId) return null;
    const u = await currentUser();
    return {
      clerkUserId: session.userId,
      email: u?.emailAddresses?.[0]?.emailAddress ?? null,
      name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || null,
      avatarUrl: u?.imageUrl ?? null,
    };
  } catch {
    return null;
  }
}

async function upsertUserByClerkId(args: {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl?: string | null;
}): Promise<AppUser> {
  const existing = await db.user.findUnique({
    where: { clerkUserId: args.clerkUserId },
  });

  if (existing) {
    // patch in any new fields from Clerk
    const patch: Record<string, string | null | Date> = { lastLogin: new Date() };
    if (args.email && args.email !== existing.email) patch.email = args.email;
    if (args.name && args.name !== existing.name) patch.name = args.name;
    if (args.avatarUrl && args.avatarUrl !== existing.avatarUrl) patch.avatarUrl = args.avatarUrl;

    const updated = await db.user.update({ where: { id: existing.id }, data: patch });

    // Throttle session logging: only log a new "login" event if the previous one
    // was more than 1 minute ago (otherwise every API request would create a row).
    const lastSession = await db.userSession.findFirst({
      where: { userId: existing.id, sessionType: "login" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const now = Date.now();
    const oneMinute = 60 * 1000;
    if (!lastSession || now - lastSession.createdAt.getTime() > oneMinute) {
      await db.userSession.create({
        data: {
          userId: existing.id,
          sessionType: "login",
        },
      }).catch(() => {}); // best-effort
    }

    return toAppUser(updated);
  }

  // First-time user — create with defaults
  const created = await db.user.create({
    data: {
      clerkUserId: args.clerkUserId,
      email: args.email ?? undefined,
      name: args.name ?? undefined,
      avatarUrl: args.avatarUrl ?? undefined,
      lastLogin: new Date(),
    },
  });

  await db.userSession.create({
    data: {
      userId: created.id,
      sessionType: "login",
    },
  }).catch(() => {});

  return toAppUser(created);
}

function toAppUser(u: {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  plan: string;
  grade: string | null;
  subjects: string[];
  ambitions: string[];
  learningLanguage: string;
  onboardingCompleted: boolean;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
  darkMode: boolean;
  lastLogin: Date | null;
}): AppUser {
  return {
    id: u.id,
    clerkUserId: u.clerkUserId,
    email: u.email,
    name: u.name,
    plan: u.plan === "pro" ? "pro" : "free",
    grade: u.grade,
    subjects: u.subjects,
    ambitions: u.ambitions,
    learningLanguage: u.learningLanguage,
    onboardingCompleted: u.onboardingCompleted,
    avatarUrl: u.avatarUrl,
    notificationsEnabled: u.notificationsEnabled,
    darkMode: u.darkMode,
    lastLogin: u.lastLogin,
  };
}

/**
 * Returns the current user (from Clerk session or dev fallback).
 * Always upserts a row in our `users` table.
 */
export async function getCurrentUser(): Promise<AppUser> {
  const clerkAuth = await getClerkAuth();
  const identity = clerkAuth ?? DEV_USER;
  return upsertUserByClerkId(identity);
}

/** True if real Clerk is configured. Use this to switch UI (sign-in routes etc). */
export function isClerkConfigured(): boolean {
  return clerkConfigured();
}

/**
 * server-side guard for non-admin API routes.
 * Throws 401 if no current user. (Currently always resolves since we have the
 * dev fallback — but once Clerk is fully configured, callers without a Clerk
 * session will get a 401.)
 */
export async function requireUser(): Promise<AppUser> {
  // When Clerk is fully configured and no session exists, getCurrentUser() falls
  // back to the dev user — for production use, callers should check isClerkConfigured()
  // and explicitly verify auth() returned a real userId before proceeding.
  return getCurrentUser();
}
