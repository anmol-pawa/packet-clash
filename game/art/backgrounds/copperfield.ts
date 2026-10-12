import type { Palette, SpriteDef } from "@/lib/pixel";
import type { BattleBackground, PlatformSpot } from "./types";

/**
 * Copperfield, the Physical-layer area: a summer meadow under snowy peaks,
 * crossed by a line of wooden utility poles whose sagging copper lines carry
 * the region's signal. A dirt path winds between the two battle platforms,
 * past a relay hut, a cable reel, rocks, tufts and wildflowers.
 *
 * Everything is painted procedurally into one palette grid (deterministic, no
 * DOM), so the scene can be unit tested and reviewed in /dev/sprites.
 */

export const HORIZON = 92;
const OX = -128;
const OY = -64;
const IW = 512;
const IH = 320;

const PAL: Palette = {
  // sky, top to horizon
  a: "#2b5fb8",
  b: "#3a7fd5",
  c: "#4f95e2",
  d: "#6aaceb",
  e: "#8cc4f1",
  f: "#b3dbf5",
  g: "#d9eef8",
  // sun
  h: "#fff6d8",
  i: "#ffe7a0",
  // far mountains: lit face, haze, shadow face, snow, snow in shadow
  j: "#a3bfdb",
  k: "#86a5c8",
  l: "#6a87b0",
  m: "#f2f8fc",
  n: "#c5d8ea",
  // mid hills
  o: "#86b8a0",
  p: "#679a89",
  q: "#517f76",
  // tree canopies
  r: "#4f9a55",
  s: "#357544",
  t: "#245a39",
  u: "#173b2b",
  // meadow grass, near horizon → foreground
  v: "#a4dc7c",
  w: "#86cc6b",
  x: "#6dba5d",
  y: "#5aa653",
  z: "#4a9249",
  A: "#3a783c",
  B: "#c4ec96",
  // wood
  C: "#b07a4c",
  D: "#81552f",
  E: "#4a2c1b",
  F: "#d8eef4",
  G: "#2a2438",
  // rocks
  H: "#c4beb2",
  I: "#958e84",
  J: "#67615c",
  K: "#3a3639",
  // soil
  L: "#a0703f",
  M: "#7d5533",
  N: "#5a3b26",
  O: "#2c2117",
  // flowers
  P: "#ff7096",
  Q: "#ffd257",
  R: "#ffffff",
  // copper cable on the reel
  S: "#f0a35a",
  T: "#c06a30",
  U: "#7e3d1b",
  // relay hut
  V: "#d0584c",
  W: "#97393a",
  X: "#efe3c8",
  Y: "#c2ae8c",
  Z: "#ffe17a",
  // dirt path
  "2": "#e1bd84",
  "3": "#c99f66",
  "4": "#a17947",
};

const PLATFORMS: { player: PlatformSpot; foe: PlatformSpot } = {
  foe: { cx: 190, cy: 97, rx: 50, ry: 10 },
  player: { cx: 68, cy: 164, rx: 56, ry: 11 },
};

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));
const bayer = (x: number, y: number) => BAYER[y & 3][x & 3];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Stable per-pixel hash in [0, 1). */
function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** Picks from a ramp at t∈[0,1], dithering the middle of each step. */
function rampAt(ramp: string, t: number, x: number, y: number, spread = 0.4) {
  const v = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(v);
  const frac = v - i;
  const next = frac > 0.5 + (bayer(x, y) - 0.5) * spread * 2 ? 1 : 0;
  return ramp[Math.min(ramp.length - 1, i + next)];
}

class Canvas {
  readonly px: string[] = new Array(IW * IH).fill("a");
  get(x: number, y: number) {
    const cx = Math.round(x) - OX;
    const cy = Math.round(y) - OY;
    if (cx < 0 || cy < 0 || cx >= IW || cy >= IH) return null;
    return this.px[cy * IW + cx];
  }
  set(x: number, y: number, ch: string) {
    const cx = Math.round(x) - OX;
    const cy = Math.round(y) - OY;
    if (cx < 0 || cy < 0 || cx >= IW || cy >= IH) return;
    this.px[cy * IW + cx] = ch;
  }
  rows() {
    const out: string[] = [];
    for (let y = 0; y < IH; y++) out.push(this.px.slice(y * IW, (y + 1) * IW).join(""));
    return out;
  }
}

