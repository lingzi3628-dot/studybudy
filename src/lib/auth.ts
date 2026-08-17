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

async function getClerkAuth(): Promise<{ clerkUserId: string; email: string | null; name: string | null } | null> {
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
    };
  } catch {
    return null;
  }
}

async function upsertUserByClerkId(args: {
  clerkUserId: string;
  email: string | null;
  name: string | null;
}): Promise<AppUser> {
  const existing = await db.user.findUnique({
    where: { clerkUserId: args.clerkUserId },
  });

  if (existing) {
    // patch in any new fields from Clerk
    const patch: Record<string, string | null> = {};
    if (args.email && args.email !== existing.email) patch.email = args.email;
    if (args.name && args.name !== existing.name) patch.name = args.name;
    if (Object.keys(patch).length) {
      await db.user.update({ where: { id: existing.id }, data: patch });
    }
    return toAppUser(existing);
  }

  const created = await db.user.create({
    data: {
      clerkUserId: args.clerkUserId,
      email: args.email ?? undefined,
      name: args.name ?? undefined,
    },
  });
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
