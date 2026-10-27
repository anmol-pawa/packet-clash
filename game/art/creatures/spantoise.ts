import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Spantoise, the gym 10 boss of Trunk Reef: an ancient sea-tortoise whose
 * mossy shell is a spanning tree. Seven switch plates sit on the dome, the
 * root bridge's plate crowned in gold. Glowing cyan lines are the links the
 * tree forwards on; the two dashed red lines are the redundant links STP has
 * blocked, which is how it stops a broadcast storm.
 *
 * Its idle loop is a BPDU spreading from the root: frame 0 lights only the
 * root, frame 1 its children, frame 2 the leaves, frame 3 the whole tree (the
 * network has converged). On the attack every link flashes and the blocked
 * links turn solid. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter. Drawn
 * facing right; the stage mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#0d1417",
  // mossy shell, highlight → shadow
  L: "#6fd9a0",
  M: "#3aa876",
  N: "#23775a",
  O: "#144a42",
  // olive skin, highlight → shadow
  P: "#c5e08a",
  Q: "#92b85a",
  R: "#5e8038",
  S: "#34501f",
  // cream plastron, highlight → shadow
  U: "#fff2c8",
  V: "#e6c98a",
  W: "#a98a58",
  // gold crown, highlight → shadow
  G: "#ffe58a",
  H: "#e3a432",
  J: "#8f561c",
  // link light and the lit core, an unlit plate, a dark link
  c: "#6ff4ff",
  y: "#f4fff6",
  f: "#17303a",
  t: "#2a6a74",
  // blocked links: bright and dim
  r: "#e0505a",
  d: "#7a2a3a",
  // eyes
  k: "#0b0d10",
  w: "#ffffff",
  e: "#ffcf3f",
};

const SHELL = "LMNO";
const SKIN = "PQRS";
const CREAM = "UVW";
const GOLD = "GHJ";

export interface Plate {
  id: string;
  /** Centre on the shell, in sprite pixels. */
  x: number;
  y: number;
  /** The plate nearer the root that this one forwards through (null for the root). */
  parent: string | null;
}

/** The seven switches: `R` is the root bridge, the rest hang off it as a tree. */
export const PLATES: readonly Plate[] = [
  { id: "R", x: 44, y: 44, parent: null },
  { id: "A", x: 27, y: 53, parent: "R" },
  { id: "B", x: 61, y: 53, parent: "R" },
  { id: "C", x: 44, y: 60, parent: "R" },
  { id: "D", x: 20, y: 68, parent: "A" },
  { id: "E", x: 68, y: 68, parent: "B" },
  { id: "F", x: 44, y: 74, parent: "C" },
];

/** Redundant links the tree leaves out: STP puts one end of each in the blocking state. */
export const BLOCKED: readonly (readonly [string, string])[] = [
  ["D", "F"],
  ["E", "F"],
];

/** Hops from the root bridge down the tree: the cost-in-hops a BPDU has travelled. */
export function depth(id: string): number {
  let d = 0;
  for (let p = PLATES.find((x) => x.id === id); p?.parent; p = PLATES.find((x) => x.id === p!.parent)) d++;
  return d;
}

/** Idle frame `i` lights every plate whose depth is at most `i` (frame 3 is everything). */
export const litPlates = (level: number): string[] => PLATES.filter((p) => depth(p.id) <= level).map((p) => p.id);

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Head offset (extending forwards, drooping down). */
  hx: number;
  hy: number;
  /** How far the BPDU has spread: -1 = dark, 0..3 = depth reached. */
  level: number;
  /** Blocked links drawn solid and bright (the attack). */
  surge: boolean;
  breath: number;
  eyes: Eyes;
  mouthOpen: boolean;
  /** Legs folding for the faint. */
  crouch: number;
}

const REST: Pose = { bx: 0, by: 0, hx: 0, hy: 0, level: 3, surge: false, breath: 0, eyes: "open", mouthOpen: false, crouch: 0 };

const r = Math.round;
type Pt = [number, number];

function line(p: Painter, a: Pt, b: Pt, ch: string, dash = 0) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  for (let i = 0; i <= n; i++) {
    if (dash && Math.floor(i / dash) % 2) continue;
    const x = r(a[0] + ((b[0] - a[0]) * i) / n);
    const y = r(a[1] + ((b[1] - a[1]) * i) / n);
    if (p.get(x, y)) p.set(x, y, ch);
  }
}

function legs(p: Painter, pose: Pose) {
  const { bx, by, crouch } = pose;
  for (const [x, ramp, dx] of [
    [32, "QRS", 0],
    [60, "QRS", 0],
    [20, SKIN, 0],
    [70, SKIN, 3],
  ] as const) {
    p.ellipse(x + bx * 0.8 + dx, 82 + by - crouch * 0.5, 6.5, 6.5 - crouch * 0.4, ramp, { rim: "S" });
    // claws
    const fx = r(x + bx * 0.8 + dx);
    p.stamp(fx - 3, r(86 + by - crouch * 0.5), ["V.V.V"]);
  }
}

function tail(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  p.tube(
    [
      [16 + bx, 72 + by],
      [7 + bx, 78 + by + pose.crouch],
    ],
    [3.5, 1.2],
    SKIN,
    { rim: "S" },
  );
}

