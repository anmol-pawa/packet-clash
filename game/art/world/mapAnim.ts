import { isRouteOpen, isUnlocked, regionRoutes, regionTowns, routePoints, type RegionId } from "@/content/world";
import { gymLight, MAP_H, MAP_W, overworld, roadSamples, roadSeed } from "./overworld";

/**
 * The overworld's living layer, drawn over the painting each tick: foam that
 * laps at the coast, glints drifting across the deep sea, the light on each
 * open gym's antenna blinking, and packets of light running along the open
 * links. Pure: `mapFrame(tick, badges)` lists the pixels to paint.
 */

export const MAP_TICK_MS = 125;

const FOAM = "#d6f1fa";
const SHALLOW = "#63b0de";
const GLINT = "#8bc6ea";
const LIGHT_ON = "#fff4b0";
const LIGHT_GLOW = "#ff9a7a";
const LIGHT_OFF = "#5a2a34";
const PACKET = "#ffffff";
const PACKET_TAIL = "#ffe17a";

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

interface Static {
  foam: number[];
  deep: { i: number; diag: number; h: number }[];
  roads: [number, number][][];
}
const cache = new Map<RegionId, Static>();
function statics(region: RegionId): Static {
  const hit = cache.get(region);
  if (hit) return hit;
  const { shore } = overworld(region);
  const TOWNS = regionTowns(region);
  const foam: number[] = [];
  const deep: Static["deep"] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (shore[i] === 1) foam.push(i);
      else if (shore[i] >= 6) deep.push({ i, diag: x + 2 * y, h: hash(x, y) });
    }
  // packets stay on the open road, not on top of the town buildings
  const inTown = ([x, y]: [number, number]) => TOWNS.some((t) => Math.abs(x - t.x) <= 20 && Math.abs(y - t.y) <= 13);
  const roads = regionRoutes(region).map((r) => roadSamples(routePoints(r), roadSeed(r)).filter((p) => !inTown(p)));
  const out = { foam, deep, roads };
  cache.set(region, out);
  return out;
}

export type Px = [index: number, color: string];

/** The pixels to paint over the overworld on a given tick. */
export function mapFrame(tick: number, badges: readonly number[], region: RegionId = "mainland"): Px[] {
  const s = statics(region);
  const out: Px[] = [];
  // foam laps in and out: the checkerboard swaps every half second
  const phase = (tick >> 2) & 1;
  for (const i of s.foam) out.push([i, ((i % MAP_W) + ((i / MAP_W) | 0) + phase) & 1 ? FOAM : SHALLOW]);
  // glints drift diagonally across the deep water
  for (const d of s.deep) {
    const band = (((d.diag - tick) % 56) + 56) % 56;
    if (band === 0 && d.h < 0.22) out.push([d.i, GLINT]);
    else if (band === 1 && d.h < 0.06) out.push([d.i, FOAM]);
  }
  // packets run along open links, one per road, there and back
  regionRoutes(region).forEach((r, n) => {
    if (!isRouteOpen(r, badges)) return;
    const road = s.roads[n];
    const len = road.length;
    const k = (tick * 2 + n * 37) % (len * 2);
    const pos = k < len ? k : 2 * len - 1 - k;
    const dir = k < len ? 1 : -1;
    const head = road[pos];
    const tail = road[Math.max(0, Math.min(len - 1, pos - 3 * dir))];
    out.push([Math.round(tail[1]) * MAP_W + Math.round(tail[0]), PACKET_TAIL]);
    out.push([Math.round(head[1]) * MAP_W + Math.round(head[0]), PACKET]);
  });
  // gym antenna lights: open gyms blink, locked ones are dark
  for (const t of regionTowns(region)) {
    const [x, y] = gymLight(t);
    const i = y * MAP_W + x;
    if (!isUnlocked(t, badges)) out.push([i, LIGHT_OFF]);
    else if ((tick + t.gym * 3) % 12 < 5) {
      out.push([i, LIGHT_ON], [i - 1, LIGHT_GLOW], [i + 1, LIGHT_GLOW], [i - MAP_W, LIGHT_GLOW]);
    }
  }
  return out;
}
