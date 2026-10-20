import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Oakwind, Ackorn's evolved form (Transport): a grown squirrel that
 * wears its old acorn's cap as a helmet, with oak leaves sprouting from it and
 * a mantle of autumn leaves round its shoulders. Its great curled tail
 * carries eight segment lamps, root to tip. Original design.
 *
 * Idle: TCP slow start. Each idle frame is one round trip, and the congestion
 * window doubles every RTT (1, 2, 4, then 8 segments lit gold, in flight).
 * Attack: the whole window is in flight. Hurt: a triple duplicate ACK; one
 * segment is lost (red) and the window has halved (multiplicative decrease).
 * Faint: dark.
 *
 * Drawn facing right: the stage mirrors foes so they face the player.
 */
const PALETTE = {
  o: "#121a1e",
  // fur ramp, highlight → shadow (deeper forest green than Ackorn)
  A: "#d9f7b0",
  B: "#86c46a",
  C: "#4a9150",
  D: "#2c6340",
  E: "#183a2e",
  // cream belly, cheek tufts and tail fluff
  F: "#fffbea",
  G: "#ecd9a6",
  H: "#b89a62",
  // autumn oak leaves
  I: "#ffc94a",
  J: "#e2742a",
  K: "#9a3a1e",
  // acorn-cap helmet
  L: "#b08f5c",
  M: "#5a412a",
  // eyes and nose
  k: "#120c1a",
  w: "#ffffff",
  i: "#d6502a",
  p: "#ff9db0",
  // segment lamps: unsent, in flight (glint, lit, shade), lost
  x: "#4c5e58",
  m: "#fffbe0",
  y: "#ffd84a",
  Y: "#e08a1c",
  r: "#ff3b4a",
};

const FUR = "ABCDE";
const FUR_DARK = "BCDE";
const CREAM = "FGH";
const LEAF = "IJK";
const CAP = "LM";

/** Segments on the tail, root to tip (sequence order). */
export const SEGMENTS = 8;
/** Congestion window (segments in flight) on each idle frame: slow start doubles it every RTT. */
export const CWND_IDLE = [1, 2, 4, 8];
/** When hurt: segment 4 is lost and the window has halved from 8 to 4. */
export const HURT_LOST = 4;

type Eyes = "open" | "fierce" | "shut" | "ko";
type Lamps = { kind: "cwnd"; cwnd: number } | { kind: "lost"; cwnd: number; lost: number } | { kind: "off" };

interface Pose {
  /** Whole-body offset (bob, sink). */
  dy: number;
  /** Head offset relative to the body. */
  hx: number;
  hy: number;
  /** Leaf and ear droop (0–1). */
  droop: number;
  /** Tail sway: + flicks the tip forward. */
  tail: number;
  /** Body lean forward in px (attack lunge). */
  lean: number;
  /** Arm raise (0–1) for the clawed forearm. */
  spread: number;
  eyes: Eyes;
  open: boolean;
  lamps: Lamps;
}

const REST: Pose = { dy: 0, hx: 0, hy: 0, droop: 0, tail: 0, lean: 0, spread: 0, eyes: "open", open: false, lamps: { kind: "cwnd", cwnd: 1 } };

/** The tail's centre line, root → tip, for a pose. */
function tailPath(pose: Pose): [number, number][] {
  const s = pose.tail;
  const y = pose.dy;
  return [
    [33, 55 + y],
    [21, 53 + y],
    [13 + s * 0.2, 45 + y],
    [11 + s * 0.4, 33 + y],
    [13 + s * 0.6, 21 + y - s * 0.2],
    [18 + s * 0.8, 11 + y - s * 0.4],
    [26 + s, 7 + y - s * 0.4],
    [29 + s * 1.2, 13 + y - s * 0.3],
  ];
}
const TAIL_R = [5, 7.5, 8.5, 8.5, 7.5, 6, 4.5, 3];

/** Where each segment lamp sits along the tail path (span, fraction), root to tip. */
const LAMP_T: [number, number][] = [
  [1, 0.15],
  [1, 0.85],
  [2, 0.6],
  [3, 0.2],
  [3, 0.8],
  [4, 0.4],
  [5, 0.05],
  [5, 0.7],
];

