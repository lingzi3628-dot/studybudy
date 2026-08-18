/**
 * Auth helper — supports both direct email/password auth (user JWT cookie)
 * and Clerk auth (when configured). No more dev-user fallback.
 *
 * Resolution order:
 *   1. Check `user_token` cookie → verify JWT → look up user in DB
 *   2. Check Clerk (if NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set)
 *   3. Throw 401 "Authentication required"
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
  subjects: string[];
  ambitions: string[];
  learningLanguage: string;
  onboardingCompleted: boolean;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
  darkMode: boolean;
  lastLogin: Date | null;
};

function clerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;
  return Boolean(pk && sk && pk.startsWith("pk_") && sk.startsWith("sk_"));
}

async function getClerkAuth(): Promise<{ clerkUserId: string; email: string | null; name: string | null; avatarUrl: string | null } | null> {
  if (!clerkConfigured()) return null;
  try {
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
    const patch: Record<string, string | null | Date> = { lastLogin: new Date() };
    if (args.email && args.email !== existing.email) patch.email = args.email;
    if (args.name && args.name !== existing.name) patch.name = args.name;
    if (args.avatarUrl && args.avatarUrl !== existing.avatarUrl) patch.avatarUrl = args.avatarUrl;
    const updated = await db.user.update({ where: { id: existing.id }, data: patch });
    return toAppUser(updated);
  }

  const created = await db.user.create({
    data: {
      clerkUserId: args.clerkUserId,
      email: args.email ?? undefined,
      name: args.name ?? undefined,
      avatarUrl: args.avatarUrl ?? undefined,
      lastLogin: new Date(),
    },
  });
  return toAppUser(created);
}

function toAppUser(u: any): AppUser {
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
 * Returns the current user (from user JWT cookie or Clerk session).
 * Throws an error with status=401 if not authenticated.
 *
 * NO MORE DEV-USER FALLBACK. All API routes require real auth.
 */
export async function getCurrentUser(): Promise<AppUser> {
  // 1. Check user_token cookie (direct email/password auth)
  const cookieStore = await cookies();
  const userToken = cookieStore.get(getUserCookieName())?.value;
  const userPayload = verifyUserToken(userToken);

  if (userPayload) {
    const user = await db.user.findUnique({
      where: { id: userPayload.userId },
    });
    if (user && !user.banned) {
      // Update lastActive (throttled)
      await db.user.update({
        where: { id: user.id },
        data: { lastActive: new Date() },
      }).catch(() => {});
      return toAppUser(user);
    }
  }

  // 2. Check Clerk (if configured)
  const clerkAuth = await getClerkAuth();
  if (clerkAuth) {
    return upsertUserByClerkId(clerkAuth);
  }

  // 3. No auth — throw 401
  const e = new Error("Authentication required");
  (e as any).status = 401;
  (e as any).code = "UNAUTHORIZED";
  throw e;
}

/** True if real Clerk is configured. */
export function isClerkConfigured(): boolean {
  return clerkConfigured();
}
