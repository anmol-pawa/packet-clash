import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";
import { ringHash } from "@/lib/net/loadbalance";
import { leafSpine } from "@/lib/net/datacenter";

/**
 * Spineback, the gym 15 boss of Fabric Fort: an armoured slate lizard with a
 * leaf-spine (Clos) fabric across its back. Four leaf plates sit on the
 * ridge, two spine sails float above, and every leaf is wired to every spine
 * (8 links), so any two leaves are exactly two hops apart with one path per
 * spine. The idle loop sends a flow leaf → spine → leaf; ECMP (a hash of the
 * flow's 5-tuple, mod the number of spines) picks which spine carries it, and
 * the chosen path lights. On the attack the whole fabric lights; hurt and
 * faint go dark. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter. Drawn
 * facing right; the stage mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#0f1420",
  // scales, highlight → shadow
  L: "#b9d6e8",
  M: "#7fa8c4",
  N: "#4d7494",
  O: "#2c4560",
  // belly, highlight → shadow
  U: "#f1e4c4",
  V: "#cdb98a",
  W: "#97835a",
  X: "#5a4a34",
  // plates and sails (steel blue) lit / dim / edge
  S: "#bfe8ff",
  s: "#3d5878",
  e: "#233349",
  // links: lit amber / dim
  A: "#ffd24a",
  a: "#6a8fb8",
  // spine sails lit (violet) / dim
  P: "#ff9de0",
  p: "#5a4478",
  // dark plates (hurt, faint)
  f: "#2a3040",
  // packet marker
  y: "#f4fff6",
  // eye
  w: "#ffffff",
  b: "#0b0d10",
  // eye iris
  g: "#ffd24a",
};

const SCALE = "LMNO";
const BELLY = "UVWX";

type Pt = [number, number];

export const SPINES = 2;
export const LEAVES = 4;
/** The fabric's shape from the textbook formulas: 8-port leaves with 2 uplinks, 4-port spines. */
export const FABRIC = leafSpine(8, SPINES, LEAVES);
/** Total leaf↔spine links: every leaf connects to every spine. */
export const LINKS = LEAVES * SPINES;

export interface Flow {
  src: number;
  dst: number;
  sport: number;
}
/** One flow per idle frame, from the source leaf to a different leaf. */
export const FLOWS: readonly Flow[] = [
  { src: 0, dst: 3, sport: 40000 },
  { src: 1, dst: 2, sport: 40000 },
  { src: 3, dst: 0, sport: 40000 },
  { src: 2, dst: 1, sport: 40000 },
];

/** ECMP: hash the flow's 5-tuple (here src, dst, source port) and take it modulo the number of equal-cost spines. */
export const ecmpSpine = (f: Flow, spines = SPINES): number => ringHash(`L${f.src}>L${f.dst}:${f.sport}`) % spines;

/** Hops between two leaves through the fabric (leaf → spine → leaf). */
export const leafHops = (a: number, b: number): number => (a === b ? 0 : 2);

/** Sprite-space centres: leaf plates on the back ridge, spine sails above. */
export const LEAF_X: readonly number[] = [18, 31, 44, 57];
export const LEAF_Y = 47;
export const SPINE_X: readonly number[] = [26, 49];
export const SPINE_Y = 22;

/** The link from leaf `l` up to spine `s` as a pixel line. */
export function linkPixels(l: number, s: number, bx = 0, by = 0): Pt[] {
  const x0 = LEAF_X[l] + bx;
  const y0 = LEAF_Y - 3 + by;
  const x1 = SPINE_X[s] + bx;
  const y1 = SPINE_Y + 3 + by * 0.7;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]);
  return out;
}

/** A 9×5 plate (leaf) or sail (spine): lit, dim or dark. */
export function plateRows(kind: "leaf" | "spine", state: "lit" | "dim" | "dark"): string[] {
  const [hi, mid, edge] = state === "dark" ? ["f", "f", "f"] : state === "lit" ? (kind === "leaf" ? ["y", "S", "s"] : ["y", "P", "p"]) : kind === "leaf" ? ["s", "s", "e"] : ["p", "p", "e"];
  return [`.${edge.repeat(7)}.`, `${edge}${hi.repeat(7)}${edge}`, `${edge}${mid.repeat(7)}${edge}`, `${edge}${mid.repeat(7)}${edge}`, `.${edge.repeat(7)}.`];
}

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Head lift (negative = up). */
  hy: number;
  /** Which flow is in flight: 0..3, or -1 = dark. */
  flow: number;
  surge: boolean;
  breath: number;
  eyes: Eyes;
  crouch: number;
}

const REST: Pose = { bx: 0, by: 0, hy: 0, flow: 0, surge: false, breath: 0, eyes: "open", crouch: 0 };

const r = Math.round;

function legs(p: Painter, pose: Pose) {
  const { bx, by, crouch } = pose;
  const set: Pt[][] = [
    [[20, 66], [14, 77], [13, 88]],
    [[28, 68], [26, 79], [26, 89]],
    [[48, 68], [50, 79], [51, 89]],
    [[56, 66], [60, 77], [62, 88]],
  ];
  set.forEach((leg, i) => {
    const pts: Pt[] = leg.map(([x, y], j) => [x + bx * (1 - j * 0.3), Math.min(89, y + by * (1 - j * 0.35) + (j ? crouch * 0.3 : 0))] as Pt);
    p.tube(pts, [5, 3.5, 3], i % 3 === 0 ? "MNO" : SCALE, { rim: "o" });
    // claws
    const [hx, hy] = pts[2];
    p.stamp(r(hx) - 3, r(hy) - 1, ["XXXXXXX", "ooooooo"]);
  });
}