function shell(p: Painter, pose: Pose) {
  const { bx, by, breath } = pose;
  const cx = 44 + bx;
  const cy = 62 + by;
  p.ellipse(cx, cy, 31 + breath, 29 + breath * 0.6, SHELL, { rim: "O" });
  // darker plate seams ringing the dome
  p.ellipse(cx, cy, 25, 23, "NO", { clip: true, bias: 0.55 });
  p.ellipse(cx - 1, cy - 2, 23, 21, SHELL, { clip: true, bias: 0.12 });
  // cream plastron along the underside
  p.ellipse(cx, 87 + by, 31 + breath, 8, CREAM, { clip: true, bias: 0.05 });
  // the cut-off underside: nothing below the plastron
  for (let y = 90 + by; y < 96; y++) for (let x = 0; x < 96; x++) if (p.get(x, y) && y > 90 + by) p.set(x, y, null);
}

/** The spanning tree drawn on the shell: links first, then the plates over them. */
function tree(p: Painter, pose: Pose) {
  const { bx, by, level, surge } = pose;
  const at = (id: string): Pt => {
    const pl = PLATES.find((x) => x.id === id)!;
    return [pl.x + bx, pl.y + by];
  };
  const lit = new Set(litPlates(level));
  for (const pl of PLATES) {
    if (!pl.parent) continue;
    line(p, at(pl.parent), at(pl.id), lit.has(pl.id) ? "c" : "t");
  }
  for (const [a, b] of BLOCKED) line(p, at(a), at(b), surge ? "r" : level < 0 ? "d" : "d", surge ? 0 : 2);
  // blocked links carry a red cross at their midpoints
  if (level >= 0)
    for (const [a, b] of BLOCKED) {
      const [ax, ay] = at(a);
      const [qx, qy] = at(b);
      p.stamp(r((ax + qx) / 2) - 1, r((ay + qy) / 2) - 1, ["r.r", ".r.", "r.r"]);
    }
  for (const pl of PLATES) {
    const [x, y] = at(pl.id);
    const on = lit.has(pl.id);
    if (pl.id === "R") {
      // the root bridge: a gold plate with its own crown jewel
      p.ellipse(x, y, 4.6, 4.6, GOLD, { rim: "J" });
      p.stamp(x - 1, y - 1, on ? ["yy", "yc"] : ["JJ", "JJ"]);
      continue;
    }
    p.ellipse(x, y, 3.6, 3.6, "ft", { rim: "f", bias: -0.4 });
    p.set(x, y, on ? "y" : "t");
    p.set(x - 1, y, on ? "c" : "f");
    p.set(x, y - 1, on ? "c" : "f");
  }
}

function head(p: Painter, pose: Pose, back: boolean) {
  const { bx, by } = pose;
  const hx = 78 + bx * 0.6 + pose.hx;
  const hy = 60 + by + pose.hy;
  // neck out of the shell
  p.tube(
    [
      [66 + bx, 66 + by],
      [hx - 3, hy + 2],
    ],
    [8, 6.2],
    SKIN,
    { rim: "S" },
  );
  p.ellipse(hx, hy, 8.5, 7.5, SKIN, { rim: "S" });
  // beak-like snout
  p.ellipse(hx + 5, hy + 3, 5, 3.5, SKIN, { rim: "S", bias: 0.1 });
  // gold crown of the root bridge: three points on a band
  const cy = r(hy) - 10;
  const cx = r(hx) - 6;
  p.stamp(cx, cy, ["G..G..G", "GH.GH.GH", "HGGGGGGJ", "JHHHHHJJ"]);
  if (pose.level >= 0) p.set(cx + 4, cy + 2, "c");
  if (back) {
    p.ellipse(hx + 1, hy, 8.5, 7.5, "QRS", { clip: true, bias: -0.3 });
    return;
  }
  // mouth
  if (pose.mouthOpen) p.stamp(r(hx) + 3, r(hy) + 4, ["kkkk", "krrk", ".kkk"]);
  else for (let x = 3; x <= 9; x++) p.set(hx + x, hy + 5, "S");
  p.set(r(hx) + 11, r(hy) + 2, "S");
  const ex = r(hx + 2);
  const ey = r(hy - 2);
  if (pose.eyes === "shut") p.stamp(ex - 1, ey, ["kkk"]);
  else if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
  else p.stamp(ex - 1, ey - 1, ["kkk", "kek", "kkk"]);
  // a heavy, wise brow
  p.stamp(ex - 3, ey - 3, pose.eyes === "fierce" ? ["SS...", ".SSSS", "...SS"] : ["SSSSS"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  legs(p, pose);
  tail(p, pose);
  shell(p, pose);
  head(p, pose, back);
  tree(p, pose);
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
    // the BPDU spreading: root, its children, the leaves, the converged tree
    idle: [0, 1, 2, 3].map((level) => f({ ...bob[level], level })),
    attack: [
      f({ bx: -2, hx: -3, eyes: "fierce", mouthOpen: true, surge: true, level: 3 }),
      f({ bx: 4, hx: 1, hy: 1, eyes: "fierce", mouthOpen: true, surge: true, level: 3 }),
    ],
    hurt: [
      f({ bx: -3, hx: -4, hy: 2, eyes: "shut", level: -1 }),
      f({ bx: -1, hx: -2, hy: 1, eyes: "shut", level: 0 }),
    ],
    faint: [
      f({ by: 2, hx: -2, hy: 6, eyes: "ko", mouthOpen: true, level: -1, crouch: 2 }),
      f({ by: 4, hx: -4, hy: 8, eyes: "ko", mouthOpen: true, level: -1, crouch: 4 }),
    ],
  };
}

export const SPANTOISE: CreatureArt = {
  id: "spantoise",
  name: "Spantoise",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "TREE SURGE",
  blurb:
    "Keeper of Trunk Reef. Its shell is a spanning tree: cyan links forward, red links are blocked, and the gold plate is the root bridge, always the lowest bridge ID in the room.",
};
