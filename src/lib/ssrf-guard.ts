/**
 * BackendBuddy — SSRF guard (Phase 55).
 *
 * The API tester proxies user-specified absolute URLs through
 * /api/tools/http. Before any outbound fetch, `assertSafeUrl` blocks:
 * - non-http(s) protocols
 * - embedded credentials
 * - private / loopback / link-local / reserved IP literals
 *   (IPv4 + IPv6, including inet_aton-style obfuscations like
 *   "2130706433", "127.1", "0x7f000001")
 * - localhost and special-use hostnames (*.local, *.internal, …)
 *
 * DNS-level checks happen again at fetch time in the route (hostname
 * resolution can still land on a private address).
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".lan", ".home", ".corp"];

export function isPrivateIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  const a = o[0];
  const b = o[1];
  const c = o[2];
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 2 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4 + broadcast
  return false;
}

export function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === "::" || addr === "::1") return true; // unspecified + loopback
  if (addr.startsWith("::ffff:")) {
    const tail = addr.slice(7);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) return isPrivateIpv4(tail); // v4-mapped
    return false;
  }
  const first = addr.split(":")[0] ?? "";
  if (first.length === 4 && /^[0-9a-f]+$/.test(first)) {
    const hex = parseInt(first, 16);
    if ((hex & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((hex & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  }
  return false;
}

export function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

/**
 * Expands inet_aton-style numeric hosts to a dotted quad:
 * "2130706433" → "127.0.0.1", "127.1" → "127.0.0.1", "0x7f.0.0.1" → "127.0.0.1".
 * Returns null when the host is not in numeric form.
 */
export function decodeNumericHost(host: string): string | null {
  const parts = host.split(".");
  if (parts.length > 4) return null;

  const parseNum = (s: string): number | null => {
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    return null;
  };

  const nums: number[] = [];
  for (const part of parts) {
    const n = parseNum(part);
    if (n === null) return null;
    nums.push(n);
  }

  if (nums.length === 1) {
    const n = nums[0];
    if (n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }

  // Per inet_aton: the last value fills all remaining bytes.
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] > 255) return null;
  }
  const remaining = 4 - (nums.length - 1); // bytes the last value spans
  const last = nums[nums.length - 1];
  if (last >= Math.pow(256, remaining)) return null;

  const octets = nums.slice(0, -1);
  let rem = last;
  for (let i = remaining - 1; i >= 0; i--) {
    octets.push(Math.floor(rem / Math.pow(256, i)) % 256);
  }
  return octets.join(".");
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, ""); // strip FQDN trailing dot
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (host === host.replace(/\./g, "")) {
    // bare single-label hosts (e.g. "intranet") are risky behind corporate DNS
    return true;
  }
  return false;
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Validates a user-supplied URL before any network activity. */
export function assertSafeUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Blocked protocol "${url.protocol}" — only http/https are allowed.` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Embedded credentials (user:pass@) are not allowed." };
  }

  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);

  if (isBlockedHostname(host)) {
    return {
      ok: false,
      reason: `Blocked host "${host}" — internal/special-use hostnames are not allowed (SSRF protection).`,
    };
  }

  const numeric = decodeNumericHost(host);
  const looksLikeIp = numeric !== null || IPV4_RE.test(host) || host.includes(":");
  if (looksLikeIp) {
    const ip = numeric ?? host;
    if (isPrivateIp(ip)) {
      return {
        ok: false,
        reason: `Blocked address "${host}" — private/loopback network targets are not allowed (SSRF protection).`,
      };
    }
  }

  return { ok: true, url };
}
