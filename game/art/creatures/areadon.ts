import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Areadon, the gym 11 boss of Static Strand: an armoured reef drake whose
 * body is an OSPF autonomous system. A gold ring on its chest is Area 0, the
 * backbone; a ring on each flipper is a normal area (1 and 2) hanging off it
 * through an area border router link. Each link carries its OSPF cost, which
 * is reference bandwidth / interface bandwidth (100 Mbps by default): a 10
 * Mbps link costs 10, a 100 Mbps link costs 1.
 *
 * Its idle loop is link-state flooding: the backbone lights first, then
 * Area 1, then Area 2, then the costs (the shortest-path trees are built).
 * On the attack every link flashes at once. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter. Drawn
 * facing right; the stage mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#0b1418",
  // blue-green armour scales, highlight → shadow
  L: "#7fe0c4",
  M: "#3fae9c",
  N: "#26798a",
  O: "#154558",
  // pale belly, highlight → shadow
  U: "#f2f2d0",
  V: "#d4cf9a",
  W: "#948f64",
  // gold backbone ring, highlight → shadow
  G: "#ffe58a",
  H: "#e3a432",
  J: "#8f561c",
  // flipper fins, highlight → shadow
  P: "#9cc8ff",
  Q: "#5f8fe0",
  R: "#3a5ab0",
  S: "#233a78",
  // link light and the lit core, an unlit ring, a dark link
  c: "#6ff4ff",
  y: "#f4fff6",
  f: "#17303a",
  t: "#2a6a74",
  // eyes and fangs
  k: "#0b0d10",
  w: "#ffffff",
  e: "#ffcf3f",
  r: "#e0505a",
};

const ARMOUR = "LMNO";
const BELLY = "UVW";
const GOLD = "GHJ";
const FIN = "PQRS";

type Pt = [number, number];

export interface Ring {
  /** OSPF area number (0 is the backbone). */
  area: number;
  x: number;
  y: number;
  r: number;
}

/** Area 0 on the chest, Areas 1 and 2 on the rear and front flippers. */
export const RINGS: readonly Ring[] = [
  { area: 0, x: 46, y: 58, r: 7 },
  { area: 1, x: 22, y: 78, r: 5 },
  { area: 2, x: 64, y: 80, r: 5 },
];

/** Link bandwidths (Mbps) from the backbone to each area; each shows its cost. */
export const LINK_MBPS: Readonly<Record<number, number>> = { 1: 10, 2: 100 };

export const REFERENCE_MBPS = 100;

/** OSPF interface cost: reference bandwidth / bandwidth, rounded down, at least 1. */
export function ospfCost(mbps: number, reference = REFERENCE_MBPS): number {
  if (!(mbps > 0) || !(reference > 0)) throw new RangeError("bandwidths must be positive");
  return Math.max(1, Math.floor(reference / mbps));
}

/** Areas whose ring is lit at flooding level `level` (-1 = none). */
export const litAreas = (level: number): number[] => (level < 0 ? [] : RINGS.filter((g) => g.area <= Math.min(level, 2)).map((g) => g.area));

const DIGITS: Readonly<Record<string, string[]>> = {
  "0": ["yyy", "y.y", "y.y", "y.y", "yyy"],
  "1": [".y.", "yy.", ".y.", ".y.", "yyy"],
  "2": ["yyy", "..y", "yyy", "y..", "yyy"],
  "3": ["yyy", "..y", "yyy", "..y", "yyy"],
  "4": ["y.y", "y.y", "yyy", "..y", "..y"],
  "5": ["yyy", "y..", "yyy", "..y", "yyy"],
  "6": ["yyy", "y..", "yyy", "y.y", "yyy"],
  "7": ["yyy", "..y", "..y", "..y", "..y"],
  "8": ["yyy", "y.y", "yyy", "y.y", "yyy"],
  "9": ["yyy", "y.y", "yyy", "..y", "yyy"],
};

/** Rows of a number in the 3×5 digit font, digits one pixel apart. */
export function digitRows(n: number): string[] {
  const glyphs = String(n).split("").map((d) => DIGITS[d]);
  return [0, 1, 2, 3, 4].map((i) => glyphs.map((g) => g[i]).join("."));
}

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  hx: number;
  hy: number;
  /** How far link-state flooding has got: -1 = dark, 0..3. */
  level: number;
  /** Everything flashes at once (the attack). */
  surge: boolean;
  breath: number;
  eyes: Eyes;
  mouthOpen: boolean;
  crouch: number;
}

