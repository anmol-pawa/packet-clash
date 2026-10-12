import { describe, expect, it } from "vitest";
import { ROUTES, town, TOWNS } from "@/content/world";
import { COURIER, COURIER_H, COURIER_W } from "@/game/art/world/courier";
import { mapFrame } from "@/game/art/world/mapAnim";
import { gymLight, MAP_H, MAP_W, overworld } from "@/game/art/world/overworld";
import { doorstep, facing, journey, legPath, roadBetween, routeLength, walker } from "@/game/world/travel";
import { flipX, parseSprite } from "@/lib/pixel";

const ALL = [1, 2, 3, 4, 5, 6, 7, 8];
const gap = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

describe("walking the overworld", () => {
  it("lays every leg as a continuous walk from doorstep to doorstep, on the map", () => {
    for (const r of ROUTES)
      for (const from of [r.from, r.to]) {
        const p = legPath(r, from);
        expect(p[0]).toEqual(doorstep(town(from)));
        expect(p[p.length - 1]).toEqual(doorstep(town(from === r.from ? r.to : r.from)));
        for (let i = 1; i < p.length; i++) expect(gap(p[i - 1], p[i])).toBeLessThan(3);
        for (const [x, y] of p) {
          expect(x).toBeGreaterThanOrEqual(6);
          expect(x).toBeLessThan(MAP_W - 6);
          expect(y).toBeGreaterThanOrEqual(16);
          expect(y).toBeLessThan(MAP_H);
        }
      }
  });

  it("follows the painted road between towns, over road pixels", () => {
    const { image } = overworld();
    const roadish = new Set(["#e8c890", "#d2ab6d", "#a77d4a", "#c08a52", "#94653a", "#5e3e24"]);
    for (const r of ROUTES) {
      const mid = roadBetween(r, r.from);
      expect(mid.length).toBeGreaterThan(20);
      const on = mid.filter(([x, y]) => roadish.has(image.palette[image.rows[Math.round(y)][Math.round(x)]])).length;
      expect(on / mid.length).toBeGreaterThan(0.97);
    }
  });

  it("goes the same distance either way along a road", () => {
    const r1 = ROUTES[0];
    const fwd = legPath(r1, r1.from);
    const back = legPath(r1, r1.to);
    const len = (p: [number, number][]) => p.reduce((s, q, i) => (i ? s + gap(p[i - 1], q) : 0), 0);
    expect(Math.abs(len(fwd) - len(back))).toBeLessThan(0.01);
  });

  it("finds the shortest open journey (Dijkstra by road length)", () => {
    // with only the first badge, the only open road out of Layer Landing is Route 1
    expect(journey("layer-landing", "copperfield", [1])?.towns).toEqual(["layer-landing", "copperfield"]);
    expect(journey("layer-landing", "hopwood", [1])).toBeNull(); // Hopwood is still locked
    expect(journey("copperfield", "copperfield", [1])?.routes).toEqual([]);
    // with everything open, Route 9 (Wi-Fi bridge) beats the long way round via Copperfield and Octet Harbor
    const j = journey("layer-landing", "hopwood", ALL)!;
    expect(j.routes.map((r) => r.id)).toEqual(["r9"]);
    // and it really is the shortest: compare with every simple path by brute force
    const brute = (from: string, to: string, seen: Set<string>): number => {
      if (from === to) return 0;
      let best = Infinity;
      for (const r of ROUTES) {
        const next = r.from === from ? r.to : r.to === from ? r.from : null;
        if (!next || seen.has(next)) continue;
        best = Math.min(best, routeLength(r) + brute(next, to, new Set([...seen, next])));
      }
      return best;
    };
    for (const a of TOWNS)
      for (const b of TOWNS) {
        const jj = journey(a.id, b.id, ALL)!;
        const sum = jj.routes.reduce((s, r) => s + routeLength(r), 0);
        expect(sum).toBeCloseTo(brute(a.id, b.id, new Set([a.id])), 6);
        expect(jj.towns[0]).toBe(a.id);
        expect(jj.towns[jj.towns.length - 1]).toBe(b.id);
        for (let i = 1; i < jj.points.length; i++) expect(gap(jj.points[i - 1], jj.points[i])).toBeLessThan(3);
      }
  });

  it("walks a path by distance and faces the way it moves", () => {
    expect(facing([0, 0], [5, 1])).toBe("right");
    expect(facing([0, 0], [-5, 1])).toBe("left");
    expect(facing([0, 0], [1, -5])).toBe("up");
    expect(facing([0, 0], [1, 5])).toBe("down");
    expect(facing([2, 2], [2, 2], "left")).toBe("left");
    const w = walker([[0, 0], [10, 0], [10, 10]]);
    expect(w.total).toBe(20);
    expect(w.at(5).pos).toEqual([5, 0]);
    expect(w.at(5).facing).toBe("right");
    expect(w.at(15).pos).toEqual([10, 5]);
    expect(w.at(15).facing).toBe("down");
    expect(w.at(25)).toMatchObject({ pos: [10, 10], done: true });
  });
});

