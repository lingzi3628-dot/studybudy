import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";
import { getCurrentUser } from "@/lib/auth";
import { assertSafeUrl, isPrivateIp } from "@/lib/ssrf-guard";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Phase 55 — SSRF-guarded HTTP client proxy for BackendBuddy's API tester.
 *
 * Browsers cannot fetch arbitrary user URLs directly (CORS), so the tester
 * posts here and this route performs the outbound request under strict
 * controls:
 *
 * - Auth required (`getCurrentUser`), per-user sliding-window rate limit.
 * - `assertSafeUrl` blocks non-http(s), embedded credentials, private /
 *   loopback / link-local / obfuscated IP literals, and special-use
 *   hostnames (see src/lib/ssrf-guard.ts).
 * - DNS re-check before connecting — hostname resolution must not land on
 *   a private address (defends against DNS rebinding).
 * - Redirects are followed manually (max 3) and every hop is re-validated
 *   with the full URL + DNS checks.
 * - Method allowlist, request/response size caps, upstream timeout.
 *
 * Request:  { url, method?, headers?, body? }
 * Response: { status, statusText, contentType, headers, body, truncated,
 *             durationMs, finalUrl, redirects }
 * Errors:   400 invalid input · 403 SSRF-blocked · 429 rate-limited
 *           502 upstream/response error · 504 upstream timeout
 */

class SsrfBlockedError extends Error {}

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const HOP_BY_HOP_HEADERS = new Set([
  "host", "content-length", "connection", "keep-alive", "transfer-encoding",
  "upgrade", "proxy-authorization", "proxy-authenticate", "te", "trailer",
]);

const MAX_REDIRECTS = 3;
const MAX_REQUEST_BODY_BYTES = 100_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_BODY_TEXT_CHARS = 100_000;
const UPSTREAM_TIMEOUT_MS = 15_000;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const rateBuckets = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    rateBuckets.set(userId, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(userId, hits);
  if (rateBuckets.size > 5000) {
    const cutoff = now - RATE_WINDOW_MS;
    for (const [key, value] of rateBuckets) {
      if (!value.some((t) => t >= cutoff)) rateBuckets.delete(key);
    }
  }
  return false;
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

async function assertDnsSafe(hostname: string): Promise<void> {
  const bare = stripBrackets(hostname);
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(bare, { all: true });
  } catch {
    throw new Error(`DNS lookup failed for "${bare}".`);
  }
  if (!addrs.length) throw new Error(`DNS lookup returned no addresses for "${bare}".`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new SsrfBlockedError(
        `"${bare}" resolves to a private address (${a.address}) — blocked.`
      );
    }
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  if (isRateLimited(user.id)) {
    return NextResponse.json(
      { error: "Too many requests — the API tester allows 12 requests per minute." },
      { status: 429 }
    );
  }

  const payload = await req.json().catch(() => ({})) as {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  const rawUrl = (payload.url ?? "").toString().trim();
  if (!rawUrl) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (rawUrl.length > 2048) {
    return NextResponse.json({ error: "url too long (max 2048 chars)" }, { status: 400 });
  }

  const method = (payload.method ?? "GET").toString().toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: `Method "${method}" is not allowed.` }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  if (payload.headers && typeof payload.headers === "object") {
    for (const [key, value] of Object.entries(payload.headers).slice(0, 20)) {
      const name = key.toString().trim().slice(0, 100);
      if (!name || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
      headers[name] = value.toString().slice(0, 2000);
    }
  }

  const checked = assertSafeUrl(rawUrl);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.reason }, { status: 403 });
  }
  let target: URL = checked.url;

  const requestText = BODY_METHODS.has(method) && typeof payload.body === "string"
    ? payload.body.slice(0, MAX_REQUEST_BODY_BYTES)
    : undefined;

  try {
    await assertDnsSafe(target.hostname);
  } catch (e) {
    const blocked = e instanceof SsrfBlockedError;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "DNS lookup failed." },
      { status: blocked ? 403 : 502 }
    );
  }

  const started = Date.now();
  let upstream: Response | null = null;
  let finalUrl = target;
  let redirects = 0;

  try {
    for (;;) {
      const res = await fetch(finalUrl, {
        method,
        headers: { ...headers, "user-agent": "StudyBuddy-API-Tester/1.0 (+ssrf-guarded)" },
        body: requestText,
        redirect: "manual",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      const isRedirect = [301, 302, 303, 307, 308].includes(res.status);
      if (isRedirect && redirects < MAX_REDIRECTS) {
        const location = res.headers.get("location");
        if (!location) {
          upstream = res;
          break;
        }
        const next = new URL(location, finalUrl);
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          return NextResponse.json(
            { error: `Redirect to "${next.protocol}" is blocked.` },
            { status: 403 }
          );
        }
        const nextCheck = assertSafeUrl(next.toString());
        if (!nextCheck.ok) {
          return NextResponse.json(
            { error: `Redirect blocked: ${nextCheck.reason}` },
            { status: 403 }
          );
        }
        await assertDnsSafe(next.hostname);
        finalUrl = next;
        redirects += 1;
        continue;
      }

      upstream = res;
      break;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upstream request failed.";
    const timedOut = /timeout|aborted?|signal/i.test(message);
    return NextResponse.json(
      {
        error: timedOut
          ? `Upstream timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s.`
          : message,
      },
      { status: timedOut ? 504 : 502 }
    );
  }

  if (!upstream) {
    return NextResponse.json({ error: "No response from upstream." }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    return NextResponse.json(
      { error: `Response too large (${declaredLength} bytes; max ${MAX_RESPONSE_BYTES}).` },
      { status: 502 }
    );
  }

  let bytes = 0;
  let text = "";
  try {
    const buffer = await upstream.arrayBuffer();
    bytes = buffer.byteLength;
    const usable = buffer.byteLength > MAX_RESPONSE_BYTES
      ? buffer.slice(0, MAX_RESPONSE_BYTES)
      : buffer;
    text = new TextDecoder("utf-8", { fatal: false }).decode(usable);
  } catch {
    text = "";
  }

  const responseHeaders: Record<string, string> = {};
  let headerCount = 0;
  upstream.headers.forEach((value, key) => {
    if (headerCount >= 20) return;
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    responseHeaders[key] = value.slice(0, 500);
    headerCount += 1;
  });

  return NextResponse.json({
    status: upstream.status,
    statusText: upstream.statusText,
    contentType,
    headers: responseHeaders,
    body: text.slice(0, MAX_BODY_TEXT_CHARS),
    truncated: bytes > MAX_RESPONSE_BYTES || text.length > MAX_BODY_TEXT_CHARS,
    durationMs: Date.now() - started,
    finalUrl: finalUrl.toString(),
    redirects,
  });
}
