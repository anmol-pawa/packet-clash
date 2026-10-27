import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";
import { natEntry, type NatEntry } from "@/lib/net/ipservices";

/**
 * Nattopus, the gym 12 boss of Service Shoal: a coral octopus that rewrites
 * address tags. Each of its four arms carries a tag plate. An amber "L" plate
 * is an inside local address (private, RFC 1918); when the arm's tag is
 * translated it turns into a cyan "G" plate, the inside global address the
 * outside world sees. All four share one public address and tell their flows
 * apart by source port, which is PAT (NAT overload).
 *
 * Its idle loop translates the arms one after another; on the attack every
 * tag is rewritten at once; hurt and faint go dark. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter. Drawn
 * facing right; the stage mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#1a0b1c",
  // coral skin, highlight → shadow
  L: "#ffb09c",
  M: "#ee767c",
  N: "#b44a78",
  O: "#6a2a62",
  // pale suckers and underside, highlight → shadow
  U: "#ffe4d4",
  V: "#e9b4b4",
  W: "#a97594",
  // tag plates: amber local (fill, border, ink), cyan global (fill, border, ink)
  A: "#ffc94a",
  J: "#8f5a1c",
  k: "#2a1408",
  c: "#5ff0ff",
  n: "#1f7f9c",
  y: "#f4fff6",
  // dark plates (hurt, faint)
  f: "#3a2a44",
  t: "#6a5878",
  // eye
  w: "#ffffff",
  e: "#ffcf3f",
  b: "#0b0d10",
};

const SKIN = "LMNO";
const PALE = "UVW";

type Pt = [number, number];

/** One inside host and its translation. All locals are private, the global is shared (PAT). */
export const NAT_TABLE: readonly NatEntry[] = [
  natEntry("192.168.1.10", 49152, "203.0.113.5", "198.51.100.7", 443),
  natEntry("192.168.1.11", 49153, "203.0.113.5", "198.51.100.7", 443),
  natEntry("192.168.1.12", 49154, "203.0.113.5", "93.184.216.34", 80),
  natEntry("192.168.1.13", 49155, "203.0.113.5", "93.184.216.34", 443),
];

/** Arms (shoulder → tip) and where each arm's tag plate sits. */
const ARMS: readonly Pt[][] = [
  [[30, 60], [20, 74], [12, 86]],
  [[38, 62], [34, 76], [28, 90]],
  [[52, 62], [56, 76], [64, 90]],
  [[62, 60], [74, 74], [84, 86]],
];
export const TAG_POS: readonly Pt[] = [[20, 76], [35, 78], [57, 77], [76, 76]];

/** Which arms show the translated (global) tag at `level` (-1 = dark). */
export const translatedArms = (level: number): number[] => (level < 0 ? [] : ARMS.map((_, i) => i).filter((i) => i < level));

const GLYPH = {
  L: ["y..", "y..", "y..", "y..", "yyy"],
  G: ["yyy", "y..", "y.y", "y.y", "yyy"],
};

/** A 7×7 tag plate: `kind` L (amber), G (cyan) or dark. */
export function tagRows(kind: "L" | "G" | "dark"): string[] {
  const [edge, fill, ink] = kind === "L" ? ["J", "A", "k"] : kind === "G" ? ["n", "c", "y"] : ["f", "f", "t"];
  const glyph = GLYPH[kind === "dark" ? "L" : kind];
  const rows = [edge.repeat(7)];
  for (const g of glyph) rows.push(edge + fill + g.replace(/y/g, ink).replace(/\./g, fill) + fill + edge);
  rows.push(edge.repeat(7));
  return rows;
}

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Mantle lift (negative = up). */
  my: number;
  /** Arm tips drift sideways. */
  sway: number;
  /** How many arms are translated: -1 = dark, 0..4. */
  level: number;
  surge: boolean;
  breath: number;
  eyes: Eyes;
  crouch: number;
}

const REST: Pose = { bx: 0, by: 0, my: 0, sway: 0, level: 4, surge: false, breath: 0, eyes: "open", crouch: 0 };

const r = Math.round;

function arms(p: Painter, pose: Pose) {
  const { bx, by, sway, crouch } = pose;
  ARMS.forEach((a, i) => {
    const s = i % 2 ? -sway : sway;
    const pts: Pt[] = a.map(([x, y], j) => [x + bx * (1 - j * 0.15) + (j ? s * j * 0.5 : 0), y + by + (j ? crouch * 0.4 : 0)]).map(([x, y]) => [x, Math.min(y, 90)] as Pt);
    p.tube(pts, [8, 6, 2.5], SKIN, { rim: "O" });
    // sucker dots along the underside of each arm
    const [, mid, tip] = pts;
    for (const [qx, qy] of [mid, tip]) p.set(r(qx) + 4, r(qy) + 1, "U");
    p.set(r(tip[0]), r(tip[1]) + 1, "U");
  });
}

