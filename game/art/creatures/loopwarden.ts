import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";
import { LOOP_LENGTH, ROUNDS, ROUND_BAR, loopVerdict, type LoopVerdict } from "@/game/engine/faangLoop";

/**
 * Loopwarden, the gym 16 boss of Offer Spire: a sphinx-owl with a lion's
 * body, folded indigo wings and a round-eyed owl face. A scorecard plaque on
 * its flank holds one bar per mock-loop round (rapid-fire, debugging, design);
 * a bar turns red under the round bar (ROUND_BAR), and a scale in its talons
 * tips toward HIRE or NO HIRE by the real loop verdict. The idle loop reveals
 * the rounds one by one, then weighs them. Hurt and faint go dark. Original
 * design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter. Drawn
 * facing right; the stage mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#17120f",
  // lion body, highlight → shadow
  L: "#f4dc9c",
  M: "#d7ab5e",
  N: "#9f6f33",
  O: "#5f3f1d",
  // wings (indigo), highlight → shadow
  I: "#9aa6f0",
  J: "#6572c8",
  K: "#40499a",
  H: "#262b62",
  // owl face disk and beak
  U: "#fff4d8",
  V: "#e6cd94",
  W: "#b39458",
  X: "#6a5632",
  // scorecard plaque, bars (pass amber-green / fail red), empty slot
  Q: "#24202c",
  G: "#7dffa8",
  R: "#ff6b6b",
  e: "#4a4458",
  // scale: brass, hire pan (green), no-hire pan (red)
  B: "#ffd86b",
  b: "#b08a2c",
  h: "#59d98a",
  n: "#e0626a",
  // dark parts (hurt, faint)
  f: "#2a2630",
  // eye
  w: "#ffffff",
  k: "#0b0d10",
  g: "#ffb020",
};

const BODY = "LMNO";
const WING = "IJKH";
const FACE = "UVWX";

type Pt = [number, number];

/** Rounds in the mock loop, in order, with the share of the loop each is worth. */
export const ROUND_COUNT = ROUNDS.length;
export const ROUND_WEIGHTS: readonly number[] = ROUNDS.map((r) => r.count / LOOP_LENGTH);

/** Three round scores (percent) for each idle frame's loop: a strong run, a red flag, a weak one, then a strong one again. */
export const LOOPS: readonly (readonly number[])[] = [
  [92, 88, 80],
  [90, 30, 85],
  [50, 40, 45],
  [95, 85, 90],
];

/** The loop verdict for round scores, from the real scoring rules: weighted total, and any round under the bar caps it. */
export function verdictFor(scores: readonly number[]): LoopVerdict {
  const total = scores.reduce((s, x, i) => s + x * ROUND_WEIGHTS[i], 0);
  return loopVerdict(total, scores.filter((x) => x < ROUND_BAR).length);
}

/** Beam tilt in pixels at each end: positive drops the HIRE (left) pan. */
export function scaleTilt(v: LoopVerdict): number {
  return v === "STRONG HIRE" ? 4 : v === "HIRE" ? 2 : v === "LEAN NO HIRE" ? -2 : -4;
}

/** Height in pixels of a round's bar for a score (0..100 → 0..11, at least 1 when scored). */
export const barHeight = (score: number): number => (score <= 0 ? 0 : Math.max(1, Math.round((score / 100) * 11)));

/** A bar is green at or over the round bar, red under it. */
export const barColour = (score: number): "G" | "R" => (score >= ROUND_BAR ? "G" : "R");

export const PLAQUE_X = 16;
export const PLAQUE_Y = 56;
export const BAR_W = 5;

