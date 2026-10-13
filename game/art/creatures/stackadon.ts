import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Stackadon, the gym 1 boss of Layer Landing: a stout, armoured
 * plate-backed beast that carries the protocol stack on its back. Four stone
 * slabs, widest at the bottom, are the TCP/IP layers (link, network,
 * transport, application), each with a glowing seam in its own colour. In its
 * idle loop a packet of light climbs the stack one layer per frame, the way
 * data is encapsulated on its way down and decapsulated on its way up. Its
 * tail ends in a square "bit" club. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed.
 */
const PALETTE = {
  o: "#101422",
  // hide, highlight → shadow
  A: "#9fe3d0",
  B: "#58b59f",
  C: "#317d72",
  D: "#1d4c4a",
  // stone slabs
  F: "#e8e2d2",
  G: "#b5ab98",
  H: "#7d7466",
  I: "#4b4440",
  // belly, horn and claws
  J: "#fff7dc",
  K: "#f0d49a",
  L: "#c09456",
  // seam glow per layer: bright, dim
  a: "#ffe066", // link
  b: "#a57b1d",
  c: "#8dff7a", // network
  d: "#3b8f3a",
  e: "#7ae8ff", // transport
  f: "#2a7f9c",
  g: "#ff8ae0", // application
  h: "#9c3c88",
  // eyes and mouth
  k: "#0b0c16",
  w: "#ffffff",
  Y: "#ff9f1c",
  R: "#ff5a6e",
  S: "#932340",
};

const HIDE = "ABCD";
const STONE = "FGHI";
const BELLY = "JKL";
/** Each layer's seam: [bright, dim], link at the bottom → application on top. */
const GLOW = [
  ["a", "b"],
  ["c", "d"],
  ["e", "f"],
  ["g", "h"],
] as const;

type Eyes = "open" | "fierce" | "shut" | "ko";
type Mouth = "shut" | "open" | "grit";

interface Pose {
  /** Head offset from rest. */
  hx: number;
  hy: number;
  /** Body (and everything on it) offset. */
  by: number;
  /** Breathing: the body swells by this many px. */
  breath: number;
  /** Per-layer x/y offsets of the slabs, bottom → top (sway, knock, topple). */
  sx: [number, number, number, number];
  sy: [number, number, number, number];
  /** The layer whose seam is lit (−1: all dim, 4: all lit). */
  lit: number;
  /** Tail club lift in px. */
  tail: number;
  eyes: Eyes;
  mouth: Mouth;
}

const REST: Pose = { hx: 0, hy: 0, by: 0, breath: 0, sx: [0, 0, 0, 0], sy: [0, 0, 0, 0], lit: 0, tail: 0, eyes: "open", mouth: "shut" };

const EYES: Record<Eyes, string[]> = {
  open: [".kkk.", "kwwYk", "kwkYk", ".kkk."],
  fierce: ["kk...", "kkkkk", "kwkYk", ".kkk."],
  shut: [".....", "k...k", ".kkk.", "....."],
  ko: ["k..k", ".kk.", ".kk.", "k..k"],
};

/** One slab of the stack: a flat stone tier with a glowing seam and ports. */
function slab(p: Painter, i: number, cx: number, cy: number, lit: boolean, back: boolean) {
  const rx = 22 - i * 4;
  const ry = 5.5 - i * 0.4;
  // the slab is a squat rounded box: a fat horizontal tube
  p.tube(
    [
      [cx - rx + ry, cy],
      [cx + rx - ry, cy],
    ],
    [ry, ry],
    STONE,
    { rim: "I" },
  );
  // a flat top face so it reads as a block, not a sausage
  p.ellipse(cx - 1, cy - ry * 0.55, rx - ry * 0.6, ry * 0.42, "F", { clip: true });
  const [hi, lo] = GLOW[i];
  const ch = lit ? hi : lo;
  // the seam band round the slab's waist
  const y = Math.round(cy + ry * 0.35);
  for (let x = Math.floor(cx - rx + 2); x <= cx + rx - 2; x++) {
    if (p.get(x, y)) p.set(x, y, ch);
    if (lit && p.get(x, y + 1)) p.set(x, y + 1, lo);
  }
  // ports / vents along the seam (front) or rivets (back)
  for (let k = -1; k <= 1; k++) {
    const px = Math.round(cx + k * (rx * 0.5));
    if (back) p.stamp(px - 1, y - 2, ["I.I"]);
    else p.stamp(px - 1, y - 2, lit ? ["I" + hi + "I"] : ["III"]);
  }
  // a lit layer throws a little glow above its seam
  if (lit) {
    p.set(Math.round(cx - rx * 0.75), y - 1, hi);
    p.set(Math.round(cx + rx * 0.75), y - 1, hi);
  }
}