const X0 = OX;
const X1 = OX + IW;
const Y1 = OY + IH;

function sky(c: Canvas) {
  for (let y = OY; y < HORIZON; y++) {
    const t = Math.pow(Math.max(0, (y + 20) / (HORIZON + 20)), 1.4);
    for (let x = X0; x < X1; x++) c.set(x, y, rampAt("abcdefg", t, x, y, 0.22));
  }
  // sun, upper left (where the light comes from), with a dithered halo
  const [sx, sy] = [34, 18];
  for (let y = sy - 12; y <= sy + 12; y++)
    for (let x = sx - 12; x <= sx + 12; x++) {
      const d = Math.hypot(x - sx, y - sy);
      if (d <= 6) c.set(x, y, "h");
      else if (d <= 8) c.set(x, y, "i");
      else if (d <= 11 && (x + y) % 2 === 0 && bayer(x, y) < 1.2 - d / 10) c.set(x, y, "i");
    }
}

function mountains(c: Canvas) {
  const r = rng(5);
  const base = 86;
  const peaks: { x: number; h: number; sl: number; sr: number }[] = [];
  for (let x = X0 - 20; x < X1 + 40; x += 46 + Math.floor(r() * 34)) {
    peaks.push({ x, h: 22 + Math.floor(r() * 26), sl: 0.6 + r() * 0.25, sr: 0.65 + r() * 0.3 });
  }
  for (let x = X0; x < X1; x++) {
    let top = Infinity;
    let own = peaks[0];
    for (const p of peaks) {
      const dx = x - p.x;
      const yTop = base - p.h + Math.abs(dx) * (dx < 0 ? p.sl : p.sr) + Math.round(hash(x, 0, 3) * 1.2);
      if (yTop < top) {
        top = yTop;
        own = p;
      }
    }
    const peakY = base - own.h;
    for (let y = Math.ceil(top); y < HORIZON; y++) {
      // the crease between the lit (left) and shadow faces wanders a little
      const crease = own.x + Math.round(Math.sin(y * 0.8 + own.x) * 1.2 + (y - peakY) * 0.12);
      const lit = x < crease;
      let ch = lit ? "j" : "l";
      if (Math.abs(x - crease) <= 1 && !lit) ch = "k";
      // gullies: thin shadow streaks running down the lit face
      if (lit && (y - peakY) > 6 && hash(x, Math.floor(y / 3), 9) < 0.08) ch = "k";
      const snow = own.h > 34 && y < peakY + 6 + Math.round(hash(x, 1, 4) * 3 + Math.sin(x * 0.7) * 1.5);
      if (snow) ch = lit ? "m" : "n";
      // haze toward the base
      const hz = (y - (base - 10)) / 12;
      if (hz > 0 && bayer(x, y) < hz) ch = "k";
      c.set(x, y, ch);
    }
  }
}

function hills(c: Canvas) {
  const ridge = (x: number) => 80 - 5 * Math.sin(x * 0.041 + 1) - 3.5 * Math.sin(x * 0.103 + 2.2) - 2 * Math.sin(x * 0.23);
  for (let x = X0; x < X1; x++) {
    const top = Math.round(ridge(x));
    const slope = ridge(x + 2) - ridge(x - 2);
    for (let y = top; y < HORIZON; y++) {
      let ch = "p";
      if (y - top < 3) ch = slope < -0.4 ? "o" : slope > 0.6 ? "q" : y === top ? "o" : "p";
      else if (bayer(x, y) < (y - top - 3) / 14) ch = "q";
      c.set(x, y, ch);
    }
  }
}

