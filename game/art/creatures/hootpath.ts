import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Hootpath, the gym 4 boss of Hopwood: a great horned owl that routes. Its ear
 * tufts are a router's twin antennae, and a small weighted network is etched
 * into the feathers of its chest (and across its back), with a lamp on every
 * node. In its idle loop it runs Dijkstra's algorithm from S: each frame one
 * more node is *settled* (its lamp lights) in order of shortest distance, and
 * the shortest-path-tree edge that reached it lights with it. The weights are
 * picked so that the cheapest route to A goes the long way round through B,
 * which is the lesson: fewest hops is not least cost. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed.
 */
const PALETTE = {
  o: "#1a1020",
  // plumage, highlight → shadow
  A: "#d9b98a",
  B: "#a5794f",
  C: "#6e4a33",
  D: "#3c2620",
  // facial disc and chest, highlight → shadow
  J: "#fff4dc",
  K: "#ead2a4",
  L: "#b9976c",
  // eyes and beak
  Y: "#ffd04a",
  Z: "#e08a1e",
  k: "#0b0c16",
  w: "#ffffff",
  n: "#ffe7a0",
  m: "#9a6a1c",
  // talons
  T: "#c9c3b8",
  U: "#6b655d",
  // route lamps: lit, glint, dark; lit and dark etched links
  e: "#7dff8a",
  g: "#eaffea",
  f: "#2f5a3a",
  h: "#4fd36a",
  // antenna beads
  y: "#9fe8ff",
  q: "#3a6d86",
  // the perch: bark and leaves
  P: "#8a6a4a",
  Q: "#5a4130",
  v: "#9ccf5a",
  u: "#4f8a3a",
};

const PLUME = "ABCD";
const PALE = "JKL";

/** The chest network: nodes and weighted links. */
export const ROUTE_NODES = ["S", "A", "B", "C"] as const;
export type RouteNode = (typeof ROUTE_NODES)[number];
export const ROUTE_LINKS: [RouteNode, RouteNode, number][] = [
  ["S", "A", 4],
  ["S", "B", 1],
  ["A", "B", 2],
  ["A", "C", 1],
  ["B", "C", 5],
];

/** Where each node's lamp sits on the chest (centre, as drawn before the front is mirrored). */
export const NODE_POS: Record<RouteNode, [number, number]> = {
  S: [48, 52],
  A: [37, 64],
  B: [59, 64],
  C: [48, 76],
};

/**
 * Dijkstra from S over the chest network: the order nodes are settled in,
 * each with its distance and the tree edge (predecessor) that reached it.
 */
export function dijkstra(source: RouteNode = "S"): { node: RouteNode; dist: number; via: RouteNode | null }[] {
  const dist = new Map<RouteNode, number>(ROUTE_NODES.map((n) => [n, Infinity]));
  const via = new Map<RouteNode, RouteNode | null>(ROUTE_NODES.map((n) => [n, null]));
  const done = new Set<RouteNode>();
  dist.set(source, 0);
  const order: { node: RouteNode; dist: number; via: RouteNode | null }[] = [];
  while (done.size < ROUTE_NODES.length) {
    // the unsettled node with the smallest tentative distance (ties by name)
    let u: RouteNode | null = null;
    for (const n of ROUTE_NODES) if (!done.has(n) && (u === null || dist.get(n)! < dist.get(u)!)) u = n;
    if (u === null || dist.get(u) === Infinity) break;
    done.add(u);
    order.push({ node: u, dist: dist.get(u)!, via: via.get(u)! });
    for (const [a, b, w] of ROUTE_LINKS) {
      const v = a === u ? b : b === u ? a : null;
      if (v && !done.has(v) && dist.get(u)! + w < dist.get(v)!) {
        dist.set(v, dist.get(u)! + w);
        via.set(v, u);
      }
    }
  }
  return order;
}

const SETTLE = dijkstra();

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  /** Whole-body offset (lean and sink). */
  bx: number;
  by: number;
  /** Head offset on the body and tilt (radians, for the head bob). */
  hx: number;
  hy: number;
  /** Body swell for breathing. */
  breath: number;
  /** Nodes settled so far (a prefix of Dijkstra's order), −1 for all dark. */
  settled: number;
  /** Wing spread 0 (folded) … 1 (wide open), and droop in px (faint). */
  spread: number;
  droop: number;
  /** Ear tufts lean (x) and droop (y). */
  tx: number;
  ty: number;
  /** Which antenna bead is lit: 0 left, 1 right, 2 both, −1 none. */
  bead: number;
  /** Talons reach forward and up (attack). */
  reach: number;
  eyes: Eyes;
  beakOpen: boolean;
}

