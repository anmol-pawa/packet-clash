import type { SpriteDef } from "@/lib/pixel";
import { ROUTES, routePoints, TOWNS, type Town } from "@/content/world";

/**
 * The overworld painting: an island continent where every town is a LAN and
 * every road is a link. Painted procedurally (deterministic, no DOM) into a
 * 320×224 grid: a shaded sea that deepens away from the coast with foam and
 * wave marks, sandy beaches, hills lit from the upper left, forests of
 * outlined trees, a snowy range in the north, dirt roads that become plank
 * bridges over water, and a gym plus houses in each town (roof in the
 * town's colour).
 */

export const MAP_W = 320;
export const MAP_H = 224;

// ---------- noise and colour helpers ----------

function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** Smooth value noise in [0, 1). */
function vnoise(x: number, y: number, scale: number, seed: number) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number) {
  return (vnoise(x, y, 40, seed) * 0.55 + vnoise(x, y, 17, seed + 1) * 0.3 + vnoise(x, y, 7, seed + 2) * 0.15);
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));
const bayer = (x: number, y: number) => BAYER[y & 3][x & 3];

/** Picks from a ramp (array of colours) at t∈[0,1], dithering step edges. */
function rampAt(ramp: string[], t: number, x: number, y: number, spread = 0.35) {
  const v = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(v);
  const frac = v - i;
  return ramp[Math.min(ramp.length - 1, i + (frac > 0.5 + (bayer(x, y) - 0.5) * spread * 2 ? 1 : 0))];
}

function shadeHex(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => {
    const c = (n >> s) & 255;
    const v = f >= 0 ? c + (255 - c) * f : c * (1 + f);
    return Math.round(Math.max(0, Math.min(255, v)));
  };
  return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("");
}

// ---------- palette ----------

const SEA = ["#1b3f8f", "#21509f", "#2a63b4", "#3479c4", "#4790d2"];
const SHALLOW = "#63b0de";
const FOAM = "#d6f1fa";
const WAVE = "#8bc6ea";
const SAND = ["#f4e3a6", "#e3c983", "#c9a965"];
const GRASS = ["#9fdc72", "#7cc65e", "#5fae50", "#4a9446", "#3a783c"];
const HIGH = ["#b4c98a", "#93ad73", "#748f5f", "#5a744e"];
const OUTLINE = "#1a2420";
const TREE = ["#5fb85a", "#3f9a4a", "#2d7a3f", "#1f5a33"];
const TRUNK = "#6b4426";
const ROCK = ["#c9c2b4", "#a39a8c", "#7b7368", "#544e48"];
const SNOW = ["#ffffff", "#d7e6f2"];
const DIRT = ["#e8c890", "#d2ab6d", "#a77d4a"];
const PLANK = ["#c08a52", "#94653a", "#5e3e24"];
const WALL = ["#f4ecd8", "#d9cdb2", "#a99a7c"];
const WINDOW = "#ffe17a";
const DOOR = "#5a3b26";

/** A cast shadow on the ground keeps to the ground's own ramp, so the palette stays small. */
function shadowOf(col: string | null) {
  if (col && SAND.includes(col)) return SAND[2];
  if (col && DIRT.includes(col)) return DIRT[2];
  if (col && HIGH.includes(col)) return HIGH[3];
  return GRASS[4];
}

// ---------- the canvas ----------