const REST: Pose = { bx: 0, by: 0, hx: 0, hy: 0, level: 3, surge: false, breath: 0, eyes: "open", mouthOpen: false, crouch: 0 };

const r = Math.round;

function line(p: Painter, a: Pt, b: Pt, ch: string) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  for (let i = 0; i <= n; i++) {
    const x = r(a[0] + ((b[0] - a[0]) * i) / n);
    const y = r(a[1] + ((b[1] - a[1]) * i) / n);
    if (p.get(x, y)) p.set(x, y, ch);
  }
}

function limbs(p: Painter, pose: Pose) {
  const { bx, by, crouch } = pose;
  // two hind legs with claws, behind the body
  for (const x of [34, 54]) {
    p.ellipse(x + bx * 0.8, 80 + by - crouch * 0.5, 6, 6.5 - crouch * 0.4, ARMOUR, { rim: "O" });
    p.stamp(r(x + bx * 0.8) - 3, r(85 + by - crouch * 0.5), ["U.U.U"]);
  }
  // spiny tail curling up behind
  p.tube(
    [
      [22 + bx, 64 + by],
      [14 + bx, 70 + by + crouch],
      [10 + bx, 58 + by + crouch],
    ],
    [8, 5, 1.6],
    ARMOUR,
    { rim: "O" },
  );
}

function body(p: Painter, pose: Pose) {
  const { bx, by, breath } = pose;
  const cx = 46 + bx;
  const cy = 64 + by;
  p.ellipse(cx, cy, 28 + breath, 19 + breath * 0.6, ARMOUR, { rim: "O" });
  // overlapping armour plates: darker scale arcs over the back
  for (let i = 0; i < 5; i++) p.ellipse(cx - 18 + i * 9, cy - 11 + (i % 2) * 3, 5.5, 4.5, ARMOUR, { clip: true, rim: "O", bias: 0.1 });
  // pale belly
  p.ellipse(cx + 2, cy + 15, 26 + breath, 8, BELLY, { clip: true, bias: 0.05 });
  // dorsal spines
  for (let i = 0; i < 5; i++) p.stamp(r(cx - 20 + i * 9), r(cy - 22 + (i % 2) * 2), [".G.", "GHG", "HJH"]);
}

/** The flippers: broad blue fins out of the shoulders, one per area ring. */
function fins(p: Painter, pose: Pose) {
  const { bx, by, crouch } = pose;
  p.ellipse(22 + bx, 78 + by + crouch * 0.3, 14, 6.5, FIN, { rim: "S", rot: 0.35 });
  p.ellipse(64 + bx, 80 + by + crouch * 0.3, 14, 6.5, FIN, { rim: "S", rot: -0.35 });
}

/** The OSPF picture: ABR links with their costs, then the rings over them. */
function rings(p: Painter, pose: Pose) {
  const { bx, by, level, surge } = pose;
  const lit = new Set(surge ? [0, 1, 2] : litAreas(level));
  const pos = (g: Ring): Pt => [g.x + bx, g.y + by + (g.area ? pose.crouch * 0.3 : 0)];
  const root = pos(RINGS[0]);
  for (const g of RINGS.slice(1)) {
    const [gx, gy] = pos(g);
    const on = lit.has(g.area) && lit.has(0);
    line(p, root, [gx, gy], on ? "c" : "t");
    line(p, [root[0], root[1] + 1], [gx, gy + 1], on ? "c" : "t");
  }
  for (const g of RINGS) {
    const [x, y] = pos(g);
    const on = lit.has(g.area);
    if (g.area === 0) {
      p.ellipse(x, y, g.r, g.r, GOLD, { rim: "J" });
      p.ellipse(x, y, g.r - 3, g.r - 3, "ft", { bias: -0.4, rim: "f" });
      p.set(x, y, on ? "y" : "t");
      p.set(x - 1, y, on ? "c" : "f");
      p.set(x + 1, y, on ? "c" : "f");
    } else {
      p.ellipse(x, y, g.r, g.r, "ft", { rim: on ? "c" : "f", bias: -0.4 });
      p.ellipse(x, y, g.r - 2.5, g.r - 2.5, "ft", { rim: "f" });
      p.set(x, y, on ? "y" : "t");
    }
  }
  // link costs in the 3x5 font, above each ABR link, only once the SPF has run
  if (level >= 3 || surge) {
    for (const g of RINGS.slice(1)) {
      const rows = digitRows(ospfCost(LINK_MBPS[g.area]));
      const [gx, gy] = pos(g);
      const mx = r((root[0] + gx) / 2) - (g.area === 1 ? 3 : -2);
      const my = r((root[1] + gy) / 2) - 3;
      p.stamp(mx, my, rows.map((row) => row.replace(/y/g, "y")));
    }
  }
}