const REST: Pose = { bx: 0, by: 0, hx: 0, hy: 0, breath: 0, settled: 1, spread: 0, droop: 0, tx: 0, ty: 0, bead: 0, reach: 0, eyes: "open", beakOpen: false };

/** Straight etched line between two points. */
function line(p: Painter, a: [number, number], b: [number, number], ch: string) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  for (let i = 0; i <= n; i++) p.set(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, ch);
}

/** A wing: folded against the side, or swept out wide with fingered primaries. */
function wing(p: Painter, pose: Pose, side: -1 | 1, X: (x: number) => number, behind: boolean) {
  const cx = 48 + pose.bx;
  const by = pose.by + pose.droop;
  const s = pose.spread;
  const sh: [number, number] = [cx + side * 18, 46 + pose.by];
  if (s <= 0) {
    // folded: a long teardrop down the flank with barred primaries
    const wx = cx + side * 22;
    p.ellipse(X(wx), 63 + by, 8.5, 21, PLUME, { rim: "D", rot: side * -0.12 * (X(1) - X(0)), bias: behind ? -0.25 : 0 });
    for (let k = 0; k < 4; k++) {
      const y = Math.round(58 + by + k * 6);
      p.stamp(Math.round(X(wx + side * 2)) - 2, y, ["CDC.."].map((r) => (side * (X(1) - X(0)) > 0 ? r : [...r].reverse().join(""))));
    }
    // feather tips below the fold
    p.tube(
      [
        [X(wx), 78 + by],
        [X(wx + side * 3), Math.min(90, 86 + by)],
      ],
      [4, 1.5],
      "BCD",
      { rim: "D" },
    );
    return;
  }
  // spread: arm out to the wrist, then a fan of long primaries
  const wrist: [number, number] = [cx + side * (18 + 16 * s), 40 + pose.by - 8 * s];
  p.tube(
    [
      [X(sh[0]), sh[1]],
      [X(wrist[0]), wrist[1]],
    ],
    [7, 5],
    PLUME,
    { rim: "D", bias: behind ? -0.2 : 0.05 },
  );
  for (let k = 0; k < 5; k++) {
    const ang = -0.95 + k * 0.42;
    const len = 18 - Math.abs(k - 1.5) * 2;
    const tip: [number, number] = [wrist[0] + side * Math.cos(ang) * len * 0.75, wrist[1] + Math.sin(ang) * len + 6];
    p.tube(
      [
        [X(wrist[0] - side * 4), wrist[1] + 2 + k * 2.4],
        [X(Math.max(6, Math.min(90, tip[0]))), Math.max(12, tip[1])],
      ],
      [4.2, 1.6],
      k % 2 ? "BCD" : PLUME,
      { rim: "D", bias: behind ? -0.2 : 0 },
    );
  }
  // coverts over the feather roots
  p.ellipse(X((sh[0] + wrist[0]) / 2), (sh[1] + wrist[1]) / 2 + 6, 9, 7, PLUME, { rim: "D", bias: 0.1 });
}

/** A mossy branch across the bottom of the frame for it to grip. */
function perch(p: Painter, pose: Pose, X: (x: number) => number) {
  const y = 89;
  p.tube(
    [
      [X(10), y + 1],
      [X(48), y],
      [X(86), y - 1],
    ],
    [3.2, 3.6, 2.6],
    "PQD",
    { rim: "D" },
  );
  // a stub twig and a few leaves
  p.tube(
    [
      [X(78), y - 1],
      [X(84), y - 6],
    ],
    [1.6, 1],
    "PQD",
  );
  for (const [lx, ly] of [
    [85, -8],
    [14, -2],
    [20, -3],
  ])
    p.ellipse(X(lx), y + ly, 2.6, 1.8, "vu", { rot: 0.5 });
  // bark grain
  for (const gx of [24, 40, 58, 70]) p.set(X(gx), Math.round(y), "D");
}

function feet(p: Pose, pp: Painter, X: (x: number) => number) {
  const y = 86 - p.reach;
  for (const side of [-1, 1]) {
    const fx = 48 + p.bx + side * 8 + p.reach * 0.6;
    // feathered legs into three hooked toes
    pp.ellipse(X(fx), y - 3, 4.5, 4, PALE, { rim: "L" });
    for (const dx of [-3, 0, 3]) {
      pp.tube(
        [
          [X(fx + dx * 0.6), y],
          [X(fx + dx), y + 3],
        ],
        [1.6, 1.2],
        "TU",
      );
      pp.set(X(fx + dx + (dx >= 0 ? 0.5 : -0.5)), y + 4, "k");
    }
  }
}