class Canvas {
  readonly px: string[] = new Array(MAP_W * MAP_H).fill(SEA[0]);
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
    return this.px[y * MAP_W + x];
  }
  set(x: number, y: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    this.px[y * MAP_W + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
}

const idx = (x: number, y: number) => y * MAP_W + x;

// ---------- terrain fields ----------

/** Bays carved out of the land (harbours for Octet Harbor and Synport, an inland lake). */
const BAYS: [number, number, number][] = [
  [228, 196, 30],
  [140, 158, 15],
  [214, 96, 12],
];

function landField(x: number, y: number) {
  let f = -0.5;
  for (const t of TOWNS) f = Math.max(f, 1 - Math.hypot(x - t.x, (y - t.y) * 1.1) / 62);
  // the road network keeps the island in one piece
  for (const r of ROUTES) {
    const pts = routePoints(r);
    for (let i = 0; i + 1 < pts.length; i++) f = Math.max(f, 0.75 - segDist(x, y, pts[i], pts[i + 1]) / 34);
  }
  f += (fbm(x, y, 11) - 0.5) * 0.7;
  for (const [bx, by, br] of BAYS) f -= Math.max(0, 1 - Math.hypot(x - bx, y - by) / br) * 1.4;
  // fall off toward the frame so the sea surrounds the island
  const edge = Math.min(x, y - 8, MAP_W - 1 - x, MAP_H - 1 - y);
  if (edge < 14) f -= (14 - edge) / 14;
  return f;
}

function segDist(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/** Height on land, 0–1: rolling hills plus a mountain range in the north-west. */
function elevation(x: number, y: number) {
  const ridge = Math.max(0, 1 - Math.hypot((x - 130) / 150, (y - 22) / 52));
  return Math.min(1, fbm(x, y, 21) * 0.55 + ridge * 0.75);
}

/** Distance (in pixels, 4-connected) from every cell to the nearest cell where `src` is true. */
function distanceFrom(src: Uint8Array) {
  const d = new Int16Array(MAP_W * MAP_H).fill(999);
  const q: number[] = [];
  for (let i = 0; i < src.length; i++) if (src[i]) {
    d[i] = 0;
    q.push(i);
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const j = idx(nx, ny);
      if (d[j] > d[i] + 1) {
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
  }
  return d;
}

// ---------- stamps ----------

function tree(c: Canvas, x: number, y: number, big: boolean) {
  const r = big ? 4 : 3;
  // shadow on the ground, down-right
  for (let i = -r + 1; i <= r + 1; i++) c.set(x + i + 1, y + 1, shadowOf(c.get(x + i + 1, y + 1)));
  c.set(x, y, TRUNK);
  c.set(x, y - 1, TRUNK);
  const cy = y - r - 1;
  for (let j = -r - 1; j <= r + 1; j++)
    for (let i = -r - 1; i <= r + 1; i++) {
      const d = Math.hypot(i, j * 1.1);
      if (d > r + 0.6) continue;
      const edge = d > r - 0.4;
      if (edge) {
        c.set(x + i, cy + j, OUTLINE);
        continue;
      }
      const lit = (-i - j) / (r * 1.6) + 0.15;
      c.set(x + i, cy + j, rampAt(TREE, 0.5 - lit, x + i, cy + j, 0.4));
    }
  c.set(x - 1, cy - 1, TREE[0]);
}

function mountain(c: Canvas, x: number, y: number, h: number) {
  const w = Math.round(h * 0.9);
  for (let j = 0; j <= h; j++) {
    const half = Math.round((j / h) * w);
    for (let i = -half; i <= half; i++) {
      const px = x + i;
      const py = y - h + j;
      const edge = Math.abs(i) >= half - 0 || j === h;
      if (edge) {
        c.set(px, py, OUTLINE);
        continue;
      }
      const crease = Math.round(Math.sin(j * 0.9 + x) * 0.8) + Math.round(j * 0.15);
      const lit = i < crease;
      let col = lit ? rampAt(ROCK, 0.25 + j / h / 3, px, py) : rampAt(ROCK, 0.7 + j / h / 4, px, py);
      if (j < h * 0.38 + hash(px, 0, 5) * 2) col = lit ? SNOW[0] : SNOW[1];
      c.set(px, py, col);
    }
  }
}

function building(c: Canvas, x: number, y: number, w: number, h: number, roof: string, gym: boolean) {
  // x,y = bottom-left of the walls
  const roofH = Math.ceil(w / 2) - (gym ? 1 : 0);
  const wallH = h - roofH;
  const R = [shadeHex(roof, 0.35), roof, shadeHex(roof, -0.35)];
  // shadow to the lower right
  for (let j = 0; j < h; j++) c.set(x + w, y - j, shadowOf(c.get(x + w, y - j)));
  for (let i = 1; i <= w; i++) c.set(x + i, y + 1, shadowOf(c.get(x + i, y + 1)));
  // walls
  for (let j = 0; j < wallH; j++)
    for (let i = 0; i < w; i++) {
      const edge = i === 0 || i === w - 1 || j === 0;
      c.set(x + i, y - j, edge ? OUTLINE : i > w - 3 ? WALL[1] : j === wallH - 1 ? WALL[2] : WALL[0]);
    }
  // door and windows
  const mid = Math.floor(w / 2);
  c.set(x + mid, y - 1, DOOR);
  c.set(x + mid, y - 2, DOOR);
  if (gym) {
    c.set(x + mid - 1, y - 1, DOOR);
    c.set(x + mid - 1, y - 2, DOOR);
  }
  if (wallH > 3) {
    c.set(x + 2, y - 2, WINDOW);
    c.set(x + w - 3, y - 2, WINDOW);
  }
  // roof: a gable lit on the left slope
  const top = y - wallH + 1;
  for (let j = 0; j < roofH; j++) {
    const half = Math.round(((j + 1) / roofH) * (w / 2 + 1));
    for (let i = mid - half; i <= w - 1 - mid + half + (w % 2 === 0 ? 0 : 0); i++) {
      const px = x + i;
      const py = top - roofH + j;
      if (i < -1 || i > w) continue;
      const edge = i === mid - half || i === w - 1 - mid + half || j === 0 || j === roofH - 1;
      c.set(px, py, edge ? OUTLINE : i <= mid ? (j % 2 ? R[0] : R[1]) : j % 2 ? R[2] : R[1]);
    }
  }
  c.set(x + mid, top - roofH, OUTLINE);
  if (gym) {
    // a badge emblem on the gable and a little antenna with a light
    c.set(x + mid, top - 3, WINDOW);
    c.set(x + mid, top - roofH - 1, OUTLINE);
    c.set(x + mid, top - roofH - 2, OUTLINE);
    c.set(x + mid, top - roofH - 3, "#ff5a5a");
  }
}

function townStamp(c: Canvas, t: Town) {
  // plaza
  for (let j = -7; j <= 7; j++)
    for (let i = -11; i <= 11; i++) {
      const d = Math.hypot(i / 11, j / 7);
      if (d <= 1) c.set(t.x + i, t.y + j, d > 0.86 ? DIRT[2] : rampAt(DIRT, 0.15 + d * 0.4, t.x + i, t.y + j));
    }
  building(c, t.x - 13, t.y - 1, 9, 9, t.roof, false);
  building(c, t.x + 5, t.y - 2, 9, 9, t.roof, false);
  building(c, t.x - 6, t.y + 6, 13, 14, t.roof, true);
}

/** The road's centre line: the route polyline sampled densely with a gentle wobble so it looks walked, not ruled. */
export function roadSamples(pts: [number, number][], seed: number): [number, number][] {
  const samples: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const wob = Math.sin(t * Math.PI) * (vnoise(k, i, 9, seed) - 0.5) * 6;
      const nx = -(by - ay) / (Math.hypot(bx - ax, by - ay) || 1);
      const ny = (bx - ax) / (Math.hypot(bx - ax, by - ay) || 1);
      samples.push([ax + (bx - ax) * t + nx * wob, ay + (by - ay) * t + ny * wob]);
    }
  }
  return samples;
}

/** The seed each route's road is painted with. */
export const roadSeed = (routeIndex: number) => 40 + routeIndex;

/** Where the light on top of a town's gym antenna is painted. */
export const gymLight = (t: Town): [number, number] => [t.x, t.y - 10];

function road(c: Canvas, water: Uint8Array, pts: [number, number][], seed: number) {
  const samples = roadSamples(pts, seed);
  // edge pass then fill pass, so the dark rim stays on the outside
  for (const pass of [0, 1])
    for (const [sx, sy] of samples)
      for (let j = -2; j <= 2; j++)
        for (let i = -2; i <= 2; i++) {
          const d = Math.hypot(i, j);
          const x = Math.round(sx + i);
          const y = Math.round(sy + j);
          if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
          const wet = water[idx(x, y)];
          if (pass === 0 && d <= 2.2) c.set(x, y, wet ? PLANK[2] : DIRT[2]);
          if (pass === 1 && d <= 1.2) c.set(x, y, wet ? ((x + y) % 3 === 0 ? PLANK[1] : PLANK[0]) : rampAt(DIRT, 0.1 + hash(x, y, seed) * 0.5, x, y, 0.2));
        }
}

// ---------- painting ----------

export interface Overworld {
  image: SpriteDef;
  /** True where the map is sea (for tests and later the walking sprite). */
  water: Uint8Array;
  /** Distance from each sea cell to the nearest land (0 on land), for the shimmer. */
  shore: Int16Array;
}

let cached: Overworld | null = null;

export function overworld(): Overworld {
  if (cached) return cached;
  const c = new Canvas();
  const water = new Uint8Array(MAP_W * MAP_H);
  const land = new Uint8Array(MAP_W * MAP_H);
  const heights = new Float32Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const isLand = landField(x, y) > 0.12;
      land[idx(x, y)] = isLand ? 1 : 0;
      water[idx(x, y)] = isLand ? 0 : 1;
      heights[idx(x, y)] = elevation(x, y);
    }
  // towns always stand on dry land
  for (const t of TOWNS)
    for (let j = -14; j <= 12; j++)
      for (let i = -18; i <= 18; i++) {
        const x = t.x + i;
        const y = t.y + j;
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        land[idx(x, y)] = 1;
        water[idx(x, y)] = 0;
      }
  const toLand = distanceFrom(land);
  const toSea = distanceFrom(water);

  // sea: shallow by the coast, deep far out, foam ring and scattered wave marks
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (!water[i]) continue;
      const d = toLand[i];
      let col = rampAt([...SEA].reverse(), Math.min(1, (d - 2) / 22), x, y, 0.5);
      if (d <= 3) col = SHALLOW;
      if (d === 1) col = (x + y) % 2 ? FOAM : SHALLOW;
      if (d > 5 && hash(Math.floor(x / 5), y, 3) < 0.04 && hash(x, y, 4) < 0.7) col = WAVE;
      c.set(x, y, col);
    }

  // land: beach, then grass shaded by slope, highlands as they climb
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (!land[i]) continue;
      const d = toSea[i];
      const e = heights[i];
      const slope = (heights[idx(Math.max(0, x - 2), Math.max(0, y - 2))] - heights[idx(Math.min(MAP_W - 1, x + 2), Math.min(MAP_H - 1, y + 2))]) * 9;
      let col: string;
      if (d <= 2) col = rampAt(SAND, d === 1 ? 0.6 : 0.2, x, y);
      else if (e > 0.58) col = rampAt(HIGH, 0.45 - slope, x, y, 0.5);
      else col = rampAt(GRASS, 0.45 - slope + (e - 0.4) * 0.6, x, y, 0.5);
      // tufts
      if (d > 2 && e <= 0.58 && hash(x, y, 8) < 0.025) col = GRASS[4];
      c.set(x, y, col);
    }

  // roads first (stamps must avoid them), then towns
  const roadMask = new Uint8Array(MAP_W * MAP_H);
  ROUTES.forEach((r, n) => {
    const before = c.px.slice();
    road(c, water, routePoints(r), roadSeed(n));
    for (let i = 0; i < before.length; i++) if (before[i] !== c.px[i]) roadMask[i] = 1;
  });
  const busy = (x: number, y: number, pad: number) => {
    if (TOWNS.some((t) => Math.abs(x - t.x) < 22 + pad && Math.abs(y - t.y) < 18 + pad)) return true;
    for (let j = -pad; j <= pad; j++)
      for (let i = -pad; i <= pad; i++) {
        const px = x + i;
        const py = y + j;
        if (px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) return true;
        if (roadMask[idx(px, py)] || water[idx(px, py)]) return true;
      }
    return false;
  };

  // mountains along the northern ridge and forests on the lowlands, drawn back to front
  const stamps: { y: number; draw: () => void }[] = [];
  for (let y = 14; y < MAP_H; y += 7)
    for (let x = 6; x < MAP_W; x += 9) {
      const jx = x + Math.floor(hash(x, y, 31) * 6);
      const jy = y + Math.floor(hash(x, y, 32) * 5);
      if (jx >= MAP_W || jy >= MAP_H) continue;
      const e = heights[idx(jx, jy)];
      if (e > 0.6 && !busy(jx, jy, 5)) {
        const h = 8 + Math.floor(hash(jx, jy, 33) * 6 + (e - 0.6) * 18);
        stamps.push({ y: jy, draw: () => mountain(c, jx, jy, h) });
      } else if (e <= 0.56 && fbm(jx, jy, 51) > 0.53 && !busy(jx, jy, 4)) {
        stamps.push({ y: jy, draw: () => tree(c, jx, jy, hash(jx, jy, 34) < 0.5) });
        // clusters: a second tree tucked beside the first
        const kx = jx + 4;
        const ky = jy + 3;
        if (fbm(kx, ky, 51) > 0.58 && !busy(kx, ky, 4)) stamps.push({ y: ky, draw: () => tree(c, kx, ky, false) });
      }
    }
  const roadLayer = c.px.slice();
  stamps.sort((a, b) => a.y - b.y).forEach((s) => s.draw());
  // a big stamp can spill over a road; the road wins (a pass through the hills), so it stays walkable
  for (let i = 0; i < roadMask.length; i++) if (roadMask[i]) c.px[i] = roadLayer[i];
  for (const t of TOWNS) townStamp(c, t);

  // collapse colours to a palette grid
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*+-=?@^_~<>()[]{}|:;,'`/\\\"";
  const pal: Record<string, string> = {};
  const key = new Map<string, string>();
  const rows: string[] = [];
  for (let y = 0; y < MAP_H; y++) {
    let row = "";
    for (let x = 0; x < MAP_W; x++) {
      const col = c.px[idx(x, y)];
      let k = key.get(col);
      if (!k) {
        k = chars[key.size];
        if (!k) throw new Error("overworld palette overflow");
        key.set(col, k);
        pal[k] = col;
      }
      row += k;
    }
    rows.push(row);
  }
  cached = { image: { palette: pal, rows }, water, shore: toLand };
  return cached;
}
