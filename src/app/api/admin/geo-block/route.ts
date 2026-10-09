import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/geo-block
 *
 * Returns current geo-block settings.
 */
export async function GET() {
  await requireAdminJwt();
  let settings: any = null;
  try {
    settings = await db.geoBlockSettings.findUnique({ where: { id: 1 } });
  } catch {}

  const result = {
    enabled: settings?.enabled ?? false,
    allowedCountries: (settings?.allowedCountries ?? "KE").split(",").map((c: string) => c.trim()),
    blockTitle: settings?.blockTitle ?? "Access Restricted",
    blockMessage: settings?.blockMessage ?? "This service is currently only available in Kenya.",
    proxyTokens: Array.isArray(settings?.proxyTokens) ? settings.proxyTokens : [],
  };
  return NextResponse.json(result);
}

/**
 * PUT /api/admin/geo-block
 *
 * Body:
 *   - enabled: boolean
 *   - allowedCountries: string[] (ISO codes, e.g. ["KE", "UG"])
 *   - blockTitle: string
 *   - blockMessage: string
 */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (Array.isArray(body.allowedCountries)) {
    data.allowedCountries = body.allowedCountries
      .map((c: string) => c.trim().toUpperCase())
      .filter(Boolean)
      .join(",");
  }
  if (typeof body.blockTitle === "string") data.blockTitle = body.blockTitle.slice(0, 200);
  if (typeof body.blockMessage === "string") data.blockMessage = body.blockMessage.slice(0, 1000);

  // Sync the env vars so the middleware picks them up on the next request.
  // NOTE: process.env changes are only visible within this serverless
  // function instance. On Vercel, each function invocation may run in a
  // different instance. The REAL way to sync is to set env vars in the
  // Vercel dashboard. For now, we ALSO write to the DB so the admin UI
  // shows the current state, and we document that the admin needs to set
  // GEO_BLOCK_ENABLED + GEO_ALLOWED_COUNTRIES in Vercel env vars for
  // the middleware to pick them up.
  if (typeof body.enabled === "boolean") {
    process.env.GEO_BLOCK_ENABLED = body.enabled ? "true" : "false";
  }
  if (Array.isArray(body.allowedCountries)) {
    process.env.GEO_ALLOWED_COUNTRIES = body.allowedCountries
      .map((c: string) => c.trim().toUpperCase())
      .filter(Boolean)
      .join(",");
  }

  try {
    const existing = await db.geoBlockSettings.findUnique({ where: { id: 1 } });
    if (existing) {
      await db.geoBlockSettings.update({ where: { id: 1 }, data });
    } else {
      await db.geoBlockSettings.create({ data: { id: 1, ...data } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
  }

  await logAdminActionViaJwt(admin, "geo_block.update", data);
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/geo-block
 *
 * Generates a proxy token for a specific user to bypass geo-blocking.
 * Returns a URL the admin can share with the user.
 *
 * Body:
 *   - action: "create-proxy" | "revoke-proxy"
 *   - label: string (for "create-proxy" — a human-readable label)
 *   - token: string (for "revoke-proxy" — the token to revoke)
 */
export async function POST(req: NextRequest) {
  await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  let settings: any = null;
  try {
    settings = await db.geoBlockSettings.findUnique({ where: { id: 1 } });
  } catch {}

  const tokens: any[] = Array.isArray(settings?.proxyTokens) ? settings.proxyTokens : [];

  if (action === "create-proxy") {
    const label = (body?.label ?? "").toString().trim() || "Proxy access";
    const token = `proxy_${crypto.randomUUID().replace(/-/g, "")}`;
    const newToken = {
      token,
      label,
      createdAt: new Date().toISOString(),
      expiresAt: null, // no expiry — admin must manually revoke
    };
    tokens.push(newToken);

    try {
      await db.geoBlockSettings.upsert({
        where: { id: 1 },
        create: { id: 1, proxyTokens: tokens },
        update: { proxyTokens: tokens },
      });
    } catch (e: any) {
      return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
    }

    // Build the proxy URL — the user visits this URL, which sets a cookie
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://studybuddy-chi.vercel.app";
    const proxyUrl = `${baseUrl}/?proxy=${token}`;

    return NextResponse.json({ ok: true, token, proxyUrl, label });
  }

  if (action === "revoke-proxy") {
    const tokenToRevoke = (body?.token ?? "").toString();
    const filtered = tokens.filter((t) => t.token !== tokenToRevoke);

    try {
      await db.geoBlockSettings.upsert({
        where: { id: 1 },
        create: { id: 1, proxyTokens: filtered },
        update: { proxyTokens: filtered },
      });
    } catch (e: any) {
      return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
