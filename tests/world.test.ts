import { describe, expect, it } from "vitest";
import { currentTown, isRouteOpen, isUnlocked, reachable, ROUTES, routePoints, town, TOWNS, townCidr } from "@/content/world";
import { contains, hostRange, isPrivate, overlaps, parseCidr, parseIp, usableHosts } from "@/lib/net/ipv4";

describe("world map", () => {
  it("has nine gyms in order, one per chapter 2.1–2.9, with unique ids and names", () => {
    expect(TOWNS.map((t) => t.gym)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(TOWNS.map((t) => t.chapter)).toEqual(["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9"]);
    for (const key of ["id", "name", "boss", "badge"] as const) expect(new Set(TOWNS.map((t) => t[key])).size).toBe(9);
  });

  it("gives every town its own private /24 LAN", () => {
    const nets = TOWNS.map(townCidr);
    for (const n of nets) {
      expect(n.prefix).toBe(24);
      expect(usableHosts(n.prefix)).toBe(254);
      expect(isPrivate(n.network)).toBe(true);
    }
    for (let i = 0; i < nets.length; i++) for (let j = i + 1; j < nets.length; j++) expect(overlaps(nets[i], nets[j])).toBe(false);
  });

  it("joins towns with /30 point-to-point links that don't collide with any LAN", () => {
    const links = ROUTES.map((r) => parseCidr(r.link));
    links.forEach((l, i) => {
      expect(l.prefix).toBe(30);
      expect(usableHosts(l.prefix)).toBe(2); // one address per router
      expect(ROUTES[i].link).toBe(`${[24, 16, 8, 0].map((s) => (l.network >>> s) & 255).join(".")}/30`); // written as the network address
      for (const t of TOWNS) expect(overlaps(l, townCidr(t))).toBe(false);
      for (let j = i + 1; j < links.length; j++) expect(overlaps(l, links[j])).toBe(false);
      const [a, b] = hostRange(l);
      expect(b - a).toBe(1);
    });
    // e.g. Route 2's routers are 10.255.0.5 and 10.255.0.6
    expect(hostRange(parseCidr(ROUTES[1].link))).toEqual([parseIp("10.255.0.5"), parseIp("10.255.0.6")]);
    expect(contains(parseCidr("10.255.0.0/24"), parseIp("10.255.0.6"))).toBe(true);
  });

  it("is a connected mesh (every town reachable, with redundant paths)", () => {
    const all = TOWNS.map((t) => t.gym);
    expect(reachable("layer-landing", all).size).toBe(9);
    expect(ROUTES.length).toBeGreaterThan(TOWNS.length - 1);
    for (const r of ROUTES) expect(r.from).not.toBe(r.to);
    // each consecutive gym pair is directly linked, so the badge path is walkable
    for (let g = 1; g < 9; g++) {
      const a = TOWNS[g - 1].id;
      const b = TOWNS[g].id;
      expect(ROUTES.some((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a))).toBe(true);
    }
  });

  it("unlocks towns one badge at a time", () => {
    expect(TOWNS.filter((t) => isUnlocked(t, [])).map((t) => t.gym)).toEqual([1]);
    expect(TOWNS.filter((t) => isUnlocked(t, [1])).map((t) => t.gym)).toEqual([1, 2]);
    expect(TOWNS.filter((t) => isUnlocked(t, [1, 2, 3])).map((t) => t.gym)).toEqual([1, 2, 3, 4]);
    expect(currentTown([]).id).toBe("layer-landing");
    expect(currentTown([1, 2]).id).toBe("octet-harbor");
    expect(currentTown([1, 2, 3, 4, 5, 6, 7, 8, 9]).id).toBe("backbone-summit");
    expect(reachable("layer-landing", [1]).size).toBe(2);
    expect(isRouteOpen(ROUTES.find((r) => r.id === "r9")!, [1, 2])).toBe(false);
    expect(isRouteOpen(ROUTES.find((r) => r.id === "r9")!, [1, 2, 3])).toBe(true);
  });

  it("keeps towns and roads on the 320×224 map", () => {
    for (const r of ROUTES) for (const [x, y] of routePoints(r)) {
      expect(x).toBeGreaterThanOrEqual(12);
      expect(x).toBeLessThanOrEqual(308);
      expect(y).toBeGreaterThanOrEqual(24);
      expect(y).toBeLessThanOrEqual(212);
    }
    expect(town("layer-landing").bossSprite).toBe("stackadon");
    expect(town("octet-harbor").bossSprite).toBe("cidrab");
    expect(town("copperfield").bossSprite).toBe("braidwyrm");
    expect(town("hopwood").bossSprite).toBe("hootpath");
    expect(town("handshake-harbor").bossSprite).toBe("synackle");
    expect(town("resolvia").bossSprite).toBe("oraclynx");
  });
});