function tufts(p: Painter, pose: Pose, X: (x: number) => number) {
  const hx = 48 + pose.bx + pose.hx;
  const hy = 29 + pose.by + pose.hy;
  for (const side of [-1, 1] as const) {
    const root: [number, number] = [hx + side * 13, hy - 11];
    const tip: [number, number] = [hx + side * (20 + pose.tx * side), hy - 21 + pose.ty];
    p.tube(
      [
        [X(root[0]), root[1]],
        [X(tip[0]), Math.max(12, tip[1])],
      ],
      [5.5, 1.8],
      PLUME,
      { bias: 0.05, rim: "D" },
    );
    // the antenna bead at the tip, blinking
    const lit = pose.bead === 2 || (pose.bead === 0 && side === -1) || (pose.bead === 1 && side === 1);
    const bx = Math.round(X(tip[0])) - 1;
    const by = Math.max(12, Math.round(tip[1])) - 1;
    p.stamp(bx, by, lit ? [".y.", "ywy", ".q."] : [".q.", "qqq", ".q."]);
  }
}

function head(p: Painter, pose: Pose, back: boolean, X: (x: number) => number) {
  const hx = 48 + pose.bx + pose.hx;
  const hy = 29 + pose.by + pose.hy;
  p.ellipse(X(hx), hy, 22, 17, PLUME, { rim: "D" });
  // speckled crown
  for (const [dx, dy] of [
    [-6, -11],
    [0, -12],
    [6, -11],
    [-10, -7],
    [10, -7],
  ])
    p.stamp(Math.round(X(hx + dx)), Math.round(hy + dy), ["C"]);
  if (back) {
    // the back of the head: a darker nape with barred feathers
    p.ellipse(X(hx), hy + 6, 12, 7, "BCD", { clip: true, bias: -0.1 });
    for (const dx of [-6, 0, 6]) p.stamp(Math.round(X(hx + dx)), Math.round(hy + 2), ["C", "D"]);
    return;
  }
  // the facial disc: two pale saucers with a dark rim
  for (const side of [-1, 1]) p.ellipse(X(hx + side * 8), hy + 1, 9.5, 9, PALE, { rim: "C", bias: 0.15 });
  // a V-shaped brow between the eyes
  p.stamp(Math.round(X(hx)) - 2, Math.round(hy - 7), ["C...C", ".C.C.", "..C.."]);
  for (const side of [-1, 1]) {
    const ex = Math.round(X(hx + side * 8));
    const ey = Math.round(hy + 1);
    if (pose.eyes === "shut") {
      p.stamp(ex - 3, ey, ["k.....k", ".kkkkk."]);
      continue;
    }
    if (pose.eyes === "ko") {
      p.stamp(ex - 2, ey - 2, ["k...k", ".k.k.", "..k..", ".k.k.", "k...k"]);
      continue;
    }
    p.ellipse(ex + 0.5, ey + 0.5, 5.4, 5.4, "YZ", { rim: "m" });
    p.stamp(ex - 1, ey - 1, ["kkk", "kkk", "kkk"]);
    p.set(ex - 1, ey - 1, "w");
    if (pose.eyes === "fierce") {
      // lowered brows over narrowed eyes
      const inner = side === -1 ? 1 : -1;
      const d = X(1) - X(0);
      for (let i = 0; i < 7; i++) p.set(ex - 3 + i, ey - 5 + Math.round(((i - 3) * inner * d + 3) / 2.2), "D");
    }
  }
  // the hooked beak
  const bxx = Math.round(X(hx));
  const byy = Math.round(hy + 6);
  p.stamp(bxx - 2, byy, pose.beakOpen ? ["nYYm", "YZZm", ".k..", "Z..m", ".mm."] : ["nYYm", "YZZm", ".Zm.", "..m."]);
}

