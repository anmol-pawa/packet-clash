import type { Town } from "@/content/world";
import type { SpriteDef } from "@/lib/pixel";

/**
 * Gym badges: 24×24 pixel-art medals. Each is an octagonal gem in the gym's
 * colour (spherically shaded from the upper left) set in an outlined gold
 * bezel, with an engraved emblem for its chapter. `badgeFrames` adds a glint
 * that sweeps across the gem, for the badge-get screen.
 */

export const BADGE_SIZE = 24;

// 9×9 emblems, one per gym ("#" = engraved).
const EMBLEMS: Record<number, string[]> = {
  // 1 Layer Badge: a protocol stack
  1: [".........", "#########", "#########", ".........", "#########", "#########", ".........", "#########", "#########"],
  // 2 Frame Badge: a square-wave signal
  2: [".........", "####.....", "#..#.....", "#..#..###", "#..#..#..", "#..#..#..", "#..####..", ".........", "........."],
  // 3 Mask Badge: a slash between two octets
  3: ["......##.", "##...##..", "##..##...", "...##....", "..##.....", ".##...##.", "##....##.", "#........", "........."],
  // 4 Route Badge: a forking path
  4: ["#.......#", "##.....##", ".##...##.", "..##.##..", "...###...", "....#....", "....#....", "....#....", "...###..."],
  // 5 Window Badge: a four-pane window
  5: ["#########", "#...#...#", "#...#...#", "#...#...#", "#########", "#...#...#", "#...#...#", "#...#...#", "#########"],
  // 6 Lookup Badge: a magnifying glass
  6: ["..####...", ".#....#..", "#......#.", "#......#.", "#......#.", ".#....#..", "..#####..", "......##.", ".......##"],
  // 7 Cipher Badge: a key
  7: [".........", ".###.....", "#...#....", "#...#####", "#...#.#.#", ".###..#.#", ".........", ".........", "........."],
  // 8 Journey Badge: a globe
  8: ["..#####..", ".#..#..#.", "#...#...#", "#########", "#...#...#", "#########", "#...#...#", ".#..#..#.", "..#####.."],
  // 9 Backbone Badge: a star
  9: ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", "#.......#"],
  // 10 Tree Badge: a spanning tree
  10: ["....#....", "...###...", "....#....", "..#.#.#..", ".##.#.##.", "#...#...#", "....#....", "...###...", "..#####.."],
  // 11 Area Badge: nested area rings
  11: ["..#####..", ".#.....#.", "#..###..#", "#.#...#.#", "#.#.#.#.#", "#.#...#.#", "#..###..#", ".#.....#.", "..#####.."],
  // 12 Translate Badge: address swap arrows
  12: ["...#.....", "..##.....", "#########", "..##.....", "...#.....", ".....#...", ".....##..", "#########", ".....##.."],
  // 13 Shield Badge: a shield
  13: ["#########", "#...#...#", "#...#...#", "#########", "#...#...#", ".#..#..#.", ".#..#..#.", "..#.#.#..", "...###..."],
  // 14 Ring Badge: a hash ring with nodes
  14: ["...###...", ".##...##.", ".#.....#.", "#.......#", "#.......#", "#.......#", ".#.....#.", ".##...##.", "...###..."],
  // 15 Fabric Badge: leaf-spine links
  15: ["..#...#..", "..#...#..", "##.#.#.##", "#.#.#.#.#", "#..###..#", "#.#.#.#.#", "##.#.#.##", "..#...#..", "..#...#.."],
  // 16 Offer Badge: a check mark
  16: [".........", "........#", ".......##", "......##.", "#....##..", "##..##...", ".####....", "..##.....", "........."],
};

const mix = (hex: string, to: string, t: number) => {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};

/** Is (x, y) inside an octagon spanning [lo, hi] on both axes, corners cut by `cut`? */
function inOct(x: number, y: number, lo: number, hi: number, cut: number) {
  if (x < lo || y < lo || x > hi || y > hi) return false;
  const dx = Math.min(x - lo, hi - x);
  const dy = Math.min(y - lo, hi - y);
  return dx + dy >= cut;
}

/** Glint band position for frame `f` (off the gem when null). */
function glint(f: number | null, x: number, y: number) {
  if (f === null) return false;
  const k = f * 6 - 6;
  const d = x + y - k;
  return d === 0 || d === 1 || d === 3;
}

function paintBadge(t: Town, frame: number | null): SpriteDef {
  const N = BADGE_SIZE;
  const c = t.badgeColor;
  const palette = {
    o: "#120e2a",
    // gold bezel, highlight → shadow
    "1": "#fff4b8",
    "2": "#f0c850",
    "3": "#b8862c",
    "4": "#6e4a1a",
    // gem face ramp from the gym colour
    a: mix(c, "#ffffff", 0.55),
    b: c,
    c: mix(c, "#000000", 0.3),
    d: mix(c, "#000000", 0.55),
    // emblem: engraved groove + the lit lower edge of the cut
    e: mix(c, "#ffffff", 0.85),
    s: mix(c, "#120e2a", 0.7),
    w: "#ffffff",
  };
  const emblem = EMBLEMS[t.gym] ?? EMBLEMS[1];
  const rows: string[] = [];
  for (let y = 0; y < N; y++) {
    let row = "";
    for (let x = 0; x < N; x++) {
      let ch = ".";
      if (inOct(x, y, 0, N - 1, 7)) ch = "o";
      if (inOct(x, y, 1, N - 2, 7)) {
        // bezel: lit on the upper-left edges, shaded on the lower-right
        const s = x + y;
        ch = s < 16 ? "1" : s < 24 ? "2" : s < 32 ? "3" : "4";
      }
      if (inOct(x, y, 3, N - 4, 6)) ch = "o";
      if (inOct(x, y, 4, N - 5, 6)) {
        // a domed gem lit from the upper left
        const nx = (x - 11.5) / 8;
        const ny = (y - 11.5) / 8;
        const lit = -0.62 * nx - 0.72 * ny + 0.35 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) + ((x + y) & 1 ? 0.03 : -0.03);
        ch = lit > 0.62 ? "a" : lit > 0.2 ? "b" : lit > -0.3 ? "c" : "d";
        const ex = x - 7;
        const ey = y - 7;
        const on = (i: number, j: number) => i >= 0 && j >= 0 && i < 9 && j < 9 && emblem[j][i] === "#";
        if (on(ex, ey)) ch = "s";
        else if (on(ex - 1, ey - 1)) ch = "e";
        if (glint(frame, x, y) && ch !== "s") ch = "w";
      }
      row += ch;
    }
    rows.push(row);
  }
  // a specular spark on the bezel's top-left facet
  const spark: [number, number][] = [
    [5, 3],
    [4, 4],
    [3, 5],
  ];
  for (const [x, y] of spark) rows[y] = rows[y].slice(0, x) + "w" + rows[y].slice(x + 1);
  return { palette, rows };
}

/** The badge at rest. */
export const badgeSprite = (t: Town): SpriteDef => paintBadge(t, null);

/** A glint sweeping across the gem, then a pause at rest (10 frames). */
export function badgeFrames(t: Town): SpriteDef[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, null, null].map((f) => paintBadge(t, f));
}

/** A 7×7 four-point sparkle for the badge-get screen. */
export const SPARKLE: SpriteDef = {
  palette: { w: "#ffffff", y: "#ffe17a", o: "#c99a1f" },
  rows: ["...o...", "...y...", "..oyo..", "oyywyyo", "..oyo..", "...y...", "...o..."],
};
