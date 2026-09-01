import { describe, it, expect } from "vitest";
import {
  reachableFrom, validateNetwork, calculateSubnet, subnetFits,
  type NetworkPlan, type NetDevice,
} from "./network-topo";

const dev = (id: string, type: NetDevice["type"], name = id, ip?: string): NetDevice => ({ id, type, name, ip });

function office(): NetworkPlan {
  return {
    devices: [
      dev("r1", "router", "Router"),
      dev("sw1", "switch", "Switch"),
      dev("pc1", "pc", "PC 1"),
      dev("pc2", "pc", "PC 2"),
      dev("pr1", "printer", "Printer"),
    ],
    links: [
      { from: "r1", to: "sw1", kind: "ethernet", speedMbps: 1000 },
      { from: "sw1", to: "pc1", kind: "ethernet", speedMbps: 100 },
      { from: "sw1", to: "pc2", kind: "ethernet", speedMbps: 100 },
      { from: "sw1", to: "pr1", kind: "ethernet", speedMbps: 100 },
    ],
  };
}

describe("reachability", () => {
  it("all devices reach the router through the switch", () => {
    const plan = office();
    const reach = reachableFrom(plan, "r1");
    expect(reach.size).toBe(5);
  });

  it("a disconnected device cannot reach the router", () => {
    const plan = office();
    plan.devices.push(dev("pc3", "pc", "PC 3"));
    const reach = reachableFrom(plan, "r1");
    expect(reach.has("pc3")).toBe(false);
  });
});

describe("validateNetwork", () => {
  it("accepts a clean office plan", () => {
    const r = validateNetwork(office());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("errors when there is no router", () => {
    const plan = office();
    plan.devices = plan.devices.filter((d) => d.type !== "router");
    const r = validateNetwork(plan);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("No router"))).toBe(true);
  });

  it("flags devices that cannot reach the router", () => {
    const plan = office();
    plan.devices.push(dev("pc3", "pc", "PC 3"));
    const r = validateNetwork(plan);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("PC 3 cannot reach"))).toBe(true);
  });

  it("detects duplicate IPs", () => {
    const plan = office();
    plan.devices.find((d) => d.id === "pc1")!.ip = "192.168.1.10";
    plan.devices.find((d) => d.id === "pc2")!.ip = "192.168.1.10";
    const r = validateNetwork(plan);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("Duplicate IP"))).toBe(true);
  });

  it("warns about isolated devices and overloaded APs", () => {
    const plan = office();
    plan.devices.push(dev("ap1", "access-point", "AP"));
    const r = validateNetwork(plan);
    expect(r.issues.some((i) => i.message.includes("no link"))).toBe(true);

    // Add 20 wifi clients to a 16-capacity AP (via wifi links)
    const wifiPlan: NetworkPlan = {
      devices: [dev("r1", "router"), dev("ap1", "access-point", "AP"),
        ...Array.from({ length: 17 }, (_, i) => dev(`lp${i}`, "pc", `Laptop ${i}`))],
      links: [
        { from: "r1", to: "ap1", kind: "ethernet", speedMbps: 1000 },
        ...Array.from({ length: 17 }, (_, i) => ({ from: "ap1", to: `lp${i}`, kind: "wifi" as const })),
      ],
    };
    const r2 = validateNetwork(wifiPlan);
    expect(r2.issues.some((i) => i.message.includes("wireless clients"))).toBe(true);
  });

  it("errors when a wifi link has no access point", () => {
    const plan = office();
    plan.links.push({ from: "pc1", to: "pc2", kind: "wifi" });
    const r = validateNetwork(plan);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("no access point"))).toBe(true);
  });
});

describe("calculateSubnet", () => {
  it("computes a /24", () => {
    const s = calculateSubnet("192.168.1.0/24")!;
    expect(s.networkAddress).toBe("192.168.1.0");
    expect(s.broadcastAddress).toBe("192.168.1.255");
    expect(s.firstUsable).toBe("192.168.1.1");
    expect(s.lastUsable).toBe("192.168.1.254");
    expect(s.usableHosts).toBe(254);
    expect(s.totalAddresses).toBe(256);
    expect(s.wildcardMask).toBe("0.0.0.255");
  });

  it("computes a /26 (the classic exam question)", () => {
    const s = calculateSubnet("192.168.1.64/26")!;
    expect(s.networkAddress).toBe("192.168.1.64");
    expect(s.broadcastAddress).toBe("192.168.1.127");
    expect(s.firstUsable).toBe("192.168.1.65");
    expect(s.lastUsable).toBe("192.168.1.126");
    expect(s.usableHosts).toBe(62);
  });

  it("handles /30 point-to-point links and /32", () => {
    const s30 = calculateSubnet("10.0.0.4/30")!;
    expect(s30.usableHosts).toBe(2);
    expect(s30.firstUsable).toBe("10.0.0.5");
    expect(s30.lastUsable).toBe("10.0.0.6");
    const s32 = calculateSubnet("10.0.0.7/32")!;
    expect(s32.usableHosts).toBe(0);
  });

  it("normalizes a host address inside the block to the network address", () => {
    const s = calculateSubnet("192.168.1.123/24")!;
    expect(s.networkAddress).toBe("192.168.1.0");
  });

  it("returns null for garbage", () => {
    expect(calculateSubnet("not a subnet")).toBeNull();
    expect(calculateSubnet("192.168.1.0/33")).toBeNull();
    expect(calculateSubnet("300.168.1.0/24")).toBeNull();
  });

  it("subnetFits answers host-count questions", () => {
    expect(subnetFits(26, 62)).toBe(true);
    expect(subnetFits(26, 63)).toBe(false);
    expect(subnetFits(24, 254)).toBe(true);
  });
});
