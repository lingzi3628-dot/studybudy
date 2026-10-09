import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware — geo-blocking.
 *
 * Phase 10: Geo-blocking
 *   - Reads x-vercel-ip-country header (provided by Vercel on all requests)
 *   - Fetches geo-block settings from /api/geo-check (cached 60s)
 *   - If geo-blocking is enabled + visitor's country NOT allowed + no proxy token
 *     → redirect to /blocked
 *
 * IMPORTANT: middleware runs in Edge runtime. It CANNOT use Prisma directly.
 * Instead, it calls /api/geo-check (a Node.js runtime endpoint that reads
 * from the DB). The result is cached in-memory for 60s to avoid hitting
 * the API on every request.
 */

// ============================================================
// In-memory cache for geo-block settings (60s TTL)
// ============================================================

type CachedGeoSettings = {
  enabled: boolean;
  allowedCountries: string[];
  proxyTokens: string[];
  fetchedAt: number;
};

let cachedGeo: CachedGeoSettings | null = null;
const GEO_CACHE_TTL_MS = 60_000;

async function loadGeoSettings(req: NextRequest): Promise<CachedGeoSettings> {
  if (cachedGeo && Date.now() - cachedGeo.fetchedAt < GEO_CACHE_TTL_MS) {
    return cachedGeo;
  }

  try {
    // Fetch from our own API endpoint (runs in Node.js runtime, can use Prisma).
    // This endpoint is excluded from the middleware matcher (see config below).
    // Build the URL from the request origin so it works on any deployment.
    const url = new URL("/api/geo-check", req.url);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3_000), // 3s timeout — don't block the request too long
    });
    if (!res.ok) {
      // If the API fails, fail OPEN (allow access) — don't break the site
      return { enabled: false, allowedCountries: [], proxyTokens: [], fetchedAt: Date.now() };
    }
    const data = await res.json();

    cachedGeo = {
      enabled: Boolean(data.enabled),
      allowedCountries: Array.isArray(data.allowedCountries)
        ? data.allowedCountries.map((c: string) => String(c).toUpperCase())
        : ["KE"],
      proxyTokens: Array.isArray(data.proxyTokens)
        ? data.proxyTokens.map((t: any) => String(t.token || t))
        : [],
      fetchedAt: Date.now(),
    };
    return cachedGeo;
  } catch {
    // Network error, timeout, etc. — fail OPEN
    return { enabled: false, allowedCountries: [], proxyTokens: [], fetchedAt: Date.now() };
  }
}

// ============================================================
// Middleware
// ============================================================

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Skip geo-check for: the blocked page itself, API routes, static assets
  // (the matcher already handles most of this, but double-check here)
  if (pathname === "/blocked" || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // --- Geo-blocking check ---
  const geoSettings = await loadGeoSettings(req);

  if (geoSettings.enabled) {
    // Get the visitor's country from Vercel's header
    const visitorCountry = req.headers.get("x-vercel-ip-country")?.toUpperCase() || "";

    // Check for proxy token (cookie or URL param)
    const proxyTokenFromCookie = req.cookies.get("geo-proxy-token")?.value || "";
    const proxyTokenFromUrl = searchParams.get("proxy") || "";
    const proxyToken = proxyTokenFromCookie || proxyTokenFromUrl;

    // If proxy token is provided via URL, set it as a cookie + strip from URL
    if (proxyTokenFromUrl && proxyTokenFromUrl.startsWith("proxy_")) {
      const response = geoSettings.proxyTokens.includes(proxyTokenFromUrl)
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/blocked", req.url));

      if (response.status === 200) {
        // Valid proxy token — set cookie + continue
        response.cookies.set("geo-proxy-token", proxyTokenFromUrl, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 365, // 1 year
          path: "/",
        });
        // Redirect to the same URL without the proxy param (clean URL)
        const cleanUrl = req.nextUrl.clone();
        cleanUrl.searchParams.delete("proxy");
        return NextResponse.redirect(cleanUrl);
      }
      return response;
    }

    const hasValidProxy = proxyToken &&
      proxyToken.startsWith("proxy_") &&
      geoSettings.proxyTokens.includes(proxyToken);

    // If the visitor's country is NOT allowed AND they don't have a valid proxy
    if (
      visitorCountry &&
      !geoSettings.allowedCountries.includes(visitorCountry) &&
      !hasValidProxy
    ) {
      const blockedUrl = req.nextUrl.clone();
      blockedUrl.pathname = "/blocked";
      blockedUrl.searchParams.set("country", visitorCountry);
      blockedUrl.search = blockedUrl.search; // trigger re-render
      return NextResponse.redirect(blockedUrl);
    }
  }

  return NextResponse.next();
}

// ============================================================
// Matcher — run middleware on all routes EXCEPT:
//   - Static assets (_next/static, _next/image, favicon)
//   - API routes (geo-checked separately if needed)
//   - The /blocked page itself
//   - The /api/geo-check endpoint (called BY the middleware — must not loop)
// ============================================================

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|blocked|api).*)",
  ],
};