/** The 21×15 scorecard plaque: `shown` bars revealed (0..3), or all dark. */
export function plaqueRows(scores: readonly number[], shown: number, dark = false): string[] {
  const W = 21;
  const H = 15;
  const grid: string[][] = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? (dark ? "f" : "b") : dark ? "f" : "Q")));
  for (let i = 0; i < ROUND_COUNT; i++) {
    const x0 = 2 + i * 6;
    for (let y = 2; y < H - 2; y++) for (let x = x0; x < x0 + BAR_W; x++) grid[y][x] = dark ? "f" : "e";
    if (dark || i >= shown) continue;
    const hgt = barHeight(scores[i]);
    for (let y = H - 3; y > H - 3 - hgt; y--) for (let x = x0; x < x0 + BAR_W; x++) grid[y][x] = barColour(scores[i]);
  }
  return grid.map((r) => r.join(""));
}

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Head lift (negative = up). */
  hy: number;
  /** Index into LOOPS, or -1 = dark. */
  loop: number;
  /** Bars revealed on the plaque. */
  shown: number;
  /** Show the weighed verdict on the scale (else the beam sits level). */
  weigh: boolean;
  /** Everything blazes (attack). */
  surge: boolean;
  wing: number;
  eyes: Eyes;
  crouch: number;
}

const REST: Pose = { bx: 0, by: 0, hy: 0, loop: 0, shown: 3, weigh: true, surge: false, wing: 0, eyes: "open", crouch: 0 };

const r = Math.round;

function setLine(p: Painter, a: Pt, b: Pt, ch: string) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  for (let i = 0; i <= n; i++) p.set(r(a[0] + ((b[0] - a[0]) * i) / n), r(a[1] + ((b[1] - a[1]) * i) / n), ch);
}

function wings(p: Painter, pose: Pose) {
  const { bx, by, wing } = pose;
  // folded wing sweeping up and back over the haunch
  p.tube([[40 + bx, 56 + by], [30 + bx, 40 + by - wing], [18 + bx, 30 + by - wing * 2]], [7, 6, 2.5], WING, { rim: "H" });
  p.tube([[46 + bx, 56 + by], [40 + bx, 36 + by - wing], [32 + bx, 24 + by - wing * 2]], [6, 5, 2], WING, { rim: "H" });
}

function body(p: Painter, pose: Pose) {
  const { bx, by, crouch } = pose;
  // tail curling up behind
  p.tube([[18 + bx, 74 + by], [11 + bx, 70 + by], [9 + bx, 60 + by], [13 + bx, 54 + by]], [5, 4, 3, 2.5], BODY, { rim: "O" });
  // haunch and chest: a crouching sphinx
  p.ellipse(34 + bx, 71 + by + crouch * 0.4, 22, 13, BODY, { rim: "O" });
  p.ellipse(56 + bx, 66 + by + crouch * 0.4, 12, 14, BODY, { rim: "O", bias: 0.1 });
  // front legs stretched forward, talons ahead
  p.tube([[56 + bx, 76 + by], [68 + bx, 80 + by + crouch * 0.3], [76 + bx, 80 + by + crouch * 0.3]], [5, 4, 3.5], BODY, { rim: "O" });
  p.tube([[50 + bx, 78 + by], [62 + bx, 84 + by + crouch * 0.3], [70 + bx, 84 + by + crouch * 0.3]], [4.5, 3.5, 3.2], "MNO", { rim: "o" });
  // hind foot
  p.ellipse(22 + bx, 84 + by * 0.5, 7, 3.5, "MNO", { rim: "o" });
}

function head(p: Painter, pose: Pose) {
  const { bx, by, hy } = pose;
  const hx = 62 + bx;
  const hyy = 38 + by + hy;
  p.tube([[56 + bx, 60 + by], [hx, hyy + 8]], [9, 8], BODY, { rim: "O" });
  // owl head with ear tufts
  p.tube([[hx - 8, hyy - 5], [hx - 11, hyy - 15]], [3, 1.5], WING, { rim: "H" });
  p.tube([[hx + 6, hyy - 7], [hx + 9, hyy - 16]], [3, 1.5], WING, { rim: "H" });
  p.ellipse(hx, hyy, 15, 13, "MNO", { rim: "o" });
  // facial disk
  p.ellipse(hx + 4, hyy + 1, 12, 11, FACE, { rim: "X", bias: 0.2 });
  // hooked beak
  p.polygon([[hx + 12, hyy + 2], [hx + 19, hyy + 8], [hx + 13, hyy + 10]], "B");
  p.set(hx + 18, hyy + 8, "b");
}

