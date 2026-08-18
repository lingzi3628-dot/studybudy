/**
 * Admin authentication helper.
 *
 * A user is considered admin if EITHER:
 *   1. Their email is in the ADMIN_EMAILS env var (comma-separated), OR
 *   2. Their `role` field in the users table is "admin"
 *
 * In dev mode (no Clerk keys), the dev user the dev user is
 * already in ADMIN_EMAILS so the panel is testable without real auth.
 */
import { db } from "./db";
import { getCurrentUser, type AppUser } from "./auth";

export type AdminUser = AppUser & {
  isAdmin: true;
};

function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Returns the current user ONLY if they're an admin.
 * Throws an error with `403` code if not.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getCurrentUser();
  const adminEmails = parseAdminEmails();

  const isEnvAdmin = user.email ? adminEmails.has(user.email.toLowerCase()) : false;

  // refresh banned/role flags from DB
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true, banned: true },
  });

  if (dbUser?.banned) {
    const e = new Error("Account banned");
    (e as any).code = "BANNED";
    (e as any).status = 403;
    throw e;
  }

  const isRoleAdmin = dbUser?.role === "admin";

  if (!isEnvAdmin && !isRoleAdmin) {
    const e = new Error("Admin access required");
    (e as any).code = "FORBIDDEN";
    (e as any).status = 403;
    throw e;
  }

  // Promote role to admin in DB if env says so but DB doesn't (one-time promotion)
  if (isEnvAdmin && !isRoleAdmin) {
    await db.user.update({
      where: { id: user.id },
      data: { role: "admin" },
    });
  }

  return { ...user, isAdmin: true as const };
}

/**
 * Client-side check: is the current user an admin?
 * Used by the Profile screen to decide whether to show the admin entry button.
 * The server still enforces requireAdmin() on every API call — this is just UI hinting.
 */
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const r = await fetch("/api/admin/check", { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Log an admin action to admin_logs.
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.adminLog.create({
      data: {
        adminUserId,
        action,
        details: details as any ?? undefined,
      },
    });
  } catch (e) {
    // best-effort
    console.warn("Failed to log admin action", e);
  }
}
