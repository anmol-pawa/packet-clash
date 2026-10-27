import { isRouteOpen, regionOf, regionRoutes, routePoints, town, type Route, type Town } from "@/content/world";
import { roadSamples, roadSeed } from "@/game/art/world/overworld";

/**
 * Walking the overworld: the player's courier follows the painted roads from
 * town to town. Journeys take the shortest open path by road length
 * (Dijkstra, the same idea the Hopwood gym teaches), and every leg is a
 * dense list of map pixels so the sprite moves smoothly along the road.
 */

export type Pt = [number, number];
export type Facing = "down" | "up" | "left" | "right";

/** Where the courier stands in a town: on the plaza just right of the gym door, so the gym stays in view. */
export const doorstep = (t: Town): Pt => [t.x + 11, t.y + 11];

/** The box a town's buildings fill; the road is hidden under them. */
const inTown = (t: Town, [x, y]: Pt) => Math.abs(x - t.x) <= 20 && Math.abs(y - t.y) <= 13;

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A straight line as points about 1 px apart (excluding `a`). */
function line(a: Pt, b: Pt): Pt[] {
  const n = Math.max(1, Math.ceil(dist(a, b)));
  return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n] as Pt);
}

/** The painted road of a route, from `from` to `to`, as it runs outside both towns. */
export function roadBetween(r: Route, fromId: string): Pt[] {
  const pts = roadSamples(routePoints(r), roadSeed(r));
  const road = r.from === fromId ? pts : [...pts].reverse();
  const a = town(fromId);
  const b = town(r.from === fromId ? r.to : r.from);
  return road.filter((p) => !inTown(a, p) && !inTown(b, p));
}

/** Leaves (or enters) a town around the front of the buildings instead of through them. */
function townLeg(t: Town, exit: Pt): Pt[] {
  const side: Pt = [t.x + (exit[0] >= t.x ? 19 : -19), t.y + 9];
  return [...line(doorstep(t), side), ...line(side, exit)];
}

/** One whole leg: doorstep → out of town → along the road → into town → doorstep. */
export function legPath(r: Route, fromId: string): Pt[] {
  const a = town(fromId);
  const b = town(r.from === fromId ? r.to : r.from);
  const road = roadBetween(r, fromId);
  const out = townLeg(a, road[0]);
  const inn = townLeg(b, road[road.length - 1]).reverse();
  return [doorstep(a), ...out, ...road.slice(1), ...inn.slice(1), doorstep(b)];
}

export const pathLength = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);

const lengthCache = new Map<string, number>();
/** How far the road of a route is, in map pixels. */
export function routeLength(r: Route): number {
  let n = lengthCache.get(r.id);
  if (n === undefined) {
    n = pathLength(legPath(r, r.from));
    lengthCache.set(r.id, n);
  }
  return n;
}

export interface Journey {
  /** Towns visited in order, including both ends. */
  towns: string[];
  routes: Route[];
  /** Every pixel the courier walks through. */
  points: Pt[];
  length: number;
}

/** The shortest open journey between two towns (Dijkstra by road length), or null if none. */
export function journey(fromId: string, toId: string, badges: readonly number[]): Journey | null {
  // a journey stays on one region's roads; crossing regions is a ferry (see WorldMap)
  const region = regionOf(town(fromId).gym);
  if (region !== regionOf(town(toId).gym)) return null;
  const roads = regionRoutes(region);
  const best = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, { town: string; route: Route }>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    for (const [id, d] of best) if (!done.has(id) && (cur === null || d < best.get(cur)!)) cur = id;
    if (cur === null) return null;
    if (cur === toId) break;
    done.add(cur);
    for (const r of roads) {
      if (!isRouteOpen(r, badges)) continue;
      const next = r.from === cur ? r.to : r.to === cur ? r.from : null;
      if (!next || done.has(next)) continue;
      const d = best.get(cur)! + routeLength(r);
      if (d < (best.get(next) ?? Infinity)) {
        best.set(next, d);
        prev.set(next, { town: cur, route: r });
      }
    }
  }
  const towns = [toId];
  const routes: Route[] = [];
  for (let id = toId; id !== fromId; ) {
    const p = prev.get(id)!;
    routes.unshift(p.route);
    towns.unshift(p.town);
    id = p.town;
  }
  const points: Pt[] = [doorstep(town(fromId))];
  routes.forEach((r, i) => points.push(...legPath(r, towns[i]).slice(1)));
  return { towns, routes, points, length: pathLength(points) };
}

/** Which way a step from `a` to `b` faces. */
export function facing(a: Pt, b: Pt, fallback: Facing = "down"): Facing {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/** Precomputed cumulative distances so the courier's position can be looked up by distance walked. */
export function walker(points: Pt[]) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  /** Position and facing after walking `d` pixels (clamped to the path). */
  const at = (d: number): { pos: Pt; facing: Facing; done: boolean } => {
    if (d >= total) return { pos: points[points.length - 1], facing: "down", done: true };
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = points[lo];
    const b = points[hi];
    const t = (Math.max(0, d) - cum[lo]) / (cum[hi] - cum[lo] || 1);
    // face along a short look-ahead so road wobble doesn't flicker the sprite
    const ahead = points[Math.min(points.length - 1, hi + 4)];
    return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], facing: facing(a, ahead), done: false };
  };
  return { total, at };
}