describe("courier sprite", () => {
  it("has a 4-frame walk cycle per direction at 12×16, outlined and in one palette", () => {
    for (const frames of Object.values(COURIER)) {
      expect(frames).toHaveLength(4);
      for (const f of frames) {
        const g = parseSprite(f);
        expect([g.width, g.height]).toEqual([COURIER_W, COURIER_H]);
        expect(g.pixels.filter((c) => c === "#1a1424").length).toBeGreaterThan(30);
        expect(new Set(g.pixels.filter(Boolean)).size).toBeGreaterThanOrEqual(10);
      }
      expect(frames[0].rows).toEqual(frames[2].rows); // stand, step, stand, other step
      expect(frames[1].rows).not.toEqual(frames[3].rows);
    }
    expect(COURIER.right[1].rows).toEqual(flipX(COURIER.left[1]).rows);
    expect(COURIER.down[0].rows).not.toEqual(COURIER.up[0].rows); // front and back differ
  });
});

describe("map animation", () => {
  it("paints the gym lights where the antennae are", () => {
    const { image } = overworld();
    for (const t of TOWNS) {
      const [x, y] = gymLight(t);
      expect(image.palette[image.rows[y][x]]).toBe("#ff5a5a");
    }
  });

  it("laps the foam, drifts glints, blinks open gyms and runs packets only on open links", () => {
    const { water } = overworld();
    const a = mapFrame(0, [1]);
    const b = mapFrame(4, [1]);
    expect(a.length).toBeGreaterThan(500);
    const colourAt = (f: [number, string][]) => new Map(f);
    const ma = colourAt(a);
    const mb = colourAt(b);
    let changed = 0;
    for (const [i, c] of ma) if (water[i] && mb.get(i) !== undefined && mb.get(i) !== c) changed++;
    expect(changed).toBeGreaterThan(200); // the shoreline foam swapped
    for (const [i] of a) expect(i >= 0 && i < MAP_W * MAP_H).toBe(true);
    // gym 1 and 2 are open with one badge; gym 3 is dark
    const lit = (tick: number, t: (typeof TOWNS)[number], badges: number[]) => {
      const [x, y] = gymLight(t);
      return new Map(mapFrame(tick, badges)).get(y * MAP_W + x);
    };
    const seenOn = new Set(Array.from({ length: 12 }, (_, k) => lit(k, TOWNS[0], [1])));
    expect(seenOn.has("#fff4b0")).toBe(true);
    expect(seenOn.has(undefined)).toBe(true); // off half the time: blinking
    expect(lit(0, TOWNS[2], [1])).toBe("#5a2a34");
    // packets: one head + tail per open road, all on land/road pixels, none on closed roads
    const packets = (badges: number[]) => mapFrame(0, badges).filter(([, c]) => c === "#ffffff").length;
    expect(packets([])).toBe(0);
    expect(packets([1])).toBe(1); // only Route 1 is open
    expect(packets(ALL)).toBe(ROUTES.length);
  });
});