function poles(c: Canvas, lights: BattleBackground["lights"]) {
  const xs: number[] = [];
  for (let x = -110; x < X1; x += 72) xs.push(x);
  const height = 34;
  const top = HORIZON - height;
  const arm = top + 4;
  // cables first, so the poles' crossarms sit on top of them
  for (let i = 0; i + 1 < xs.length; i++) {
    for (const off of [-5, 5]) {
      const y0 = arm - 1;
      const a = xs[i] + off;
      const b = xs[i + 1] + off;
      for (let x = a; x <= b; x++) {
        const t = (x - a) / (b - a);
        c.set(x, y0 + Math.round((off < 0 ? 5 : 7) * (1 - (2 * t - 1) ** 2)), "G");
      }
    }
  }
  for (const px of xs) {
    for (let y = top; y < HORIZON; y++) {
      c.set(px - 1, y, "C");
      c.set(px, y, "D");
      if (y % 7 === 3) c.set(px, y, "E");
    }
    c.set(px - 1, top, "D");
    c.set(px, top, "E");
    for (let x = px - 6; x <= px + 5; x++) {
      c.set(x, arm, "C");
      c.set(x, arm + 1, "E");
    }
    for (const off of [-5, 5]) {
      c.set(px + off, arm - 1, "F");
      c.set(px + off, arm - 2, "F");
    }
    c.set(px, top - 1, "F");
    lights.push({ x: px, y: top - 2, color: 0xff4f7b });
  }
}

function trees(c: Canvas) {
  const r = rng(17);
  const mask = new Set<number>();
  const key = (x: number, y: number) => (y - OY) * IW + (x - OX);
  for (let x = X0; x < X1; x += 6 + Math.floor(r() * 7)) {
    if (r() < 0.22) {
      x += 10;
      continue;
    }
    const rad = 4 + Math.floor(r() * 5);
    const cy = HORIZON - 2 - Math.floor(rad * 0.6) - Math.floor(r() * 3);
    for (let y = cy - rad; y <= HORIZON; y++)
      for (let xx = x - rad; xx <= x + rad; xx++) {
        const dx = (xx - x) / rad;
        const dy = (y - cy) / rad;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1 && y < cy) continue;
        if (y >= cy && Math.abs(dx) > 1) continue;
        // a lumpy edge reads as leaves rather than a perfect circle
        if (d2 > 0.8 && d2 <= 1 && hash(xx, y, 2) < 0.3) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
        const lit = -dx * 0.55 - dy * 0.7 + nz * 0.45 + (bayer(xx, y) - 0.5) * 0.25;
        c.set(xx, y, y > cy + rad * 0.5 ? "t" : lit > 0.62 ? "r" : lit > 0.12 ? "s" : "t");
        mask.add(key(xx, y));
      }
  }
  // dark outline where a canopy meets the sky or hills
  const edge: [number, number][] = [];
  for (const k of mask) {
    const x = (k % IW) + OX;
    const y = Math.floor(k / IW) + OY;
    if (!mask.has(key(x, y - 1)) || !mask.has(key(x - 1, y)) || !mask.has(key(x + 1, y))) edge.push([x, y]);
  }
  for (const [x, y] of edge) if (y < HORIZON - 1) c.set(x, y, "u");
}

function hut(c: Canvas, lights: BattleBackground["lights"]) {
  const x0 = 104;
  const w = 18;
  const base = HORIZON + 1;
  const wallTop = base - 10;
  for (let y = wallTop; y < base; y++)
    for (let x = x0; x < x0 + w; x++) c.set(x, y, x < x0 + 12 ? "X" : "Y");
  // roof: overhanging slab, lit on its slope
  for (let i = 0; i < 6; i++) {
    const y = wallTop - 6 + i;
    for (let x = x0 - 2; x < x0 + w + 2; x++) c.set(x, y, i === 0 ? "K" : i < 3 ? "V" : "W");
  }
  for (let x = x0 - 2; x < x0 + w + 2; x++) c.set(x, wallTop, "K");
  // door + window with a warm light
  for (let y = base - 7; y < base; y++) for (let x = x0 + 3; x < x0 + 7; x++) c.set(x, y, x === x0 + 3 ? "E" : "D");
  for (let y = base - 7; y < base - 3; y++) for (let x = x0 + 10; x < x0 + 15; x++) c.set(x, y, y === base - 7 || x === x0 + 10 ? "E" : "Z");
  c.set(x0 + 12, base - 7, "E");
  for (let y = wallTop + 1; y < base; y++) c.set(x0 + w - 1, y, "K");
  // antenna mast with a light
  for (let y = wallTop - 15; y < wallTop - 6; y++) c.set(x0 + 14, y, "J");
  c.set(x0 + 13, wallTop - 12, "J");
  c.set(x0 + 15, wallTop - 12, "J");
  lights.push({ x: x0 + 14, y: wallTop - 16, color: 0x5cf0ff });
}

