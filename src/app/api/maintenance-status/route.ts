import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/maintenance-status
 *
 * Returns whether maintenance mode is ON or OFF.
 * Reads the MAINTENANCE_MODE env var (NOT NEXT_PUBLIC_ — this is a
 * server-side runtime check, so the env var takes effect immediately
 * without a redeploy).
 *
 * The client polls this endpoint on page load + sets a localStorage flag
 * that the MaintenanceScreen component reads.
 *
 * To enable: set MAINTENANCE_MODE=true in Vercel env vars
 * To disable: set MAINTENANCE_MODE=false (or delete)
 */
export async function GET() {
  const flag = (process.env.MAINTENANCE_MODE ?? "false").toLowerCase().trim();
  const enabled = flag === "true" || flag === "1" || flag === "on";

  return NextResponse.json({
    maintenance: enabled,
    message: enabled
      ? "StudyBuddy is undergoing maintenance. We'll be back soon!"
      : "All systems operational.",
  });
}