function body(p: Painter, pose: Pose) {
  const { bx, by, breath } = pose;
  const cx = 38 + bx;
  const cy = 62 + by;
  // tail sweeping down and back
  p.tube([[22 + bx, 64 + by], [13 + bx, 70 + by], [10 + bx, 79 + by], [14 + bx, 85 + by * 0.8]], [8, 5.5, 4, 2.5], SCALE, { rim: "O" });
  p.ellipse(cx, cy, 25 + breath, 14 + breath * 0.5, SCALE, { rim: "O" });
  // pale belly plates
  p.ellipse(cx + 2, cy + 11, 21, 5, BELLY, { rim: "X", bias: 0.1 });
}

function head(p: Painter, pose: Pose) {
  const { bx, by, hy } = pose;
  const hx = 70 + bx;
  const hyy = 55 + by + hy;
  p.tube([[56 + bx, 58 + by], [hx - 2, hyy + 1]], [10, 8], SCALE, { rim: "O" });
  p.ellipse(hx, hyy, 11, 9, SCALE, { rim: "o" });
  // long snout
  p.ellipse(hx + 9, hyy + 3, 8, 5, SCALE, { rim: "o", bias: 0.1 });
  // jaw
  p.ellipse(hx + 8, hyy + 8, 7, 2.5, BELLY, { rim: "o" });
  // brow ridge horn
  p.tube([[hx - 4, hyy - 7], [hx - 10, hyy - 13]], [3, 1.5], BELLY, { rim: "o" });
}

function face(p: Painter, pose: Pose, back: boolean) {
  const { bx, by, hy } = pose;
  if (back) return;
  const hx = r(70 + bx);
  const hyy = r(55 + by + hy);
  p.set(hx + 16, hyy + 1, "o");
  const ex = hx + 2;
  const ey = hyy - 3;
  if (pose.eyes === "shut") p.stamp(ex, ey + 1, ["bbbb"]);
  else if (pose.eyes === "ko") p.stamp(ex, ey - 1, ["b...b", ".b.b.", "..b..", ".b.b.", "b...b"]);
  else {
    p.stamp(ex, ey - 2, [".wwww.", "wggbww", "wggbww", "wwwwww", ".wwww."]);
    if (pose.eyes === "fierce") p.stamp(ex - 1, ey - 4, ["XXXXXXX"]);
  }
}

function setLine(p: Painter, pts: Pt[], ch: string) {
  for (const [x, y] of pts) p.set(x, y, ch);
}

/** The fabric: dim links first, the lit path on top, then plates and sails. */
function fabric(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const dark = pose.flow < 0 && !pose.surge;
  const flow = pose.flow >= 0 && !pose.surge ? FLOWS[pose.flow] : null;
  const spine = flow ? ecmpSpine(flow) : -1;
  const litLeaf = (l: number) => pose.surge || (flow !== null && (l === flow.src || l === flow.dst));
  const litSpine = (s: number) => pose.surge || s === spine;
  const litLink = (l: number, s: number) => pose.surge || (flow !== null && s === spine && (l === flow.src || l === flow.dst));
  for (let l = 0; l < LEAVES; l++) for (let s = 0; s < SPINES; s++) if (!litLink(l, s)) setLine(p, linkPixels(l, s, bx, by), dark ? "f" : "a");
  for (let l = 0; l < LEAVES; l++) for (let s = 0; s < SPINES; s++) if (litLink(l, s)) setLine(p, linkPixels(l, s, bx, by), "A");
  for (let s = 0; s < SPINES; s++) p.stamp(r(SPINE_X[s] + bx) - 4, r(SPINE_Y + by * 0.7) - 2, plateRows("spine", dark ? "dark" : litSpine(s) ? "lit" : "dim"));
  for (let l = 0; l < LEAVES; l++) p.stamp(r(LEAF_X[l] + bx) - 4, r(LEAF_Y + by) - 2, plateRows("leaf", dark ? "dark" : litLeaf(l) ? "lit" : "dim"));
  if (flow) {
    // the packet: a bright dot leaving the source leaf
    p.stamp(r(LEAF_X[flow.src] + bx) - 1, r(LEAF_Y + by) - 7, ["yyy", "yyy"]);
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  legs(p, pose);
  body(p, pose);
  head(p, pose);
  face(p, pose, back);
  fabric(p, pose);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const bob = [
    { hy: 0, breath: 0 },
    { hy: -1, breath: 1 },
    { hy: 0, breath: 1 },
    { hy: 1, breath: 0 },
  ];
  return {
    // a flow climbs to the spine ECMP chose and drops to its destination leaf
    idle: [0, 1, 2, 3].map((flow, i) => f({ ...bob[i], flow })),
    attack: [
      f({ bx: -3, hy: -4, eyes: "fierce", surge: true }),
      f({ bx: 6, hy: 3, eyes: "fierce", surge: true }),
    ],
    hurt: [
      f({ bx: -3, hy: 3, eyes: "shut", flow: -1 }),
      f({ bx: -1, hy: 2, eyes: "shut", flow: -1 }),
    ],
    faint: [
      f({ by: 3, hy: 8, eyes: "ko", flow: -1, crouch: 3 }),
      f({ by: 6, hy: 14, eyes: "ko", flow: -1, crouch: 6 }),
    ],
  };
}

export const SPINEBACK: CreatureArt = {
  id: "spineback",
  name: "Spineback",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "LEAF SPINE",
  blurb:
    "Keeper of Fabric Fort. Its back is a Clos fabric: every leaf plate links to every spine sail, so any two leaves are two hops apart with one equal-cost path per spine, and ECMP hashes each flow onto one of them.",
};