/** Top-left of each segment's 3×3 lamp, per pose (points on the tail's outer edge). */
export function lampPositions(pose: Partial<Pose> = {}): [number, number][] {
  const path = tailPath({ ...REST, ...pose });
  return LAMP_T.map(([i, t]) => {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const x = ax + (bx - ax) * t;
    const yy = ay + (by - ay) * t;
    const nx = by - ay;
    const ny = -(bx - ax);
    const n = Math.hypot(nx, ny) || 1;
    return [Math.round(x + (nx / n) * 3.5 - 1.5), Math.round(yy + (ny / n) * 3.5 - 1.5)];
  });
}

/** State of segment `s`'s lamp. */
export function segmentState(lamps: Lamps, s: number): "unsent" | "flight" | "lost" {
  if (lamps.kind === "off") return "unsent";
  if (lamps.kind === "lost" && s === lamps.lost) return "lost";
  return s < lamps.cwnd ? "flight" : "unsent";
}

const LAMP_ROWS = {
  unsent: ["MxM", "xxx", "MxM"],
  flight: ["YyY", "ymy", "YyY"],
  lost: ["MrM", "rrr", "MrM"],
};

function tail(p: Painter, pose: Pose) {
  const path = tailPath(pose);
  p.tube(path, TAIL_R, FUR, { rim: "E", bias: 0.18 });
  // fluffy tufts along the outer edge
  for (const i of [2, 3, 4, 5])
    for (const t of [0.25, 0.75]) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const r = TAIL_R[i] + (TAIL_R[i + 1] - TAIL_R[i]) * t;
      const nx = by - ay;
      const ny = -(bx - ax);
      const n = Math.hypot(nx, ny) || 1;
      p.ellipse(ax + (bx - ax) * t + (nx / n) * (r - 2.5), ay + (by - ay) * t + (ny / n) * (r - 2.5), 2.6, 2.6, FUR, { bias: 0.15 });
    }
  // fur strokes on the inner side
  for (let i = 1; i < path.length - 2; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const nx = by - ay;
    const ny = -(bx - ax);
    const n = Math.hypot(nx, ny) || 1;
    const mx = (ax + bx) / 2 - (nx / n) * TAIL_R[i] * 0.45;
    const my = (ay + by) / 2 - (ny / n) * TAIL_R[i] * 0.45;
    p.tube(
      [
        [mx - (bx - ax) * 0.2, my - (by - ay) * 0.2],
        [mx + (bx - ax) * 0.2, my + (by - ay) * 0.2],
      ],
      [0.6, 0.6],
      "D",
      { clip: true },
    );
  }
  // a pale curled tip
  const [tx, ty] = path[path.length - 1];
  p.ellipse(tx - 1, ty - 1, 3.5, 3, "AB", { clip: true });
  // sockets for the segment lamps
  for (const [lx, ly] of lampPositions(pose)) p.stamp(lx - 1, ly - 1, [".EEE.", "E...E", "E...E", "E...E", ".EEE."]);
}

function lamps(p: Painter, pose: Pose) {
  lampPositions(pose).forEach(([lx, ly], s) => p.stamp(lx, ly, LAMP_ROWS[segmentState(pose.lamps, s)]));
}

/** A lobed oak leaf from (x, y) along angle `a` (radians), with a midrib. */
function leaf(p: Painter, x: number, y: number, a: number, droop: number) {
  const ang = a + droop * 1.2;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const at = (t: number): [number, number] => [x + dx * t, y + dy * t];
  p.tube([at(0), at(3), at(6), at(9)], [1.2, 2.6, 2.2, 1], LEAF, { rim: "K" });
  // lobes either side
  for (const t of [3, 6]) {
    const [cx, cy] = at(t);
    p.ellipse(cx - dy * 2.2, cy + dx * 2.2, 1.6, 1.6, LEAF);
    p.ellipse(cx + dy * 2.2, cy - dx * 2.2, 1.6, 1.6, LEAF);
  }
  for (let t = 2; t < 7; t++) {
    const [cx, cy] = at(t);
    p.set(cx, cy, "K");
  }
}