function body(p: Painter, pose: Pose, back: boolean, X: (x: number) => number) {
  const cx = 48 + pose.bx;
  const cy = 64 + pose.by;
  // tail feathers fanning below the body
  for (const dx of [-6, 0, 6])
    p.tube(
      [
        [X(cx + dx * 0.5), cy + 10],
        [X(cx + dx), 89 + pose.by * 0.3],
      ],
      [5, 2.5],
      "BCD",
      { rim: "D" },
    );
  p.ellipse(X(cx), cy, 24 + pose.breath, 25 + pose.breath, PLUME, { rim: "D" });
  if (!back) {
    // a pale chest barred with chevrons
    p.ellipse(X(cx), cy + 2, 17 + pose.breath, 20 + pose.breath, PALE, { clip: true, bias: 0.1 });
    for (const [dx, dy] of [
      [-7, -8],
      [7, -8],
      [-13, 6],
      [13, 6],
      [-7, 16],
      [7, 16],
      [0, 3],
    ])
      p.stamp(Math.round(X(cx + dx)) - 1, Math.round(cy + dy), ["L.L", ".L."]);
  } else {
    // seen from behind: a mantle of barred back feathers
    for (let r = 0; r < 4; r++)
      for (const dx of [-10, -3, 4, 11]) p.stamp(Math.round(X(cx + dx + (r % 2) * 3)) - 1, Math.round(cy - 14 + r * 9), ["C.C", ".D."]);
  }
}

/** The network etched on the chest (front) or back: links, then node lamps. */
function network(p: Painter, pose: Pose, X: (x: number) => number) {
  const settled = pose.settled < 0 ? [] : SETTLE.slice(0, Math.min(pose.settled, SETTLE.length));
  const on = new Set(settled.map((s) => s.node));
  const tree = new Set(settled.filter((s) => s.via).map((s) => [s.node, s.via].sort().join("")));
  const at = (n: RouteNode): [number, number] => [Math.round(X(NODE_POS[n][0]) + pose.bx), Math.round(NODE_POS[n][1] + pose.by)];
  for (const [a, b] of ROUTE_LINKS) line(p, at(a), at(b), tree.has([a, b].sort().join("")) ? "h" : "L");
  for (const n of ROUTE_NODES) {
    const [x, y] = at(n);
    p.stamp(x - 2, y - 2, ["DDDDD", "D...D", "D...D", "D...D", "DDDDD"]);
    p.stamp(x - 1, y - 1, on.has(n) ? ["gee", "eee", "eee"] : ["fff", "fff", "fff"]);
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  const X = (x: number) => (back ? 96 - x : x);
  if (pose.spread > 0) {
    wing(p, pose, -1, X, back);
    wing(p, pose, 1, X, back);
  }
  body(p, pose, back, X);
  perch(p, pose, X);
  if (!back) feet(pose, p, X);
  if (pose.spread <= 0) {
    wing(p, pose, -1, X, back);
    wing(p, pose, 1, X, back);
  }
  network(p, pose, X);
  tufts(p, pose, X);
  head(p, pose, back, X);
  p.outline("o");
  // drawn facing left; foes face right in their art because the stage
  // mirrors them (facing −1), so in battle it turns to the player
  if (!back) p.mirror();
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  return {
    // Dijkstra settles one more node per frame: S, then B, A and C
    idle: [
      f({ settled: 1, bead: 0 }),
      f({ settled: 2, bead: 1, breath: 1, hx: -1 }),
      f({ settled: 3, bead: 0, breath: 1, hx: -2, hy: 1, ty: 1 }),
      f({ settled: 4, bead: 1, hx: -1 }),
    ],
    attack: [
      f({ settled: 4, bead: 2, spread: 0.75, by: -2, hy: 0, tx: 2, eyes: "fierce", beakOpen: true, reach: 1 }),
      f({ settled: 4, bead: 2, spread: 1, bx: -6, by: -1, hx: -3, tx: 3, eyes: "fierce", beakOpen: true, reach: 4 }),
    ],
    hurt: [
      f({ settled: -1, bead: -1, bx: 4, by: -1, hx: 3, hy: 1, tx: -3, ty: 3, eyes: "shut" }),
      f({ settled: -1, bead: -1, bx: 2, hx: 1, tx: -1, ty: 1, eyes: "shut" }),
    ],
    faint: [
      f({ settled: -1, bead: -1, by: 3, hy: 3, droop: 2, tx: -4, ty: 6, eyes: "ko", beakOpen: true }),
      f({ settled: -1, bead: -1, by: 6, hy: 6, hx: 3, droop: 4, tx: -6, ty: 9, eyes: "ko", beakOpen: true }),
    ],
  };
}

export const HOOTPATH: CreatureArt = {
  id: "hootpath",
  name: "Hootpath",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "SHORTEST PATH",
  blurb: "Warden of Hopwood. Its ear tufts are antennae, and the network on its chest lights node by node as it works out the cheapest route to everywhere.",
};
