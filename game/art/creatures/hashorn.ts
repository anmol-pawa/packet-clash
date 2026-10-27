import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";
import { buildRing, ringHash, ringLookup, type RingPoint } from "@/lib/net/loadbalance";

/**
 * Hashorn, the gym 14 boss of Balancer Bluff: a lavender-fleeced ram whose
 * horn is a consistent-hash ring. Three servers (amber, cyan, pink) each
 * own three virtual-node beads around the ring, placed by `ringHash`. Its idle
 * loop drops a request key onto the ring at its hash position; the key walks
 * clockwise to the first bead at or after it, and that bead lights up: that
 * server owns the request. On the attack every bead flares; hurt and faint go
 * dark. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter. Drawn
 * facing right; the stage mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#12101f",
  // fleece, highlight → shadow
  L: "#f4efff",
  M: "#cbbcff",
  N: "#9a86e0",
  O: "#5f4fa8",
  // face and legs, highlight → shadow
  U: "#f0dcc8",
  V: "#c9a58c",
  W: "#8f6e5c",
  X: "#523a3a",
  // horn ring gold, highlight → shadow
  G: "#ffe9a0",
  H: "#e0b84a",
  I: "#a07a2a",
  J: "#5a4018",
  // server beads: lit / dim / edge for a (amber), b (cyan), c (pink)
  A: "#ffc94a",
  a: "#7a6226",
  j: "#8f5a1c",
  C: "#5ff0ff",
  c: "#2a6670",
  n: "#1f7f9c",
  P: "#ff8fc0",
  p: "#7a4660",
  q: "#9c3a6a",
  // request key marker
  y: "#f4fff6",
  // dark beads (hurt, faint)
  f: "#3a2a44",
  // eye
  w: "#ffffff",
  b: "#0b0d10",
};

const FLEECE = "LMNO";
const SKIN = "UVWX";
const GOLD = "GHIJ";

type Pt = [number, number];

/** The three servers and how many virtual nodes each owns on the ring. */
export const NODES: readonly string[] = ["d", "web2", "edge-1"];
export const VNODES = 3;
export const RING: readonly RingPoint[] = buildRing(NODES, VNODES);

/** Request keys the idle loop drops on the ring, one per frame (chosen to land on all three servers). */
export const KEYS: readonly string[] = ["user-17", "feed-2", "video-5", "cart-3"];

/** The server that owns each key, by consistent hashing. */
export const ownerOf = (i: number): string => ringLookup(RING, KEYS[i]);

/** Hash position of key `i` on the ring. */
export const keyPos = (i: number): number => ringHash(KEYS[i]);

/** Index in `RING` of the bead key `i` lands on: the first point at or after its hash, wrapping around. */
export const ownerBead = (i: number): number => {
  const k = RING.findIndex((pt) => pt.pos >= keyPos(i));
  return k < 0 ? 0 : k;
};

const TWO32 = 2 ** 32;
/** Clockwise angle (radians from the top) of a ring position. */
export const angleOf = (pos: number): number => (pos / TWO32) * Math.PI * 2;

/** Ring centre and radius in sprite space. */
export const RING_C: Pt = [62, 33];
export const RING_R = 14;

const ringPt = (angle: number, rad: number, bx: number, by: number): Pt => [RING_C[0] + bx + Math.sin(angle) * rad, RING_C[1] + by - Math.cos(angle) * rad];

const FILL: readonly [string, string, string][] = [
  ["A", "a", "j"],
  ["C", "c", "n"],
  ["P", "p", "q"],
];

/** A 5×5 server bead: lit, dim or dark. */
export function beadRows(node: string, state: "lit" | "dim" | "dark"): string[] {
  const [lit, dim, edge] = FILL[NODES.indexOf(node)];
  const [e, f] = state === "dark" ? ["f", "f"] : state === "lit" ? [edge, lit] : ["f", dim];
  const hi = state === "lit" ? "y" : state === "dark" ? "f" : f;
  return [`.${e}${e}${e}.`, `${e}${hi}${f}${f}${e}`, `${e}${f}${f}${f}${e}`, `${e}${f}${f}${f}${e}`, `.${e}${e}${e}.`];
}

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Head lift (negative = up). */
  hy: number;
  /** Which key is on the ring: 0..3, or -1 = dark. */
  key: number;
  surge: boolean;
  breath: number;
  eyes: Eyes;
  crouch: number;
}

const REST: Pose = { bx: 0, by: 0, hy: 0, key: 0, surge: false, breath: 0, eyes: "open", crouch: 0 };

const r = Math.round;

function legs(p: Painter, pose: Pose) {
  const { bx, by, crouch } = pose;
  const set: Pt[][] = [
    [[22, 70], [20, 82], [20, 90]],
    [[30, 72], [29, 83], [29, 90]],
    [[48, 72], [49, 83], [50, 90]],
    [[56, 70], [58, 82], [60, 90]],
  ];
  set.forEach((leg, i) => {
    const pts: Pt[] = leg.map(([x, y], j) => [x + bx * (1 - j * 0.3), Math.min(90, y + by * (1 - j * 0.35) + (j ? crouch * 0.3 : 0))] as Pt);
    p.tube(pts, [5, 3.5, 3], i % 3 === 0 ? "VWX" : SKIN, { rim: "o" });
    // dark hoof
    const [hx, hy] = pts[2];
    p.stamp(r(hx) - 3, r(hy) - 1, ["XXXXXX", "oooooo"]);
  });
}