function body(p: Painter, pose: Pose, back: boolean) {
  const y = pose.dy;
  const l = pose.lean;
  const wx = 49 + l + pose.spread * 2;
  const wy = 42 + y - pose.spread * 8;
  // haunch and feet
  p.ellipse(30 + l * 0.3, 51 + y, 10, 8, FUR, { rim: "E" });
  p.ellipse(37 + l * 0.5, 59 + y * 0.5, 6.5, 2.8, FUR_DARK, { rim: "E" });
  p.stamp(Math.round(42 + l * 0.5), Math.round(59 + y * 0.5), ["kk"]);
  // upright torso and cream belly
  p.ellipse(36 + l * 0.6, 41 + y, 9.5, 12.5, FUR, { rim: "E" });
  if (!back) p.ellipse(39.5 + l * 0.7, 43 + y, 5.5, 9.5, CREAM, { clip: true, bias: 0.15 });
  else p.ellipse(33 + l * 0.6, 38 + y, 4, 7, FUR_DARK, { clip: true, bias: -0.3 });
  // a mantle of autumn oak leaves round the shoulders
  const sx = 37 + l * 0.6;
  const sy = 31 + y;
  const leaves: [number, number, number][] = back
    ? [
        [-6, 0, 2.3],
        [-2, 1, 1.9],
        [3, 1, 1.4],
      ]
    : [
        [-6, 0, 2.3],
        [1, 2, 1.6],
        [6, 0, 0.7],
      ];
  for (const [dx, dy, a] of leaves) leaf(p, sx + dx, sy + dy, a, pose.droop * 0.5);
  // forearm with claws, raised to strike
  p.tube(
    [
      [40 + l * 0.7, 37 + y],
      [wx, wy],
    ],
    [2.8, 2.2],
    FUR_DARK,
    { rim: "E" },
  );
  if (!back) p.stamp(Math.round(wx + 1), Math.round(wy - 1), ["k.", ".k", "k."]);
}

