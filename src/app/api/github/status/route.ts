import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptApiKey } from "@/lib/crypto";

export const runtime = "nodejs";

/**
 * GET /api/github/status
 * Returns the current user's GitHub connection status.
 */
export async function GET() {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  return NextResponse.json({
    connected: Boolean(user.githubTokenEncrypted),
    username: user.githubUsername ?? null,
    connectedAt: user.githubConnectedAt ?? null,
  });
}

/**
 * POST /api/github/connect
 * Body: { code: "github_oauth_code" }
 * Exchanges the OAuth code for an access token, stores it encrypted.
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const code = body?.code;
  if (!code) return NextResponse.json({ error: "OAuth code required" }, { status: 400 });

  // Fetch GitHub OAuth settings
  let settings: any = null;
  try {
    settings = await db.githubSettings.findUnique({ where: { id: 1 } });
  } catch {}

  if (!settings?.enabled || !settings?.clientId || !settings?.clientSecretEncrypted) {
    return NextResponse.json({ error: "GitHub OAuth is not configured. Ask an admin to set it up." }, { status: 503 });
  }

  const { decryptApiKey } = await import("@/lib/crypto");
  const clientSecret = decryptApiKey(settings.clientSecretEncrypted);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
  const redirectUri = `${appUrl}/api/github/callback`;

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: settings.clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: `GitHub OAuth failed: ${tokenData.error_description || tokenData.error}` }, { status: 400 });
  }

  // Fetch the user's GitHub profile
  const profileRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github.v3+json" },
  });
  const profile = await profileRes.json();
  const githubId = String(profile.id);
  const githubUsername = profile.login;

  // Store the encrypted token + GitHub info on the user
  await db.user.update({
    where: { id: user.id },
    data: {
      githubId,
      githubUsername,
      githubTokenEncrypted: encryptApiKey(accessToken),
      githubConnectedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    username: githubUsername,
  });
}

/**
 * DELETE /api/github/status
 * Disconnects the user's GitHub account (removes token).
 */
export async function DELETE() {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  await db.user.update({
    where: { id: user.id },
    data: {
      githubId: null,
      githubUsername: null,
      githubTokenEncrypted: null,
      githubConnectedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