const pathCenter = (y: number) => 128 + 12 * Math.sin((y - HORIZON) / 26) + (y - HORIZON) * 0.05;
const pathHalf = (y: number) => 1 + (y - HORIZON) * 0.2;

function meadow(c: Canvas) {
  for (let y = HORIZON; y < Y1; y++) {
    const t = (y - HORIZON) / 110;
    for (let x = X0; x < X1; x++) {
      c.set(x, y, rampAt("vwxyz", t, x, y, 0.25));
    }
  }
  // blade strokes: a dark blade with a lit tip, denser and taller toward the viewer
  for (let y = HORIZON + 2; y < Y1; y++) {
    const t = Math.min(1, (y - HORIZON) / 110);
    const len = t < 0.25 ? 1 : 2;
    for (let x = X0; x < X1; x++) {
      if (hash(x, y, 1) >= 0.015 + t * 0.05) continue;
      for (let k = 0; k < len; k++) c.set(x, y - k, "A");
      if (hash(x, y, 7) < 0.4) c.set(x, y - len, t < 0.3 ? "v" : "w");
    }
  }
  // longer blade strokes in the foreground
  for (let y = HORIZON + 30; y < Y1; y++)
    for (let x = X0; x < X1; x++)
      if (hash(x, y, 11) < 0.012) {
        c.set(x, y, "A");
        c.set(x, y - 1, "A");
        c.set(x + 1, y - 2, "y");
      }
  // dirt path
  for (let y = HORIZON + 1; y < Y1; y++) {
    const cx = pathCenter(y);
    const hw = pathHalf(y);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const e = Math.abs(x - cx) / hw;
      if (e > 1) continue;
      let ch = e > 0.85 ? "4" : x < cx - hw * 0.3 && bayer(x, y) < 0.5 ? "2" : "3";
      if (e <= 0.85 && hash(x, y, 13) < 0.04) ch = hash(x, y, 14) < 0.5 ? "4" : "2";
      c.set(x, y, ch);
    }
  }
}

function rock(c: Canvas, cx: number, cy: number, rx: number, ry: number) {
  const pts: [number, number][] = [];
  for (let y = cy - ry; y <= cy + 1; y++)
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      const lit = -dx * 0.55 - dy * 0.7 + nz * 0.5 + (bayer(x, y) - 0.5) * 0.2;
      c.set(x, y, lit > 0.7 ? "H" : lit > 0.25 ? "I" : "J");
      pts.push([x, y]);
    }
  const inside = new Set(pts.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of pts)
    for (const [ax, ay] of [
      [x, y - 1],
      [x - 1, y],
      [x + 1, y],
    ])
      if (!inside.has(`${ax},${ay}`)) c.set(ax, ay, "K");
  // contact shadow
  for (let x = cx - rx; x <= cx + rx + 1; x++) if ((x + cy) % 2 === 0) c.set(x, cy + 2, "A");
}

