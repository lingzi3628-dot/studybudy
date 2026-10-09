import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/geo-check
 *
 * Lightweight endpoint that returns the current geo-block settings.
 * Called by the middleware (which runs in Edge runtime + can't use Prisma).
 *
 * This endpoint is NOT geo-blocked (excluded from the middleware matcher)
 * so the middleware can always fetch the settings.
 *
 * No auth required — it only returns enabled flag + country list + proxy tokens.
 * This is NOT sensitive data (country codes + proxy token strings).
 */
export async function GET() {
  let settings: any = null;
  try {
    settings = await db.geoBlockSettings.findUnique({ where: { id: 1 } });
  } catch {
    // DB error — return disabled (fail open)
    return NextResponse.json({
      enabled: false,
      allowedCountries: ["KE"],
      proxyTokens: [],
    });
  }

  const allowedCountries = (settings?.allowedCountries ?? "KE")
    .split(",")
    .map((c: string) => c.trim().toUpperCase())
    .filter(Boolean);

  const proxyTokens: string[] = Array.isArray(settings?.proxyTokens)
    ? settings.proxyTokens
        .filter((t: any) => t && typeof t.token === "string")
        .map((t: any) => t.token)
    : [];

  return NextResponse.json({
    enabled: settings?.enabled ?? false,
    allowedCountries,
    proxyTokens,
  });
}
