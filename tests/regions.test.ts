import { describe, expect, it } from "vitest";
import { NEW_REGIONS, NEW_ROUTES, NEW_TOWNS } from "@/content/regions";
import { ferries, MAINLAND_ROUTES as ROUTES, MAINLAND_TOWNS as TOWNS, regionOf, regionRoutes, regionTowns, type RegionId } from "@/content/world";
import { mapFrame } from "@/game/art/world/mapAnim";
import { MAP_W, overworld } from "@/game/art/world/overworld";
import { journey, roadBetween } from "@/game/world/travel";
import { parseSprite } from "@/lib/pixel";
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
  it("keeps every town on its 320x224 map; leaders are opened as they are drawn", () => {
    for (const t of NEW_TOWNS) {
      expect(t.x).toBeGreaterThan(20);
      expect(t.x).toBeLessThan(300);
      expect(t.y).toBeGreaterThan(16);
      expect(t.y).toBeLessThan(208);
      expect(t.bossSprite === null || t.bossSprite === t.boss.toLowerCase()).toBe(true);
    }
  });
});

const REGION_IDS: RegionId[] = ["mainland", "cisco-cove", "scale-citadel"];

describe("region maps", () => {
  it("splits towns and roads by region, with the two ferries linking them", () => {
    expect(REGION_IDS.map((r) => regionTowns(r).length)).toEqual([9, 4, 3]);
    expect(REGION_IDS.map((r) => regionRoutes(r).length)).toEqual([11, 3, 2]);
    expect(ferries().map((r) => r.id)).toEqual(["r12", "r16"]);
  });
  it("paints a distinct 320x224 map per region with every town on dry land", () => {
    const rows = REGION_IDS.map((r) => overworld(r).image.rows.join(""));
    expect(new Set(rows).size).toBe(3);
    for (const r of REGION_IDS) {
      const { image, water } = overworld(r);
      expect(image.rows.length).toBe(224);
      for (const t of regionTowns(r)) expect(water[t.y * MAP_W + t.x]).toBe(0);
    }
  });
  it("lays every road under the courier's feet, on each region's own painting", () => {
    const roadish = new Set(["#e8c890", "#d2ab6d", "#a77d4a", "#c08a52", "#94653a", "#5e3e24"]);
    for (const reg of REGION_IDS.slice(1)) {
      const grid = parseSprite(overworld(reg).image);
      for (const r of regionRoutes(reg)) {
        const mid = roadBetween(r, r.from).filter((_, i, a) => i % 3 === 0 && i > a.length * 0.2 && i < a.length * 0.8);
        const on = mid.filter(([x, y]) => roadish.has(grid.pixels[Math.round(y) * MAP_W + Math.round(x)] ?? "")).length;
        expect(on / mid.length, r.id).toBeGreaterThan(0.95);
      }
    }
  });
  it("walks within a region and never along a ferry", () => {
    expect(journey("trunk-reef", "shield-haven", [9, 10, 11, 12])?.routes.map((r) => r.id)).toEqual(["r13", "r14", "r15"]);
    expect(journey("trunk-reef", "static-strand", [])).toBeNull(); // still locked
    expect(journey("backbone-summit", "trunk-reef", [9])).toBeNull();
    expect(journey("balancer-bluff", "offer-spire", [9, 13, 14, 15])?.routes.map((r) => r.id)).toEqual(["r17", "r18"]);
  });
  it("runs packets only on a region's own open roads", () => {
    const packets = (badges: number[], reg: RegionId) => mapFrame(0, badges, reg).filter(([, c]) => c === "#ffffff").length;
    const all = Array.from({ length: 16 }, (_, i) => i + 1);
    expect(packets(all, "cisco-cove")).toBe(3);
    expect(packets(all, "scale-citadel")).toBe(2);
    expect(packets([9], "cisco-cove")).toBe(0);
    expect(packets([9, 10], "cisco-cove")).toBe(1);
  });
});