function reel(c: Canvas, x0: number, cy: number) {
  // a wooden cable reel on its side: back flange, copper coil, front flange
  const ry = 9;
  const flange = (fx: number, front: boolean) => {
    for (let y = -ry; y <= ry; y++) {
      const hw = Math.round(3 * Math.sqrt(1 - (y * y) / (ry * ry)));
      for (let x = -hw; x <= hw; x++) {
        const edge = Math.abs(x) === hw || Math.abs(y) === ry;
        c.set(fx + x, cy + y, edge ? "E" : front ? (y < -2 ? "C" : "D") : "D");
      }
    }
    if (front) for (let y = -2; y <= 2; y++) c.set(fx, cy + y, "E");
  };
  flange(x0, false);
  for (let x = x0 + 1; x < x0 + 12; x++)
    for (let y = -6; y <= 6; y++) {
      let ch = y < -3 ? "S" : y < 3 ? "T" : "U";
      if ((x + y * 2) % 4 === 0) ch = ch === "S" ? "T" : "U";
      c.set(x, cy + y, ch);
    }
  for (let x = x0 + 1; x < x0 + 12; x++) {
    c.set(x, cy - 7, "E");
    c.set(x, cy + 7, "E");
  }
  flange(x0 + 12, true);
  // a loose end of cable trailing into the grass
  for (let i = 0; i < 14; i++) c.set(x0 + 14 + i, cy + 8 + Math.round(Math.sin(i / 3) * 1.5), "T");
  for (let x = x0 - 2; x <= x0 + 15; x++) if (x % 2 === 0) c.set(x, cy + 10, "A");
}

function onPath(x: number, y: number) {
  return y > HORIZON && Math.abs(x - pathCenter(y)) <= pathHalf(y) + 2;
}

function onPlatform(x: number, y: number) {
  return Object.values(PLATFORMS).some((p) => ((x - p.cx) / (p.rx + 6)) ** 2 + ((y - p.cy - 3) / (p.ry + 8)) ** 2 < 1);
}

function scatter(c: Canvas) {
  const r = rng(29);
  // grass tufts
  const TUFT = ["A.B.A", "AABAA", ".AAA."];
  for (let i = 0; i < 110; i++) {
    const x = Math.floor(X0 + r() * IW);
    const y = Math.floor(HORIZON + 8 + r() * (Y1 - HORIZON - 8));
    if (onPath(x, y) || onPlatform(x, y)) continue;
    TUFT.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== "." && c.set(x + dx - 2, y + dy - 2, ch)));
  }
  // wildflower clusters
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(X0 + r() * IW);
    const y = Math.floor(HORIZON + 10 + r() * (Y1 - HORIZON - 10));
    if (onPath(x, y) || onPlatform(x, y)) continue;
    const petal = r() < 0.5 ? "P" : r() < 0.5 ? "Q" : "R";
    for (let k = 0; k < 3; k++) {
      const fx = x + Math.floor(r() * 9) - 4;
      const fy = y + Math.floor(r() * 5) - 2;
      c.set(fx, fy + 1, "A");
      c.set(fx - 1, fy, petal);
      c.set(fx + 1, fy, petal);
      c.set(fx, fy - 1, petal);
      c.set(fx, fy, petal === "Q" ? "L" : "Q");
    }
  }
}