function head(p: Painter, pose: Pose, back: boolean) {
  const hx = 42 + pose.hx + pose.lean;
  const hy = 22 + pose.hy + pose.dy;
  const droop = pose.droop;
  // an oak leaf sprouting behind the helmet
  leaf(p, hx - 5, hy - 8, -2.4, -droop);
  p.ellipse(hx, hy, 11, 9.5, FUR, { rim: "E" });
  // acorn-cap helmet: crosshatched scales, a dark brim and a stalk
  p.ellipse(hx - 2, hy - 6, 9, 5, CAP, { rim: "M" });
  for (let yy = -11; yy <= -3; yy++)
    for (let xx = -11; xx <= 7; xx++) {
      const X = Math.round(hx - 2 + xx);
      const Y = Math.round(hy + yy);
      if (p.get(X, Y) === "L" && ((xx + yy) % 4 === 0 || (xx - yy) % 4 === 0)) p.set(X, Y, "M");
    }
  p.tube(
    [
      [hx - 10, hy - 3],
      [hx + 6, hy - 3],
    ],
    [1, 1],
    "M",
  );
  p.stamp(Math.round(hx - 3), Math.round(hy - 13), [".M", "MM", "M."]);
  leaf(p, hx - 1, hy - 11, -1.1, droop);
  // ears poking out past the brim
  p.tube(
    [
      [hx + 5, hy - 3],
      [hx + 10 - droop * 3, hy - 10 + droop * 7],
    ],
    [2.8, 1.2],
    FUR,
    { rim: "E" },
  );
  if (!back)
    p.tube(
      [
        [hx + 6, hy - 4],
        [hx + 9.5 - droop * 3, hy - 8.5 + droop * 7],
      ],
      [1.1, 0.5],
      "p",
      { clip: true },
    );

  if (back) {
    // from behind: a darker nape and a cheek tuft peeking out
    p.ellipse(hx - 2, hy + 3, 5, 3.5, FUR_DARK, { clip: true, bias: -0.2 });
    p.stamp(Math.round(hx + 9), Math.round(hy + 2), ["G.", "GG"]);
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(Math.round(hx + 9), Math.round(hy - 3), ["w.", ".w"]);
    return;
  }
  // muzzle and cheek tuft
  p.ellipse(hx + 6, hy + 3, 5.5, 4, CREAM, { rim: "H", bias: 0.1 });
  p.stamp(Math.round(hx - 7), Math.round(hy + 3), ["G..", "GG.", ".GG"]);
  p.stamp(Math.round(hx + 10), Math.round(hy + 1), ["kk", "kk"]);
  if (pose.open) p.stamp(Math.round(hx + 6), Math.round(hy + 5), ["kkkk", "kppk", ".kk."]);
  else p.stamp(Math.round(hx + 7), Math.round(hy + 5), ["k.k", ".k."]);
  if (!pose.open) p.stamp(Math.round(hx + 8), Math.round(hy + 6), ["w"]);
  // a fiercer, browed eye than Ackorn's
  const EYE: Record<Eyes, string[]> = {
    open: ["kkkk.", "kwwik", "kwiik", "kiiik", ".kkk."],
    fierce: ["kkkkk", ".kwik", "kwiik", "kiiik", ".kkk."],
    shut: [".....", ".....", "kkkkk", ".kkk.", "....."],
    ko: ["k...k", ".k.k.", "..k..", ".k.k.", "k...k"],
  };
  p.stamp(Math.round(hx + 1), Math.round(hy - 3), EYE[pose.eyes]);
  p.stamp(Math.round(hx - 1), Math.round(hy + 4), ["pp", "pp"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(64, 64);
  if (back) {
    // from behind the tail is nearer than the body
    body(p, pose, true);
    head(p, pose, true);
    tail(p, pose);
  } else {
    tail(p, pose);
    body(p, pose, false);
    head(p, pose, false);
  }
  lamps(p, pose);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const c = (cwnd: number): Lamps => ({ kind: "cwnd", cwnd });
  const lost: Lamps = { kind: "lost", cwnd: SEGMENTS / 2, lost: HURT_LOST };
  return {
    idle: [f({ lamps: c(CWND_IDLE[0]) }), f({ dy: 1, tail: 1, lamps: c(CWND_IDLE[1]) }), f({ dy: 1, hy: 1, tail: 2, lamps: c(CWND_IDLE[2]) }), f({ tail: 1, spread: 0.3, lamps: c(CWND_IDLE[3]) })],
    attack: [
      f({ lean: -2, hy: 1, tail: -2, spread: 0.6, eyes: "fierce", lamps: c(SEGMENTS) }),
      f({ lean: 3, hx: 1, tail: 3, spread: 1, eyes: "fierce", open: true, lamps: c(SEGMENTS) }),
    ],
    hurt: [f({ hx: -3, hy: -1, droop: 0.3, tail: -1, eyes: "shut", lamps: lost }), f({ hx: -1, droop: 0.15, eyes: "shut", lamps: lost })],
    faint: [f({ dy: 2, hy: 2, droop: 0.6, eyes: "ko", tail: -1, lamps: { kind: "off" } }), f({ dy: 3, hy: 3, droop: 1, eyes: "ko", tail: -2, lamps: { kind: "off" } })],
  };
}

export const OAKWIND: CreatureArt = {
  id: "oakwind",
  name: "Oakwind",
  size: 64,
  front: anims(false),
  back: anims(true),
  idleFps: 4,
  blurb: "Leaps from oak to oak, doubling its stride every round trip until a duplicate ACK warns of a loss. Then it halves its pace and creeps forward one segment at a time.",
};

export type CwndEvent = "3dup" | "timeout";

/**
 * TCP congestion window per transmission round (in MSS), as in Kurose & Ross
 * §3.7. Slow start doubles cwnd each RTT until it reaches ssthresh (a doubling
 * that would overshoot is capped at ssthresh); congestion avoidance then adds
 * 1 MSS per RTT. `events[r]` is a loss detected at the end of round r (1-based):
 * a timeout sets ssthresh = ⌊cwnd/2⌋ and cwnd = 1 (both variants); a triple
 * duplicate ACK does the same in Tahoe, while Reno's fast recovery sets
 * cwnd = ssthresh + 3 and continues in congestion avoidance.
 */
export function cwndTrace(rounds: number, opts: { ssthresh: number; variant: "tahoe" | "reno"; events?: Record<number, CwndEvent> }) {
  if (!Number.isInteger(rounds) || rounds < 1) throw new RangeError("rounds must be a positive integer");
  if (opts.ssthresh < 1) throw new RangeError("ssthresh must be at least 1");
  let cwnd = 1;
  let ssthresh = opts.ssthresh;
  const out: { round: number; cwnd: number; ssthresh: number; phase: "slow start" | "congestion avoidance" }[] = [];
  for (let r = 1; r <= rounds; r++) {
    const phase = cwnd < ssthresh ? "slow start" : "congestion avoidance";
    out.push({ round: r, cwnd, ssthresh, phase });
    const ev = opts.events?.[r];
    if (ev) {
      ssthresh = Math.max(Math.floor(cwnd / 2), 2);
      cwnd = ev === "3dup" && opts.variant === "reno" ? ssthresh + 3 : 1;
    } else cwnd = phase === "slow start" ? Math.min(cwnd * 2, ssthresh) : cwnd + 1;
  }
  return out;
}
