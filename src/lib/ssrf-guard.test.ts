import { describe, it, expect } from "vitest";
import {
  assertSafeUrl,
  decodeNumericHost,
  isBlockedHostname,
  isPrivateIp,
  isPrivateIpv4,
  isPrivateIpv6,
} from "./ssrf-guard";

describe("isPrivateIpv4", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true], // cloud metadata
    ["100.64.0.1", true], // CGNAT
    ["0.0.0.0", true],
    ["198.18.0.1", true],
    ["224.0.0.1", true], // multicast
    ["240.0.0.1", true], // reserved
    ["255.255.255.255", true],
    ["172.32.0.1", false], // just outside 172.16/12
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["192.0.1.5", false], // TEST-NET-2 is allowed (documentation range)
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateIpv4(ip)).toBe(expected);
  });
});

describe("isPrivateIpv6", () => {
  it.each([
    ["::1", true],
    ["::", true],
    ["fe80::1", true],
    ["fc00::1", true],
    ["fd12:3456::1", true], // unique-local
    ["::ffff:127.0.0.1", true], // v4-mapped loopback
    ["::ffff:8.8.8.8", false],
    ["2001:4860:4860::8888", false],
    ["2606:4700::1111", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateIpv6(ip)).toBe(expected);
  });
});

describe("isPrivateIp dispatch", () => {
  it("routes v4 vs v6", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("8.8.4.4")).toBe(false);
    expect(isPrivateIp("2001:db8::1")).toBe(false);
  });
});

describe("decodeNumericHost", () => {
  it("expands inet_aton shorthands", () => {
    expect(decodeNumericHost("2130706433")).toBe("127.0.0.1");
    expect(decodeNumericHost("127.1")).toBe("127.0.0.1");
    expect(decodeNumericHost("1.2.3")).toBe("1.2.0.3");
    expect(decodeNumericHost("0x7f000001")).toBe("127.0.0.1");
    expect(decodeNumericHost("0x7f.0.0.1")).toBe("127.0.0.1");
  });

  it("returns null for non-numeric hosts", () => {
    expect(decodeNumericHost("example.com")).toBeNull();
    expect(decodeNumericHost("8.8.8.8")).toEqual("8.8.8.8");
  });

  it("rejects out-of-range values", () => {
    expect(decodeNumericHost("4294967296")).toBeNull(); // 2^32
    expect(decodeNumericHost("300.1.1.1")).toBeNull();
  });
});

describe("isBlockedHostname", () => {
  it.each([
    ["localhost", true],
    ["metadata.google.internal", true],
    ["my-service.local", true],
    ["db.internal.corp", true],
    ["intranet", true], // single-label: risky behind corporate DNS
    ["example.com", false],
    ["api.github.com", false],
    ["localhost.example.com", false],
  ])("%s → %s", (host, expected) => {
    expect(isBlockedHostname(host)).toBe(expected);
  });
});

describe("assertSafeUrl", () => {
  it("allows public http(s) URLs", () => {
    expect(assertSafeUrl("https://api.github.com/users/octocat")).toMatchObject({
      ok: true,
    });
    expect(assertSafeUrl("http://8.8.8.8/dns-query")).toMatchObject({ ok: true });
    expect(assertSafeUrl("https://example.com./path")).toMatchObject({ ok: true });
  });

  it.each([
    ["not a url", "Invalid URL"],
    ["ftp://example.com/file", "Blocked protocol"],
    ["file:///etc/passwd", "Blocked protocol"],
    ["https://user:pass@example.com/", "Embedded credentials"],
    ["http://localhost:3000/", "Blocked host"],
  ])("%s is rejected", (raw) => {
    const check = assertSafeUrl(raw);
    expect(check.ok).toBe(false);
  });

  it("blocks metadata and special-use hostnames", () => {
    expect(assertSafeUrl("http://metadata.google.internal/computeMetadata/").ok).toBe(false);
    expect(assertSafeUrl("https://printer.local/").ok).toBe(false);
    expect(assertSafeUrl("https://intranet/").ok).toBe(false);
  });

  it.each([
    "http://127.0.0.1/",
    "http://127.0.0.1:8080/admin",
    "http://10.0.0.1/",
    "http://192.168.1.50/",
    "http://172.16.5.4/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://2130706433/", // 127.0.0.1
    "http://127.1/", // 127.0.0.1
    "http://0x7f000001/", // 127.0.0.1
    "http://0x7f.0.0.1/",
    "http://0/", // 0.0.0.0
  ])("blocks private/obfuscated target %s", (raw) => {
    const check = assertSafeUrl(raw);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/SSRF|Blocked/);
  });

  it("rejects empty input", () => {
    expect(assertSafeUrl("").ok).toBe(false);
    expect(assertSafeUrl("   ").ok).toBe(false);
  });
});
