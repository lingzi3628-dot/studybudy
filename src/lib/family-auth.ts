/**
 * Family Mode auth helpers.
 *
 * A "Family" is created by a parent (a normal User with email+password).
 * The parent creates 2+ child profiles, each with their own username + passcode
 * and their own User row (so progress is tracked independently).
 *
 * Children log in via /api/family/login using { username, passcode }.
 *
 * Pattern mirrors @/lib/school-auth.ts.
 */
import { db } from "./db";
import type { FamilyChild, Family } from "@prisma/client";

/**
 * Returns the FamilyChild row for the given user (if they are a family child),
 * or null otherwise.
 */
export async function getFamilyChild(
  userId: string
): Promise<FamilyChild | null> {
  if (!userId) return null;
  try {
    return await db.familyChild.findUnique({
      where: { userId },
    });
  } catch (e) {
    console.error("getFamilyChild failed:", (e as any)?.message);
    return null;
  }
}

/**
 * Returns the Family row owned by this user (if they are a family parent),
 * or null otherwise.
 */
export async function getFamilyByParent(
  parentUserId: string
): Promise<Family | null> {
  if (!parentUserId) return null;
  try {
    return await db.family.findUnique({
      where: { parentUserId },
    });
  } catch (e) {
    console.error("getFamilyByParent failed:", (e as any)?.message);
    return null;
  }
}

/**
 * Returns the current user's FamilyChild record (if they are a child logged
 * into a family account). Throws 403 NOT_FAMILY_CHILD otherwise.
 */
export async function requireFamilyChild(): Promise<{
  child: FamilyChild;
  family: Family;
  userId: string;
}> {
  const { getCurrentUser } = await import("./auth");
  const user = await getCurrentUser();
  const child = await getFamilyChild(user.id);
  if (!child) {
    const e = new Error("Your account is not a family child account.");
    (e as any).status = 403;
    (e as any).code = "NOT_FAMILY_CHILD";
    throw e;
  }
  const family = await db.family.findUnique({
    where: { id: child.familyId },
  });
  if (!family) {
    const e = new Error("Family not found.");
    (e as any).status = 404;
    (e as any).code = "FAMILY_NOT_FOUND";
    throw e;
  }
  return { child, family, userId: user.id };
}

/**
 * Returns the Family row owned by the current user (if they are a parent).
 * Throws 403 NOT_FAMILY_PARENT otherwise.
 */
export async function requireFamilyParent(): Promise<{
  family: Family;
  userId: string;
}> {
  const { getCurrentUser } = await import("./auth");
  const user = await getCurrentUser();
  const family = await getFamilyByParent(user.id);
  if (!family) {
    const e = new Error("Your account is not a family parent account.");
    (e as any).status = 403;
    (e as any).code = "NOT_FAMILY_PARENT";
    throw e;
  }
  return { family, userId: user.id };
}

/**
 * Generates a synthetic email for a child User row.
 * Children don't have real emails — we synthesize one so the User table's
 * `email` unique constraint is satisfied.
 *
 * Format: `family+{username}@family.studybuddy.local`
 *
 * The username is already globally unique, so the synthetic email is too.
 */
export function synthChildEmail(username: string, familyId: string): string {
  const safe = username.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `family+${safe}.${familyId.slice(0, 8)}@family.studybuddy.local`;
}

/**
 * Validation helpers for username + passcode format.
 */

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 3) return "Username must be at least 3 characters";
  if (u.length > 20) return "Username must be at most 20 characters";
  if (!/^[a-zA-Z0-9_]+$/.test(u))
    return "Username can only contain letters, numbers, and underscores";
  return null;
}

export function validatePasscode(passcode: string): string | null {
  if (passcode.length < 4) return "Passcode must be at least 4 characters";
  if (passcode.length > 20) return "Passcode must be at most 20 characters";
  return null;
}