function platform(c: Canvas, p: PlatformSpot) {
  const { cx, cy, rx, ry } = p;
  const depth = 6;
  const mask = new Set<string>();
  const put = (x: number, y: number, ch: string) => {
    c.set(x, y, ch);
    mask.add(`${x},${y}`);
  };
  // ground shadow, offset toward the lower right
  for (let y = cy - ry; y <= cy + ry + depth + 4; y++)
    for (let x = cx - rx; x <= cx + rx + 6; x++)
      if (((x - cx - 3) / (rx + 2)) ** 2 + ((y - cy - depth + 1) / (ry + 3)) ** 2 < 1 && (x + y) % 2 === 0) c.set(x, y, "A");
  // soil side
  for (let x = cx - rx; x <= cx + rx; x++) {
    const u = (x - cx) / rx;
    const hy = Math.round(ry * Math.sqrt(Math.max(0, 1 - u * u)));
    for (let k = 0; k <= depth; k++) {
      const y = cy + hy + k - (k === 0 ? 0 : 0);
      let ch = k < 2 ? (u < -0.45 ? "L" : "M") : k < 4 ? (u < -0.6 ? "M" : "N") : "N";
      if (k >= 2 && k < depth && hash(x, y, 21) < 0.08) ch = "I";
      put(x, y, ch);
    }
  }
  // grassy top: lit back rim, mid, darker front, with blade texture
  for (let y = cy - ry; y <= cy + ry; y++) {
    const v = (y - cy) / ry;
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
    for (let x = cx - hw; x <= cx + hw; x++) {
      const u = (x - cx) / rx;
      const lit = -v * 0.75 - u * 0.4;
      let ch = lit > 0.55 ? "B" : lit > 0.1 ? "v" : lit > -0.45 ? "w" : "x";
      if (hash(x, y, 23) < 0.12) ch = ch === "B" ? "v" : ch === "v" ? "w" : "y";
      put(x, y, ch);
    }
  }
  // blades hanging over the front lip
  for (let x = cx - rx + 2; x <= cx + rx - 2; x++) {
    const u = (x - cx) / rx;
    const hy = Math.round(ry * Math.sqrt(Math.max(0, 1 - u * u)));
    const len = hash(x, cy, 25) < 0.45 ? 1 : hash(x, cy, 26) < 0.5 ? 2 : 0;
    for (let k = 1; k <= len; k++) put(x, cy + hy + k, k === len ? "y" : "x");
  }
  // 1-px outline around the whole platform
  const edge: [number, number][] = [];
  for (const k of mask) {
    const [x, y] = k.split(",").map(Number);
    for (const [ax, ay] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ])
      if (!mask.has(`${ax},${ay}`)) edge.push([ax, ay]);
  }
  for (const [x, y] of edge) c.set(x, y, "O");
}

/** A drifting cumulus: overlapping puffs, lit from the upper left, flat shaded base. */
function cloud(seed: number, w: number): SpriteDef {
  const r = rng(seed);
  const h = Math.ceil(w * 0.45);
  const px: string[][] = Array.from({ length: h }, () => new Array(w).fill("."));
  const puffs: [number, number, number][] = [];
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const rad = Math.max(3, Math.round((w / (n + 0.5)) * (0.7 + r() * 0.45)));
    const x = Math.round(rad + ((w - 2 * rad) * i) / Math.max(1, n - 1));
    puffs.push([x, h - rad - 1 + (i % 2 ? 0 : Math.floor(r() * 2)), rad]);
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = -Infinity;
      for (const [pxx, py, rad] of puffs) {
        const dx = (x + 0.5 - pxx) / rad;
        const dy = (y + 0.5 - py) / rad;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1 || y >= h - 1) continue;
        const nz = Math.sqrt(1 - d2);
        best = Math.max(best, -dx * 0.5 - dy * 0.75 + nz * 0.4);
      }
      if (best === -Infinity) continue;
      px[y][x] = y >= h - 3 ? "s" : best > 0.45 ? "W" : best > -0.05 ? "m" : "s";
    }
  return { palette: { W: "#ffffff", m: "#e6f2fb", s: "#bdd8ee" }, rows: px.map((r) => r.join("")) };
}

let cached: BattleBackground | null = null;

export function copperfield(): BattleBackground {
  if (cached) return cached;
  const c = new Canvas();
  const lights: BattleBackground["lights"] = [];
  sky(c);
  mountains(c);
  hills(c);
  poles(c, lights);
  trees(c);
  meadow(c);
  hut(c, lights);
  scatter(c);
  rock(c, 30, 104, 5, 4);
  rock(c, 252, 126, 8, 5);
  rock(c, -40, 134, 7, 5);
  rock(c, 318, 168, 10, 6);
  rock(c, 160, 182, 6, 4);
  reel(c, 4, 122);
  platform(c, PLATFORMS.foe);
  platform(c, PLATFORMS.player);
  cached = {
    id: "copperfield",
    name: "Copperfield",
    x: OX,
    y: OY,
    image: { palette: PAL, rows: c.rows() },
    clouds: [cloud(3, 34), cloud(8, 24), cloud(12, 40), cloud(15, 20)],
    lights,
    platforms: PLATFORMS,
  };
  return cached;
}
