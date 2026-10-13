import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Braidwyrm, the Physical-layer boss: a coiled cable serpent. Its violet
 * jacket is ringed with copper bands, its belly is the white dielectric, the
 * inside of its hood is woven copper braid and the hood's back carries a
 * coax cross-section (jacket, braid, dielectric, core). The tail ends in a
 * screw-on connector that throws sparks. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed.
 */
const PALETTE = {
  o: "#120c22",
  // jacket, highlight → shadow
  A: "#c4b4f5",
  B: "#8a76dc",
  C: "#5c4bb0",
  D: "#3d2e84",
  E: "#261b56",
  // copper braid / core
  F: "#fff1bd",
  G: "#ffc45e",
  H: "#d97a30",
  I: "#8c4120",
  // dielectric belly
  J: "#ffffff",
  K: "#dfe3f0",
  L: "#a3abc6",
  // connector nut
  M: "#f2f9ff",
  N: "#aebdcf",
  P: "#66748c",
  // eyes, mouth, sparks
  y: "#fff36b",
  Y: "#ff9f1c",
  k: "#0d0a1a",
  R: "#ff5272",
  S: "#9e1f40",
  c: "#c8fdff",
  q: "#3fd9ff",
};

const JACKET = "ABCDE";
const COPPER = "FGHI";
const BELLY = "JKL";

type Eyes = "open" | "fierce" | "shut" | "ko";
type Mouth = "shut" | "open" | "wide" | "grit";

interface Pose {
  /** Head offset from rest (the neck bends to follow). */
  hx: number;
  hy: number;
  /** Hood spread: 1 at rest, bigger when flared. */
  hood: number;
  /** Tail-tip sway in px and spark level (−1 none … 2 big arc). */
  tail: number;
  spark: number;
  /** Coil breathing in px. */
  squash: number;
  tongue: boolean;
  eyes: Eyes;
  mouth: Mouth;
}

const REST: Pose = { hx: 0, hy: 0, hood: 1, tail: 0, spark: 0, squash: 0, tongue: false, eyes: "open", mouth: "shut" };

const EYES: Record<Eyes, string[]> = {
  open: [".kkkk..", "kyyyyYk", "kyyykYk", "kyyykYk", ".kkkkk."],
  fierce: ["kk.....", "kkkkkkk", "kyyykYk", "kyyykYk", ".kkkkk."],
  shut: ["......", "kk....", "..kkkk", "......"],
  ko: ["k...k.", ".k.k..", "..k...", ".k.k..", "k...k."],
};

/** Points along an elliptical arc, from angle a0 to a1 (radians). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 10): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

/** Copper bands across a cable segment (drawn clipped onto the body). */
function bands(p: Painter, pts: [number, number][], every: number, r: number) {
  for (let i = 1; i < pts.length - 1; i += every) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i + 1];
    const [x, y] = pts[i];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    p.tube(
      [
        [x - nx * r * 0.8, y - ny * r * 0.8],
        [x + nx * r * 0.8, y + ny * r * 0.8],
      ],
      [1.3, 1.3],
      COPPER,
      { clip: true, bias: 0.1 },
    );
  }
}

function tail(p: Painter, pose: Pose, back: boolean) {
  const s = pose.tail;
  const m = back ? -1 : 1;
  const X = (x: number) => (back ? 96 - x : x);
  const pts: [number, number][] = [
    [X(64), 83],
    [X(80), 82],
    [X(88 + s * 0.4), 73],
    [X(85 + s), 61],
  ];
  p.tube(pts, [6, 5, 4, 3.2], JACKET, { rim: "E" });
  bands(p, pts, 1, 5);
  // screw-on connector: hex nut, then the copper centre pin
  const [tx, ty] = pts[3];
  p.polygon(
    [
      [tx - 4.5, ty + 1],
      [tx - 3.5, ty - 4],
      [tx + 3.5, ty - 4],
      [tx + 4.5, ty + 1],
      [tx + 3.5, ty + 3],
      [tx - 3.5, ty + 3],
    ],
    "N",
  );
  p.stamp(Math.round(tx - 3), Math.round(ty - 4), ["MMMMMM", "M.....", "......", "......", "......", ".....P", "PPPPPP"]);
  p.tube(
    [
      [tx, ty - 4],
      [tx + m * 0.5, ty - 10],
    ],
    [1.4, 1],
    COPPER,
    { bias: 0.2 },
  );
  // sparks off the pin
  if (pose.spark >= 0) {
    const sx = Math.round(tx + m * 0.5);
    const sy = Math.round(ty - 12);
    p.set(sx, sy, "c");
    p.stamp(sx - 3, sy - 2, pose.spark >= 1 ? ["q...q", ".c.c.", "..c.."] : [".q.q.", "..c.."]);
    if (pose.spark >= 1) p.stamp(sx + m * 3, sy - 4, ["q", "c", ".q"]);
    if (pose.spark >= 2) {
      p.stamp(sx - m * 6 - 1, sy - 3, ["c.", ".q", "c."]);
      p.stamp(sx - 1, sy - 6, ["q.q", ".c."]);
    }
  }
}

