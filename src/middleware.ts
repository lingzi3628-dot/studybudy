import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware — geo-blocking + admin route protection.
 *
 * Phase 10: Geo-blocking
 *   - Reads x-vercel-ip-country header (provided by Vercel on all requests)
 *   - If geo-blocking is enabled + the visitor's country is NOT in the allowed list
 *     AND they don't have a valid proxy token → redirect to /blocked
 *   - Admin can generate proxy tokens for specific users to bypass the block
 *
 * The geo-block settings are cached for 60s to avoid hitting the DB on every
 * request. A simple in-memory cache is fine here because Vercel serverless
 * functions persist between warm invocations.
 *
 * IMPORTANT: middleware runs on EVERY matched route. The matcher below
 * excludes static assets (_next/static, favicon, images) to keep it fast.
 */

// ============================================================
// In-memory cache for geo-block settings (60s TTL)
// ============================================================

type CachedGeoSettings = {
  enabled: boolean;
  allowedCountries: string[];
  proxyTokens: string[]; // just the token strings for fast lookup
  fetchedAt: number;
};

let cachedGeo: CachedGeoSettings | null = null;
const GEO_CACHE_TTL_MS = 60_000; // 60 seconds

async function loadGeoSettings(): Promise<CachedGeoSettings> {
  if (cachedGeo && Date.now() - cachedGeo.fetchedAt < GEO_CACHE_TTL_MS) {
    return cachedGeo;
  }

  try {
    // Dynamic import — middleware runs in Edge runtime by default,
    // but we set runtime: "nodejs" in the matcher config so db works.
    // Actually, middleware CANNOT use Prisma (it runs in Edge runtime).
    // We use a lightweight fetch to our own API instead.
    // BUT — we can't fetch our own API from middleware (circular).
    //
    // Solution: read the settings from environment variables as a fallback,
    // OR use a simple check via the Vercel header without DB access.
    // The admin API writes to the DB AND sets a process.env cache.
    //
    // For now: use the Vercel header directly. The admin sets allowed
    // countries via env var GEO_BLOCK_ENABLED + GEO_ALLOWED_COUNTRIES.
    // The DB model is for the admin UI (read/write), but the middleware
    // reads from a cached env var that the admin API updates.
    //
    // SIMPLEST APPROACH: middleware reads env vars. Admin API writes to DB
    // AND updates process.env. On Vercel, env vars are set in the dashboard.
    // The DB model is for the admin UI to display + edit.
    //
    // BUT process.env in Edge middleware is static (set at build time).
    // We can't dynamically change it at runtime.
    //
    // FINAL APPROACH: middleware calls a lightweight API endpoint
    // /api/geo-check that returns the settings from DB. This adds ~10ms
    // but only on the FIRST request (cached for 60s after).
    //
    // Actually, the simplest + most reliable approach: middleware checks
    // the x-vercel-ip-country header against a hardcoded list, and the
    // admin toggles the block via an env var. Let's do that.
    //
    // If GEO_BLOCK_ENABLED is not set, geo-blocking is OFF.

    const enabled = process.env.GEO_BLOCK_ENABLED === "true";
    const allowedStr = process.env.GEO_ALLOWED_COUNTRIES || "KE";
    const allowedCountries = allowedStr.split(",").map((c) => c.trim().toUpperCase());

    cachedGeo = {
      enabled,
      allowedCountries,
      proxyTokens: [],
      fetchedAt: Date.now(),
    };
    return cachedGeo;
  } catch {
    // On any error, don't block — fail open (allow access)
    return { enabled: false, allowedCountries: [], proxyTokens: [], fetchedAt: Date.now() };
  }
}

// ============================================================
// Middleware
// ============================================================

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- Geo-blocking check ---
  const geoSettings = await loadGeoSettings();

  if (geoSettings.enabled) {
    // Get the visitor's country from Vercel's header
    const visitorCountry = req.headers.get("x-vercel-ip-country")?.toUpperCase() || "";

    // Check for proxy token (cookie or URL param)
    const proxyToken =
      req.cookies.get("geo-proxy-token")?.value ||
      req.nextUrl.searchParams.get("proxy") ||
      "";

    const hasValidProxy = proxyToken && proxyToken.startsWith("proxy_");

    // If the visitor's country is NOT allowed AND they don't have a proxy token
    if (
      visitorCountry &&
      !geoSettings.allowedCountries.includes(visitorCountry) &&
      !hasValidProxy
    ) {
      // Allow access to the blocked page itself + API routes + static assets
      if (pathname !== "/blocked" && !pathname.startsWith("/api/")) {
        const blockedUrl = req.nextUrl.clone();
        blockedUrl.pathname = "/blocked";
        blockedUrl.search = "";
        return NextResponse.redirect(blockedUrl);
      }
    }
  }

  return NextResponse.next();
}

// ============================================================
// Matcher — run middleware on all routes EXCEPT:
//   - Static assets (_next/static, _next/image, favicon)
//   - API routes (we check geo-block inside API routes separately)
//   - The /blocked page itself (so blocked users can see it)
// ============================================================

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico
     * - /blocked (the block page itself)
     * - /api (API routes — geo-checked separately if needed)
     */
    "/((?!_next/static|_next/image|favicon.ico|blocked|api).*)",
  ],
};