function stack(p: Painter, pose: Pose, back: boolean) {
  const m = back ? -1 : 1;
  for (let i = 0; i < 4; i++) {
    const cx = 54 * (back ? 0 : 1) + (back ? 42 : 0) + m * pose.sx[i];
    const cy = 47 - i * 9 + pose.by + pose.sy[i] - pose.breath * 0.5;
    slab(p, i, cx, cy, pose.lit === i || pose.lit === 4, back);
  }
  // a crystal on the top slab: the application layer's antenna
  const tx = (back ? 42 : 54) + m * pose.sx[3];
  const ty = 47 - 27 + pose.by + pose.sy[3] - pose.breath * 0.5;
  const top = pose.lit === 3 || pose.lit === 4 ? "g" : "h";
  p.polygon(
    [
      [tx - 3, ty - 4],
      [tx, ty - 11],
      [tx + 3, ty - 4],
      [tx, ty - 2],
    ],
    top,
  );
  p.stamp(Math.round(tx - 1), Math.round(ty - 9), ["w", "w"]);
}

function legs(p: Painter, pose: Pose, which: "far" | "near", back: boolean) {
  const X = (x: number) => (back ? 96 - x : x);
  const y0 = 72 + pose.by;
  const set: [number, number][] = which === "far" ? [[30, 0], [72, 1]] : [[38, 0], [66, 1]];
  for (const [x, k] of set) {
    const r = which === "far" ? 7 : 8.5;
    p.tube(
      [
        [X(x), y0],
        [X(x + (k ? 1.5 : -1.5)), 84],
      ],
      [r, r + 0.5],
      HIDE,
      { rim: "D", bias: which === "far" ? -0.25 : 0 },
    );
    // toe claws
    if (which === "near" || !back) p.stamp(Math.round(X(x)) - 3, 90, ["J.J.J.J".slice(0, which === "near" ? 7 : 5)]);
  }
}

function tail(p: Painter, pose: Pose, back: boolean) {
  const X = (x: number) => (back ? 96 - x : x);
  const pts: [number, number][] = [
    [X(72), 66 + pose.by],
    [X(82), 66 + pose.by],
    [X(88), 60 + pose.by - pose.tail],
  ];
  p.tube(pts, [7, 5, 4], HIDE, { rim: "D" });
  // the bit club: a little cube with a "1" etched on it
  const [cx, cy] = pts[2];
  const x0 = Math.round(cx - 5);
  const y0 = Math.round(cy - 8);
  p.polygon(
    [
      [x0, y0],
      [x0 + 10, y0],
      [x0 + 10, y0 + 9],
      [x0, y0 + 9],
    ],
    "G",
  );
  p.stamp(x0, y0, ["FFFFFFFFFF", "F.........", "F.........", "F...HI....", "F....I....", "F....I....", "F...III...", "F........H", "HHHHHHHHHH"]);
}

function body(p: Painter, pose: Pose, back: boolean) {
  const cx = back ? 46 : 50;
  const cy = 66 + pose.by;
  p.ellipse(cx, cy, 31 + pose.breath, 16 + pose.breath, HIDE, { rim: "D" });
  if (!back) {
    // pale belly armour with plate lines
    p.ellipse(cx - 1, cy + 9, 17, 6.5, BELLY, { clip: true, bias: 0.1 });
    for (const dx of [-9, -1, 7]) p.stamp(cx + dx, Math.round(cy + 6), ["L", "L", "L"]);
  }
  // dorsal scutes along the flank
  for (let k = 0; k < 5; k++) {
    const sx = cx - 22 + k * 11;
    const sy = cy - 6 + Math.abs(k - 2) * 2;
    p.ellipse(sx, sy, 3.2, 2.2, "BC", { clip: true });
  }
}