/** The lower coil: back half first (behind the neck), front half later. */
function coil(p: Pose, half: "back" | "front"): { pts: [number, number][]; r: number }[] {
  const sq = p.squash;
  return half === "back"
    ? [
        { pts: arc(46, 75 + sq * 0.5, 30, 9, Math.PI * 1.05, Math.PI * 1.95), r: 7.5 },
        { pts: arc(46, 64 + sq, 20, 6, Math.PI * 1.05, Math.PI * 1.95), r: 6.5 },
      ]
    : [
        { pts: arc(46, 75 + sq * 0.5, 30, 9, -0.1, Math.PI + 0.1), r: 8 },
        { pts: arc(46, 64 + sq, 20, 6, -0.1, Math.PI + 0.1), r: 7 },
      ];
}

function drawCoil(p: Painter, segs: { pts: [number, number][]; r: number }[], banded: boolean) {
  for (const s of segs) {
    p.tube(s.pts, s.pts.map(() => s.r), JACKET, { rim: "E" });
    if (banded) bands(p, s.pts, 3, s.r);
  }
}

function neck(pose: Pose): [number, number][] {
  const hx = 48 + pose.hx;
  const hy = 34 + pose.hy;
  return [
    [42, 63],
    [36 + pose.hx * 0.2, 56 + pose.hy * 0.4],
    [40 + pose.hx * 0.6, 45 + pose.hy * 0.75],
    [hx, hy],
  ];
}

function hood(p: Painter, pose: Pose, back: boolean) {
  const hx = 48 + pose.hx;
  const hy = 30 + pose.hy;
  const rx = 23 * pose.hood;
  const ry = 19 + (pose.hood - 1) * 8;
  // two lobes make the cobra-like hood shape
  p.ellipse(hx, hy + 5, rx, ry, JACKET, { rim: "E" });
  // flared lower edges where the hood meets the neck
  for (const side of [-1, 1]) p.ellipse(hx + side * rx * 0.5, hy + 5 + ry * 0.45, rx * 0.45, ry * 0.45, JACKET, { rim: "E", rot: side * 0.5 });
  if (!back) {
    // inside of the hood: woven copper braid with a cross-hatch weave
    p.ellipse(hx, hy + 6, rx * 0.78, ry * 0.8, COPPER, { clip: true, rim: "I", bias: 0.12 });
    for (let y = Math.floor(hy - ry); y < hy + ry; y++)
      for (let x = Math.floor(hx - rx * 1.1); x < hx + rx * 1.1; x++) {
        const ch = p.get(x, y);
        if ((ch === "G" || ch === "H" || ch === "F") && (x + y) % 4 === 0) p.set(x, y, "I");
        else if ((ch === "G" || ch === "F") && (x - y + 400) % 4 === 0) p.set(x, y, "H");
      }
  } else {
    // back of the hood: the coax cross-section emblem
    const ey = hy + 4;
    p.ellipse(hx, ey, 9, 8, COPPER, { clip: true, rim: "I" });
    p.ellipse(hx, ey, 6, 5.4, BELLY, { clip: true, rim: "L" });
    p.ellipse(hx, ey, 2.4, 2.2, COPPER, { clip: true, bias: 0.3 });
    // braid weave on the copper ring
    for (let y = ey - 9; y < ey + 9; y++)
      for (let x = hx - 10; x < hx + 10; x++) if ((p.get(x, y) === "G" || p.get(x, y) === "H") && (Math.round(x) + Math.round(y)) % 3 === 0) p.set(x, y, "I");
  }
}