function mantle(p: Painter, pose: Pose) {
  const { bx, by, my, breath } = pose;
  const cx = 42 + bx;
  const cy = 34 + by + my;
  p.ellipse(cx, cy, 22 + breath, 20 + breath * 0.6, SKIN, { rim: "O" });
  // pale mottling on the dome
  for (const [dx, dy, rad] of [[-8, -8, 3], [4, -12, 2.5], [-14, 2, 2.5], [10, -2, 2]] as const) p.ellipse(cx + dx, cy + dy, rad, rad, SKIN, { clip: true, bias: 0.25 });
  // head, where the arms meet, with a pale throat
  p.ellipse(46 + bx, 52 + by + my * 0.4, 21, 13, SKIN, { rim: "O", bias: 0.05 });
  p.ellipse(50 + bx, 60 + by + my * 0.4, 16, 5, PALE, { clip: true });
  // siphon on the right
  p.tube([[64 + bx, 54 + by], [72 + bx, 58 + by + my * 0.3]], [4, 3], SKIN, { rim: "O" });
}

function face(p: Painter, pose: Pose, back: boolean) {
  const { bx, by, my } = pose;
  const ex = r(58 + bx);
  const ey = r(46 + by + my * 0.4);
  if (back) {
    p.ellipse(42 + bx, 34 + by + my, 22, 20, "NO", { clip: true, bias: -0.3 });
    return;
  }
  if (pose.eyes === "shut") p.stamp(ex - 3, ey, ["bbbbbb"]);
  else if (pose.eyes === "ko") p.stamp(ex - 3, ey - 3, ["b...b", ".b.b.", "..b..", ".b.b.", "b...b"]);
  else {
    p.stamp(ex - 5, ey - 5, ["...wwww...", "..wwwwww..", ".wwweeeww.", "wwweebbeww", "wwweebbeww", ".wwweeeww.", "..wwwwww..", "...wwww..."]);
  }
  p.stamp(ex - 5, ey - 8, pose.eyes === "fierce" ? ["OOO.......", ".OOOOOOOOO", "........OO"] : ["OOOOOOOOOO"]);
}

function tags(p: Painter, pose: Pose) {
  const on = new Set(pose.surge ? [0, 1, 2, 3] : translatedArms(pose.level));
  TAG_POS.forEach(([x, y], i) => {
    const kind = pose.level < 0 && !pose.surge ? "dark" : on.has(i) ? "G" : "L";
    const dx = r(pose.bx * 0.7 + (i % 2 ? -pose.sway : pose.sway) * 0.5);
    p.stamp(x - 3 + dx, y - 3 + pose.by + r(pose.crouch * 0.4), tagRows(kind));
  });
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  arms(p, pose);
  mantle(p, pose);
  face(p, pose, back);
  tags(p, pose);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const bob = [
    { my: 0, sway: 0, breath: 0 },
    { my: -1, sway: 1, breath: 1 },
    { my: 0, sway: 2, breath: 1 },
    { my: 1, sway: 1, breath: 0 },
  ];
  return {
    // the arms are translated one after another: private → public
    idle: [0, 1, 3, 4].map((level, i) => f({ ...bob[i], level })),
    attack: [
      f({ bx: -2, my: -2, sway: 3, eyes: "fierce", surge: true }),
      f({ bx: 4, my: 1, sway: -2, eyes: "fierce", surge: true }),
    ],
    hurt: [
      f({ bx: -3, my: 2, sway: 2, eyes: "shut", level: -1 }),
      f({ bx: -1, my: 1, sway: 1, eyes: "shut", level: -1 }),
    ],
    faint: [
      f({ by: 2, my: 8, sway: 3, eyes: "ko", level: -1, crouch: 2 }),
      f({ by: 4, my: 14, sway: 5, eyes: "ko", level: -1, crouch: 4 }),
    ],
  };
}

export const NATTOPUS: CreatureArt = {
  id: "nattopus",
  name: "Nattopus",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "TAG SWAP",
  blurb:
    "Keeper of Service Shoal. Each arm rewrites an address tag: the amber inside local (private) address becomes the cyan inside global one. With PAT all four arms share one public address and are told apart by source port.",
};
