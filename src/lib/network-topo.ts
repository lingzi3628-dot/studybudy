/**
 * Network Topology Planner — Phase 59 (TVETBuddy)
 *
 * ICT trade: design a small office network and check it before you
 * "build" it. Covers the three things the CDACC ICT practicals grade:
 *
 *   1. Connectivity — can every device that needs the router reach it?
 *      (BFS over device links, with a rule that Wi-Fi links join an
 *      access point, not switch-to-switch)
 *   2. IPv4 subnet math — network/broadcast/usable range for a CIDR
 *      block, plus "does this subnet fit N hosts?"
 *   3. Sanity lint — duplicate IPs, devices with no link, switch uplink
 *      missing, AP overloaded, router missing.
 */

export type NetDeviceType = "router" | "switch" | "pc" | "printer" | "access-point" | "server";

export type NetDevice = {
  id: string;
  name: string;
  type: NetDeviceType;
  ip?: string;
  /** access points: how many wireless clients they support */
  wifiCapacity?: number;
};

export type NetLink = {
  from: string;
  to: string;
  kind: "ethernet" | "wifi";
  /** ethernet speed in Mbps (100 / 1000) */
  speedMbps?: number;
};

export type NetworkPlan = {
  devices: NetDevice[];
  links: NetLink[];
};

export type NetworkIssue = {
  severity: "error" | "warning";
  message: string;
  deviceId?: string;
};

// ---------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------

function adjacency(plan: NetworkPlan): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const d of plan.devices) adj.set(d.id, []);
  for (const l of plan.links) {
    adj.get(l.from)?.push(l.to);
    adj.get(l.to)?.push(l.from);
  }
  return adj;
}

/** Devices that can reach `targetId` (BFS over links). */
export function reachableFrom(plan: NetworkPlan, targetId: string): Set<string> {
  const adj = adjacency(plan);
  const seen = new Set<string>([targetId]);
  const queue = [targetId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------------
// Lint / validation
// ---------------------------------------------------------------------

const WIFI_DEVICE_TYPES: Set<NetDeviceType> = new Set(["pc", "printer", "server"]);

export function validateNetwork(plan: NetworkPlan): { issues: NetworkIssue[]; ok: boolean } {
  const issues: NetworkIssue[] = [];
  const byId = new Map(plan.devices.map((d) => [d.id, d]));
  const router = plan.devices.find((d) => d.type === "router");

  if (!router) {
    issues.push({ severity: "error", message: "No router in the design — without one there is no internet or inter-VLAN routing." });
  }

  // Duplicate IPs
  const ipOwners = new Map<string, string[]>();
  for (const d of plan.devices) {
    if (!d.ip) continue;
    const arr = ipOwners.get(d.ip) ?? [];
    arr.push(d.name);
    ipOwners.set(d.ip, arr);
  }
  for (const [ip, owners] of ipOwners) {
    if (owners.length > 1) {
      issues.push({
        severity: "error",
        message: `Duplicate IP ${ip} assigned to ${owners.join(" and ")} — an IP conflict breaks connectivity for both.`,
      });
    }
  }

  // Unlinked devices
  const linked = new Set(plan.links.flatMap((l) => [l.from, l.to]));
  for (const d of plan.devices) {
    if (!linked.has(d.id)) {
      issues.push({ severity: "warning", message: `${d.name} has no link — it is isolated.`, deviceId: d.id });
    }
  }

  // Wi-Fi link sanity: both ends must be wireless-capable (one is an AP)
  for (const l of plan.links) {
    if (l.kind !== "wifi") continue;
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    const ap = [a, b].find((d) => d?.type === "access-point");
    const client = [a, b].find((d) => d && WIFI_DEVICE_TYPES.has(d.type));
    if (!ap) {
      issues.push({
        severity: "error",
        message: `Wi-Fi link ${a?.name ?? "?"} ↔ ${b?.name ?? "?"} has no access point — wireless clients join through an AP.`,
      });
    } else if (!client) {
      issues.push({
        severity: "warning",
        message: `Wi-Fi link on ${ap.name} connects to ${[a, b].find((d) => d?.id !== ap.id)?.name ?? "?"} which is not a typical wireless client.`,
      });
    }
  }

  // AP capacity
  for (const ap of plan.devices.filter((d) => d.type === "access-point")) {
    const clients = plan.links.filter((l) => l.kind === "wifi" && (l.from === ap.id || l.to === ap.id)).length;
    const cap = ap.wifiCapacity ?? 16;
    if (clients > cap) {
      issues.push({
        severity: "warning",
        message: `${ap.name} has ${clients} wireless clients but supports about ${cap} — expect congestion and drops.`,
        deviceId: ap.id,
      });
    }
  }

  // Reachability: every PC/printer/server must reach the router
  if (router) {
    const reach = reachableFrom(plan, router.id);
    for (const d of plan.devices) {
      if (d.id === router.id) continue;
      if (["pc", "printer", "server"].includes(d.type) && !reach.has(d.id)) {
        issues.push({
          severity: "error",
          message: `${d.name} cannot reach the router — it has no internet or shared services path.`,
          deviceId: d.id,
        });
      }
    }
  }

  return { issues, ok: !issues.some((i) => i.severity === "error") };
}

// ---------------------------------------------------------------------
// IPv4 subnet math
// ---------------------------------------------------------------------

export type SubnetInfo = {
  cidr: string;
  networkAddress: string;
  broadcastAddress: string;
  firstUsable: string;
  lastUsable: string;
  usableHosts: number;
  totalAddresses: number;
  prefix: number;
  wildcardMask: string;
};

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = parseInt(p, 10);
    if (Number.isNaN(v) || v < 0 || v > 255 || !/^\d+$/.test(p)) return null;
    n = (n * 256) + v;
  }
  return n;
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/**
 * Full IPv4 subnet calculation for "a.b.c.d/prefix" (IPv4 only — the
 * syllabus scope). Returns null for malformed input.
 */
export function calculateSubnet(cidr: string): SubnetInfo | null {
  const m = cidr.match(/^([\d.]+)\/(\d{1,2})$/);
  if (!m) return null;
  const prefix = parseInt(m[2], 10);
  if (prefix < 0 || prefix > 32) return null;
  const ip = ipToInt(m[1]);
  if (ip === null) return null;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const total = 2 ** (32 - prefix);
  const broadcast = (network + total - 1) >>> 0;
  const usable = total > 2 ? total - 2 : 0;

  return {
    cidr,
    networkAddress: intToIp(network),
    broadcastAddress: intToIp(broadcast),
    firstUsable: total > 2 ? intToIp(network + 1) : intToIp(network),
    lastUsable: total > 2 ? intToIp(broadcast - 1) : intToIp(broadcast),
    usableHosts: usable,
    totalAddresses: total,
    prefix,
    wildcardMask: intToIp(~mask >>> 0),
  };
}

/** Can a subnet with the given prefix host `hosts` devices? */
export function subnetFits(prefix: number, hosts: number): boolean {
  if (prefix < 0 || prefix > 32) return false;
  return 2 ** (32 - prefix) - 2 >= hosts;
}