function face(p: Painter, pose: Pose, back: boolean) {
  const { bx, by, hy } = pose;
  if (back) return;
  const hx = r(62 + bx);
  const hyy = r(38 + by + hy);
  const ex = hx + 5;
  const ey = hyy - 2;
  if (pose.eyes === "shut") p.stamp(ex - 2, ey + 2, ["kkkkk"]);
  else if (pose.eyes === "ko") p.stamp(ex - 2, ey - 1, ["k...k", ".k.k.", "..k..", ".k.k.", "k...k"]);
  else {
    p.stamp(ex - 4, ey - 4, ["...wwwww...", "..wggggggw..", ".wggggkkggw.", "wgggggkkgggw", "wgggggkkgggw", ".wggggkkggw.", "..wggggggw..", "...wwwww..."]);
    if (pose.eyes === "fierce") p.stamp(ex - 5, ey - 6, ["kkkkkkkkkkkkk"]);
  }
}

const PAN_W = 9;

/** A balance held in the talons: beam on a post, a pan each end. HIRE pan left (green), NO HIRE pan right (red). */
function scale(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const dark = pose.loop < 0 && !pose.surge;
  const tilt = pose.surge ? 0 : pose.weigh && pose.loop >= 0 ? scaleTilt(verdictFor(LOOPS[pose.loop])) : 0;
  const cx = 72 + bx;
  const cy = 60 + by;
  const brass = dark ? "f" : "B";
  const brassDk = dark ? "f" : "b";
  // post down to the talons
  setLine(p, [cx, cy], [cx, 78 + by], brassDk);
  const left: Pt = [cx - 10, cy + tilt * 0.5];
  const right: Pt = [cx + 10, cy - tilt * 0.5];
  setLine(p, left, right, brass);
  p.stamp(cx - 1, cy - 2, ["BBB", "BBB"].map((s) => (dark ? s.replace(/B/g, "f") : s)));
  for (const [end, ch] of [[left, "h"], [right, "n"]] as const) {
    const [ex, ey] = [r(end[0]), r(end[1])];
    // hanging strings and a flat pan
    setLine(p, [ex, ey], [ex - 4, ey + 8], brassDk);
    setLine(p, [ex, ey], [ex + 4, ey + 8], brassDk);
    const pan = dark ? "f" : pose.surge ? "B" : ch;
    p.stamp(ex - 4, ey + 8, [pan.repeat(PAN_W), `.${brassDk.repeat(PAN_W - 2)}.`]);
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  wings(p, pose);
  body(p, pose);
  head(p, pose);
  face(p, pose, back);
  const dark = pose.loop < 0 && !pose.surge;
  const scores = pose.surge ? [100, 100, 100] : pose.loop >= 0 ? LOOPS[pose.loop] : [0, 0, 0];
  p.stamp(r(PLAQUE_X + pose.bx), r(PLAQUE_Y + pose.by + pose.crouch * 0.4), plaqueRows(scores, pose.surge ? 3 : pose.shown, dark));
  scale(p, pose);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const bob = [
    { hy: 0, wing: 0 },
    { hy: -1, wing: 1 },
    { hy: 0, wing: 1 },
    { hy: 1, wing: 0 },
  ];
  return {
    // each frame reveals the three rounds of a different loop, then the scale weighs it
    idle: [0, 1, 2, 3].map((loop, i) => f({ ...bob[i], loop, shown: 3, weigh: true })),
    attack: [
      f({ bx: -3, hy: -4, eyes: "fierce", surge: true, wing: 3 }),
      f({ bx: 6, hy: 3, eyes: "fierce", surge: true, wing: 0 }),
    ],
    hurt: [
      f({ bx: -3, hy: 3, eyes: "shut", loop: -1 }),
      f({ bx: -1, hy: 2, eyes: "shut", loop: -1 }),
    ],
    faint: [
      f({ by: 3, hy: 8, eyes: "ko", loop: -1, crouch: 3 }),
      f({ by: 6, hy: 14, eyes: "ko", loop: -1, crouch: 6 }),
    ],
  };
}

export const LOOPWARDEN: CreatureArt = {
  id: "loopwarden",
  name: "Loopwarden",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "HIRE LOOP",
  blurb:
    "Keeper of Offer Spire. A bar on its flank scores each round of the mock loop; any round under the bar caps the verdict at lean no hire, and the scale in its talons tips by the weighted total.",
};
