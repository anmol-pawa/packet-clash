import { describe, expect, it } from "vitest";
import { NEW_REGIONS, NEW_ROUTES, NEW_TOWNS, regionOf } from "@/content/regions";
import { ROUTES, TOWNS } from "@/content/world";
import { hostRange, parseCidr, parseIp } from "@/lib/net/ipv4";

const overlaps = (a: { network: number; prefix: number }, b: { network: number; prefix: number }) => {
  const p = Math.min(a.prefix, b.prefix);
  return a.network >>> (32 - p) === b.network >>> (32 - p);
};

describe("new regions (data model)", () => {
  it("continues the gym numbering 10-16 and splits 4 + 3", () => {
    expect(NEW_TOWNS.map((t) => t.gym)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(NEW_REGIONS.map((r) => r.gyms.length)).toEqual([4, 3]);
    expect(NEW_REGIONS.flatMap((r) => r.gyms)).toEqual(NEW_TOWNS.map((t) => t.gym));
    expect(NEW_TOWNS.map((t) => regionOf(t.gym))).toEqual(["cisco-cove", "cisco-cove", "cisco-cove", "cisco-cove", "scale-citadel", "scale-citadel", "scale-citadel"]);
  });
  it("has unique ids, names, bosses and badges, none clashing with the mainland", () => {
    const all = [...TOWNS, ...NEW_TOWNS];
    for (const key of ["id", "name", "boss", "badge", "badgeColor"] as const) expect(new Set(all.map((t) => t[key])).size).toBe(all.length);
  });
  it("gives each town its own /24 at .0 and each route its own /30 with two usable ends", () => {
    const nets = [...TOWNS, ...NEW_TOWNS].map((t) => parseCidr(t.subnet));
    nets.forEach((n, i) => {
      expect(n.prefix).toBe(24);
      expect(n.network & 255).toBe(0);
      nets.slice(i + 1).forEach((m) => expect(overlaps(n, m)).toBe(false));
    });
    const links = [...ROUTES, ...NEW_ROUTES].map((r) => parseCidr(r.link));
    links.forEach((l, i) => {
      expect(l.prefix).toBe(30);
      expect(l.network % 4).toBe(0);
      expect(hostRange(l)[1] - hostRange(l)[0]).toBe(1);
      links.slice(i + 1).forEach((m) => expect(overlaps(l, m)).toBe(false));
      nets.forEach((n) => expect(overlaps(l, n)).toBe(false));
    });
    expect(hostRange(parseCidr(NEW_ROUTES[0].link))[0]).toBe(parseIp("10.255.0.45"));
  });
  it("chains each gym to the previous one, starting at the Backbone Summit", () => {
    const ids = new Set([...TOWNS, ...NEW_TOWNS].map((t) => t.id));
    for (const r of NEW_ROUTES) {
      expect(ids.has(r.from) && ids.has(r.to)).toBe(true);
      expect(r.from).not.toBe(r.to);
    }
    const order = ["backbone-summit", ...NEW_TOWNS.map((t) => t.id)];
    for (let i = 1; i < order.length; i++) expect(NEW_ROUTES.some((r) => r.from === order[i - 1] && r.to === order[i])).toBe(true);
  });
  it("keeps every town on its 320x224 map and leaves leaders to be drawn", () => {
    for (const t of NEW_TOWNS) {
      expect(t.x).toBeGreaterThan(20);
      expect(t.x).toBeLessThan(300);
      expect(t.y).toBeGreaterThan(16);
      expect(t.y).toBeLessThan(208);
      expect(t.bossSprite).toBeNull();
    }
  });
});
