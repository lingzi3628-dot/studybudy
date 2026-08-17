/**
 * Admin session — verifies the admin JWT from the request cookie.
 *
 * Used by all /api/admin/* routes. The previous Phase 5 requireAdmin()
 * (which checked ADMIN_EMAILS env or User.role='admin') is deprecated —
 * the new admin auth is fully separate from Clerk user auth.
 *
 * Flow:
 *   1. Admin logs in at the AdminLogin screen with email + password.
 *   2. POST /api/admin/auth/login verifies bcrypt hash against admin_users
 *      table, then signs a JWT and sets it as an HTTP-only cookie.
 *   3. Subsequent /api/admin/* requests send the cookie automatically.
 *   4. requireAdminJwt() reads the cookie, verifies the JWT, returns the
 *      admin user. Throws 401 if no/invalid token.
 */
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { db } from "./db";
import { verifyAdminToken, getAdminCookieName } from "./admin-jwt";

export type AdminSession = {
  adminId: string;
  adminEmail: string;
  name: string | null;
};

/**
 * Reads the admin cookie from the request, verifies the JWT, and returns
 * the admin session. Throws an Error with `status=401` if not authed.
 *
 * Works for both App Router handlers (cookies() from next/headers) and
 * is compatible with NextRequest's cookie store.
 */
export async function requireAdminJwt(): Promise<AdminSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAdminCookieName())?.value;
  const payload = verifyAdminToken(token);

  if (!payload) {
    const e = new Error("Admin authentication required");
    (e as any).status = 401;
    (e as any).code = "UNAUTHORIZED";
    throw e;
  }

  // Verify the admin still exists in the DB (in case they were deleted)
  const admin = await db.adminUser.findUnique({
    where: { id: payload.adminId },
    select: { id: true, email: true, name: true },
  });

  if (!admin) {
    const e = new Error("Admin account not found");
    (e as any).status = 401;
    (e as any).code = "UNAUTHORIZED";
    throw e;
  }

  return {
    adminId: admin.id,
    adminEmail: admin.email,
    name: admin.name,
  };
}

/**
 * Optional version: returns the admin session if authed, null otherwise.
 * Useful for the AdminLogin screen to check if already authed.
 */
export async function getOptionalAdminSession(): Promise<AdminSession | null> {
  try {
    return await requireAdminJwt();
  } catch {
    return null;
  }
}

/**
 * Log an admin action to admin_logs. The adminUserId field is now the
 * AdminUser.id (from the JWT), not the User.id from Clerk. To avoid
 * FK constraint issues, we store it as a nullable text — the admin_logs
 * table's adminUserId is FK to users.id, but we now pass the AdminUser's
 * id, which won't match. So we store null in the FK field and put the
 * admin email in the details JSON instead.
 */
export async function logAdminActionViaJwt(
  admin: AdminSession,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.adminLog.create({
      data: {
        // adminUserId is FK to users.id; we don't have a User row for admins
        // anymore (they're in admin_users). Store null and include admin
        // email in details for traceability.
        adminUserId: null,
        action,
        details: { adminEmail: admin.adminEmail, ...(details ?? {}) } as any,
      },
    });
  } catch (e) {
    // best-effort
    console.warn("Failed to log admin action", e);
  }
}