function body(p: Painter, pose: Pose) {
  const { bx, by, breath } = pose;
  const cx = 38 + bx;
  const cy = 60 + by;
  p.ellipse(cx, cy, 25 + breath, 17 + breath * 0.5, FLEECE, { rim: "O" });
  // curly tufts along the back and flank
  for (const [dx, dy, rad] of [[-14, -10, 6], [-2, -13, 6], [11, -11, 5.5], [-20, 2, 5], [14, 6, 5], [-6, 8, 5.5]] as const) p.ellipse(cx + dx, cy + dy, rad, rad, FLEECE, { rim: "O", bias: 0.1 });
  // tail tuft
  p.ellipse(cx - 24, cy - 2, 5, 5, FLEECE, { rim: "O" });
}

function ring(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const pts: Pt[] = [];
  for (let i = 0; i <= 28; i++) pts.push(ringPt((i / 28) * Math.PI * 2, RING_R, bx, by * 0.8));
  // the horn root grows from the brow into the ring
  p.tube([[68 + bx, 46 + by + pose.hy], [RING_C[0] + 4 + bx, RING_C[1] + RING_R - 2 + by * 0.8]], [4, 3], GOLD, { rim: "J" });
  p.tube(pts, Array(pts.length).fill(2.6), GOLD, { rim: "J" });
}

function head(p: Painter, pose: Pose) {
  const { bx, by, hy } = pose;
  const hx = 70 + bx;
  const hyy = 52 + by + hy;
  // neck
  p.tube([[56 + bx, 56 + by], [hx - 2, hyy + 1]], [10, 8], FLEECE, { rim: "O" });
  p.ellipse(hx, hyy, 11, 10, SKIN, { rim: "o" });
  // snout
  p.ellipse(hx + 8, hyy + 4, 7, 5.5, SKIN, { rim: "o", bias: 0.1 });
  // ear
  p.tube([[hx - 8, hyy - 2], [hx - 14, hyy + 4]], [3, 2], SKIN, { rim: "o" });
  // fleece fringe on the forehead
  p.ellipse(hx - 2, hyy - 9, 7, 4, FLEECE, { rim: "O" });
}

function face(p: Painter, pose: Pose, back: boolean) {
  const { bx, by, hy } = pose;
  if (back) return;
  const hx = r(70 + bx);
  const hyy = r(52 + by + hy);
  // nostril and mouth
  p.set(hx + 13, hyy + 3, "X");
  p.set(hx + 12, hyy + 8, "X");
  const ex = hx + 3;
  const ey = hyy - 3;
  if (pose.eyes === "shut") p.stamp(ex, ey + 1, ["bbbb"]);
  else if (pose.eyes === "ko") p.stamp(ex, ey - 1, ["b...b", ".b.b.", "..b..", ".b.b.", "b...b"]);
  else {
    p.stamp(ex, ey - 2, [".wwww.", "wwbbww", "wwbbww", "wwwwww", ".wwww."]);
    if (pose.eyes === "fierce") p.stamp(ex - 1, ey - 4, ["XXXXXXX"]);
  }
}

function beads(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const dark = pose.key < 0 && !pose.surge;
  const lit = pose.key >= 0 && !pose.surge ? ownerBead(pose.key) : -1;
  // the lit bead goes last so neighbouring beads never cover it
  const order = RING.map((_, i) => i).sort((i, j) => Number(i === lit) - Number(j === lit));
  for (const i of order) {
    const pt = RING[i];
    const [x, y] = ringPt(angleOf(pt.pos), RING_R, bx, by * 0.8);
    const state = dark ? "dark" : pose.surge || i === lit ? "lit" : "dim";
    p.stamp(r(x) - 2, r(y) - 2, beadRows(pt.node, state));
  }
  if (pose.key >= 0 && !pose.surge) {
    // the request key sits just outside the ring at its hash position
    const [x, y] = ringPt(angleOf(keyPos(pose.key)), RING_R + 7, bx, by * 0.8);
    p.stamp(r(x) - 1, r(y) - 1, ["ooo", "oyo", "ooo"]);
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  legs(p, pose);
  body(p, pose);
  head(p, pose);
  ring(p, pose);
  face(p, pose, back);
  beads(p, pose);
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
    // a request key drops on the ring and walks clockwise to its bead
    idle: [0, 1, 2, 3].map((key, i) => f({ ...bob[i], key })),
    attack: [
      f({ bx: -3, hy: -4, eyes: "fierce", surge: true }),
      f({ bx: 6, hy: 3, eyes: "fierce", surge: true }),
    ],
    hurt: [
      f({ bx: -3, hy: 3, eyes: "shut", key: -1 }),
      f({ bx: -1, hy: 2, eyes: "shut", key: -1 }),
    ],
    faint: [
      f({ by: 3, hy: 8, eyes: "ko", key: -1, crouch: 3 }),
      f({ by: 6, hy: 14, eyes: "ko", key: -1, crouch: 6 }),
    ],
  };
}

export const HASHORN: CreatureArt = {
  id: "hashorn",
  name: "Hashorn",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "CONSISTENT HASH",
  blurb:
    "Keeper of Balancer Bluff. Its horn is a hash ring: servers sit on it as virtual-node beads, and each request walks clockwise to the first bead at or after its hash. Lose a server and only its slice of the ring moves.",
};