function head(p: Painter, pose: Pose, back: boolean) {
  if (back) {
    // seen from behind: the back of the skull and the horn, turned towards the foe
    const hx = 76 + pose.hx;
    const hy = 50 + pose.hy + pose.by;
    p.tube(
      [
        [hx + 2, hy - 7],
        [hx + 7, hy - 16],
      ],
      [3, 1.2],
      BELLY,
      { rim: "L" },
    );
    p.ellipse(hx, hy, 11, 9, HIDE, { rim: "D" });
    p.ellipse(hx - 4, hy - 9, 3, 4, HIDE, { rim: "D", rot: -0.4 });
    // frill ridge
    p.stamp(Math.round(hx - 7), Math.round(hy - 4), ["BB......", ".CB.....", "..CB...."]);
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(Math.round(hx + 9), Math.round(hy - 8), ["w.", ".w", "w."]);
    return;
  }
  const hx = 22 + pose.hx;
  const hy = 56 + pose.hy + pose.by;
  const open = pose.mouth === "open";
  // horn on the snout
  p.tube(
    [
      [hx - 8, hy - 4],
      [hx - 11, hy - 15],
    ],
    [3.4, 1.2],
    BELLY,
    { rim: "L" },
  );
  // ear frill
  p.ellipse(hx + 8, hy - 8, 3.5, 5, HIDE, { rim: "D", rot: 0.4 });
  // skull and snout
  p.ellipse(hx, hy, 13, 10.5, HIDE, { rim: "D" });
  if (open) {
    p.ellipse(hx - 4, hy + 9, 9, 4.5, HIDE, { rim: "D" });
    p.ellipse(hx - 4, hy + 6, 8, 3, "RS", { rim: "S" });
    p.stamp(Math.round(hx - 11), Math.round(hy + 3), ["J.J.....J.J", "..........."]);
    p.stamp(Math.round(hx - 7), Math.round(hy + 8), [".J...J."]);
  } else {
    p.ellipse(hx - 4, hy + 5.5, 9.5, 4.5, HIDE, { rim: "D" });
    p.ellipse(hx - 4, hy + 8, 6.5, 1.8, BELLY, { clip: true });
    const line = pose.mouth === "grit" ? ["kkkkkkkkkk", ".J.J.J.J.."] : ["kkkkkkkkk.", "........kk"];
    p.stamp(Math.round(hx - 12), Math.round(hy + 5), line);
  }
  // nostrils
  p.stamp(Math.round(hx - 11), Math.round(hy + 1), ["k.k"]);
  // brow plate and eyes
  const eye = EYES[pose.eyes];
  p.stamp(Math.round(hx - 6), Math.round(hy - 4), eye);
  p.stamp(Math.round(hx + 3), Math.round(hy - 4), eye);
  if (pose.eyes === "fierce") p.stamp(Math.round(hx - 7), Math.round(hy - 5), ["DD.......DD"]);
  else if (pose.eyes === "open") p.stamp(Math.round(hx - 6), Math.round(hy - 5), [".DDD.....DDD"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  if (back) {
    legs(p, pose, "far", true);
    head(p, pose, true);
    body(p, pose, true);
    stack(p, pose, true);
    legs(p, pose, "near", true);
    tail(p, pose, true);
  } else {
    tail(p, pose, false);
    legs(p, pose, "far", false);
    body(p, pose, false);
    stack(p, pose, false);
    legs(p, pose, "near", false);
    head(p, pose, false);
  }
  p.outline("o");
  // drawn facing left; foes face right in their art because the stage mirrors
  // them (facing −1), so in battle it turns towards the player with the light
  // still from the upper left
  if (!back) p.mirror();
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  return {
    // a packet of light climbs the stack: link → network → transport → application
    idle: [f({ lit: 0 }), f({ lit: 1, breath: 1, hy: 1 }), f({ lit: 2, breath: 1, hy: 1, sx: [0, 0, 1, 1] }), f({ lit: 3, tail: 1, sx: [0, 0, 0, 1] })],
    attack: [
      f({ lit: 4, hx: 3, hy: -3, eyes: "fierce", mouth: "open", sx: [1, 2, 3, 4], tail: 3 }),
      f({ lit: 4, hx: -6, hy: 3, eyes: "fierce", mouth: "open", sx: [-1, -2, -4, -6], sy: [0, 0, 1, 1], tail: -1 }),
    ],
    hurt: [
      f({ lit: -1, hx: 3, hy: -1, eyes: "shut", mouth: "grit", sx: [2, -2, 3, -3] }),
      f({ lit: -1, hx: 1, eyes: "shut", mouth: "grit", sx: [1, -1, 1, -1] }),
    ],
    faint: [
      f({ lit: -1, hx: -2, hy: 8, by: 2, eyes: "ko", mouth: "open", sx: [2, 4, 7, 10], sy: [0, 1, 3, 5] }),
      f({ lit: -1, hx: -4, hy: 12, by: 4, eyes: "ko", mouth: "open", sx: [3, 8, 14, 20], sy: [1, 4, 9, 16], tail: -3 }),
    ],
  };
}

export const STACKADON: CreatureArt = {
  id: "stackadon",
  name: "Stackadon",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "LAYER SLAM",
  blurb: "Keeper of the layers. It carries the whole protocol stack on its back, and a packet of light climbs its slabs with every breath.",
};
