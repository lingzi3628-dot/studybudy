/**
 * School Mode auth helpers.
 *
 * School Students are normal users (auth via /api/auth/*) who additionally
 * have a SchoolStudent record (created during /api/school/register).
 *
 * These helpers bridge the gap — given the current user (from
 * getCurrentUser), return the linked SchoolStudent or throw.
 *
 * Pattern mirrors @/lib/admin-auth.ts.
 */
import { db } from "./db";
import { getCurrentUser } from "./auth";
import type { SchoolStudent } from "@prisma/client";

/**
 * Returns the SchoolStudent row for the current user, or null if the user
 * is not a school student.
 */
export async function getSchoolStudent(
  userId: string
): Promise<SchoolStudent | null> {
  if (!userId) return null;
  try {
    return await db.schoolStudent.findUnique({
      where: { userId },
    });
  } catch (e) {
    console.error("getSchoolStudent failed:", (e as any)?.message);
    return null;
  }
}

/**
 * Returns the current user's SchoolStudent record.
 *
 * Throws an Error with `status=403` and `code=NOT_SCHOOL_STUDENT` if the
 * current user is not a school student. The error message is user-facing.
 *
 * Also returns the full user object so callers don't need to fetch it
 * twice.
 */
export async function requireSchoolStudent(): Promise<{
  student: SchoolStudent;
  userId: string;
}> {
  const user = await getCurrentUser();
  const student = await getSchoolStudent(user.id);
  if (!student) {
    const e = new Error("Your account is not registered as a school student.");
    (e as any).status = 403;
    (e as any).code = "NOT_SCHOOL_STUDENT";
    throw e;
  }
  return { student, userId: user.id };
}