function head(p: Painter, pose: Pose, back: boolean) {
  const hx = 48 + pose.hx;
  const hy = 31 + pose.hy;
  const open = pose.mouth === "open" || pose.mouth === "wide";
  // copper contact pins along the crown
  for (const dx of [-5, 0, 5])
    p.tube(
      [
        [hx + dx * 0.9, hy - 4],
        [hx + dx * 1.4, hy - 14 + Math.abs(dx) * 0.6],
      ],
      [2, 1.1],
      COPPER,
      { rim: "I" },
    );
  // skull + snout (the jaw drops when the mouth opens)
  p.ellipse(hx, hy, 12, 8.5, JACKET, { rim: "E" });
  if (!back) {
    if (open) {
      const wide = pose.mouth === "wide" ? 2 : 0;
      p.ellipse(hx, hy + 8 + wide, 7.5, 4.5 + wide * 0.5, JACKET, { rim: "E" });
      p.ellipse(hx, hy + 6.5 + wide * 0.5, 6, 2.6 + wide * 0.6, "RS", { rim: "S" });
      // copper-pin fangs
      p.stamp(hx - 4, hy + 4, ["G.......G", "H.......H", "........."]);
      p.stamp(hx - 2, hy + 8 + wide, ["..R..", ".R.R."]);
    } else {
      p.ellipse(hx, hy + 5.5, 9, 4.6, JACKET, { rim: "E" });
      p.ellipse(hx, hy + 8.5, 5.5, 1.8, BELLY, { clip: true });
      const line = pose.mouth === "grit" ? ["kkkkkkkkk", ".J.J.J.J."] : ["k.......k", ".kkkkkkk."];
      p.stamp(hx - 4, hy + 6, line);
      p.stamp(hx - 3, hy + 7, ["G.....G"]);
    }
    // nostrils
    p.stamp(hx - 2, hy + 2, ["k...k"]);
    // brow ridges + eyes
    const eye = EYES[pose.eyes];
    p.stamp(hx - 10, hy - 3, eye);
    p.stamp(hx + 4, hy - 3, eye, { flip: true });
    if (pose.eyes === "fierce" || pose.eyes === "open") {
      p.stamp(hx - 10, hy - 4, pose.eyes === "fierce" ? [".EEEE.."] : ["..EEE.."]);
      p.stamp(hx + 4, hy - 4, pose.eyes === "fierce" ? ["..EEEE."] : ["..EEE.."]);
    }
    if (pose.tongue && !open) {
      p.stamp(hx - 1, hy + 9, [".R.", ".R.", "R.R", "S.S"]);
    }
  } else {
    p.ellipse(hx, hy + 5, 8, 4.2, JACKET, { rim: "E" });
    // ridge stripe down the back of the skull
    p.stamp(hx - 1, hy - 5, ["HH", "GH", "HH", ".H"]);
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(hx + 9, hy - 6, ["c.", ".c", "c."]);
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  tail(p, pose, back);
  drawCoil(p, coil(pose, "back"), back);

  if (!back) {
    hood(p, pose, false);
    const n = neck(pose);
    p.tube(n, [8.5, 8, 7, 6], JACKET, { rim: "E" });
    // dielectric belly plates down the front of the neck
    p.tube(n.slice(0, 4), [5, 4.6, 4, 3.4], BELLY, { clip: true, bias: 0.15 });
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = n[i];
      const [bx, by] = n[i + 1];
      for (const t of [0.25, 0.75]) p.stamp(Math.round(ax + (bx - ax) * t) - 2, Math.round(ay + (by - ay) * t), ["LLLLL"]);
    }
    head(p, pose, false);
  } else {
    const n = neck(pose);
    p.tube(n, [8.5, 8, 7, 6], JACKET, { rim: "E" });
    bands(p, n, 2, 8);
    head(p, pose, true);
    hood(p, pose, true);
  }

  drawCoil(p, coil(pose, "front"), true);

  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  return {
    idle: [
      f({}),
      f({ hx: 1, hy: 1, squash: 1, tail: 1, spark: 1 }),
      f({ hx: 1, hy: 1, squash: 1, hood: 1.04, tongue: true, spark: 2 }),
      f({ hx: 0, hy: 0, tail: -1, spark: -1 }),
    ],
    attack: [f({ hx: 3, hy: -3, hood: 1.15, eyes: "fierce", mouth: "open", tail: 2, spark: 2 }), f({ hx: -5, hy: 5, hood: 1.15, eyes: "fierce", mouth: "wide", tail: -1, spark: 1 })],
    hurt: [f({ hx: 4, hy: -1, hood: 0.92, eyes: "shut", mouth: "grit", spark: -1 }), f({ hx: 2, hy: 0, eyes: "shut", mouth: "grit", spark: 0 })],
    faint: [f({ hx: -3, hy: 12, hood: 0.88, squash: 1, eyes: "ko", mouth: "open", spark: -1 }), f({ hx: -8, hy: 24, hood: 0.8, squash: 2, eyes: "ko", mouth: "open", spark: -1, tail: -2 })],
  };
}

export const BRAIDWYRM: CreatureArt = {
  id: "braidwyrm",
  name: "Braidwyrm",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "SPARK COIL",
  blurb: "Guardian of the Physical layer. It hums at the line rate, and its copper bands spit sparks whenever the signal gets noisy.",
};