function head(p: Painter, pose: Pose, back: boolean) {
  const { bx, by } = pose;
  const hx = 71 + bx * 0.6 + pose.hx;
  const hy = 36 + by + pose.hy;
  // long neck rising from the shoulder
  p.tube(
    [
      [60 + bx, 56 + by],
      [65 + bx * 0.8, 46 + by],
      [hx - 3, hy + 3],
    ],
    [9, 7, 6],
    ARMOUR,
    { rim: "O" },
  );
  p.ellipse(hx, hy, 9, 7.5, ARMOUR, { rim: "O" });
  // long snout with a pale chin
  p.ellipse(hx + 8, hy + 3, 7, 4.5, ARMOUR, { rim: "O", bias: 0.1 });
  p.ellipse(hx + 7, hy + 6, 7, 2.5, BELLY, { clip: true });
  // crest of gold horns
  p.stamp(r(hx) - 8, r(hy) - 14, ["..G", ".GH", "GHJ", "HJ."]);
  p.stamp(r(hx) - 3, r(hy) - 16, ["..G", ".GH", "GHJ", "HJ."]);
  if (pose.level >= 0 || pose.surge) p.set(r(hx) - 5, r(hy) - 9, "c");
  if (back) {
    p.ellipse(hx + 1, hy, 9, 7.5, "NO", { clip: true, bias: -0.3 });
    return;
  }
  if (pose.mouthOpen) {
    p.stamp(r(hx) + 7, r(hy) + 6, ["kkkkk", "krwrk", ".kkk."]);
    p.stamp(r(hx) + 9, r(hy) + 5, ["w.w"]);
  } else for (let x = 6; x <= 13; x++) p.set(hx + x, hy + 6, "O");
  const ex = r(hx + 2);
  const ey = r(hy - 1);
  if (pose.eyes === "shut") p.stamp(ex - 1, ey, ["kkk"]);
  else if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
  else p.stamp(ex - 1, ey - 1, ["kkk", "kek", "kkk"]);
  p.stamp(ex - 3, ey - 3, pose.eyes === "fierce" ? ["OO...", ".OOOO", "...OO"] : ["OOOOO"]);
  p.stamp(r(hx) + 12, r(hy) + 2, ["O"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  limbs(p, pose);
  body(p, pose);
  fins(p, pose);
  head(p, pose, back);
  rings(p, pose);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const bob = [
    { hx: 0, hy: 0, breath: 0 },
    { hx: 0, hy: -1, breath: 1 },
    { hx: 1, hy: 0, breath: 1 },
    { hx: 0, hy: 1, breath: 0 },
  ];
  return {
    // link-state flooding: backbone, Area 1, Area 2, then the costs
    idle: [0, 1, 2, 3].map((level) => f({ ...bob[level], level })),
    attack: [
      f({ bx: -2, hx: -3, eyes: "fierce", mouthOpen: true, surge: true }),
      f({ bx: 4, hx: 2, hy: 2, eyes: "fierce", mouthOpen: true, surge: true }),
    ],
    hurt: [
      f({ bx: -3, hx: -4, hy: 2, eyes: "shut", level: -1 }),
      f({ bx: -1, hx: -2, hy: 1, eyes: "shut", level: 0 }),
    ],
    faint: [
      f({ by: 2, hx: -2, hy: 8, eyes: "ko", mouthOpen: true, level: -1, crouch: 2 }),
      f({ by: 4, hx: -4, hy: 14, eyes: "ko", mouthOpen: true, level: -1, crouch: 4 }),
    ],
  };
}

export const AREADON: CreatureArt = {
  id: "areadon",
  name: "Areadon",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "AREA FLOOD",
  blurb:
    "Keeper of Static Strand. The gold ring on its chest is Area 0, the backbone; each flipper ring is an area that must connect to it. Link cost is reference bandwidth over link bandwidth: 10 Mbps costs 10, 100 Mbps costs 1.",
};
