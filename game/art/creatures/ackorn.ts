import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Ackorn, a Transport-type starter: a moss-green squirrel kit whose huge
 * curled tail carries six acorn-cap lamps, one per segment of a byte stream,
 * from the tail's root to its tip. It hugs a spare acorn (the next payload)
 * to its chest. Original design.
 *
 * Idle: a sliding window. Three lamps are lit gold (sent, in flight); the ones
 * behind the window are cyan (acknowledged) and the ones ahead are dark (not
 * sent yet). Every idle frame an ACK arrives and the window slides one
 * segment toward the tip. Attack: the whole stream is in flight. Hurt: a
 * segment in the window is lost (red) and the window stalls. Faint: dark.
 *
 * Drawn facing right: the stage mirrors foes so they face the player.
 */
const PALETTE = {
  o: "#14201a",
  // fur ramp, highlight → shadow
  A: "#e9ffc8",
  B: "#a8e07a",
  C: "#5fae52",
  D: "#357a3e",
  E: "#1f4a32",
  // cream belly and tail fluff
  F: "#fffbea",
  G: "#efe0b4",
  H: "#c4aa76",
  // acorn: nut and cap
  I: "#f1b467",
  J: "#c07438",
  K: "#7c4322",
  L: "#a9895a",
  M: "#5e4630",
  // eyes and nose
  k: "#120c1a",
  w: "#ffffff",
  i: "#8a4fd6",
  // segment lamps: unsent, in flight (glint, lit, shade), acked (lit, shade)
  x: "#4c5e58",
  m: "#fffbe0",
  y: "#ffd84a",
  Y: "#e08a1c",
  a: "#9ff4ff",
  c: "#2aa7c9",
  r: "#ff3b4a",
  p: "#ff9db0",
};

const FUR = "ABCDE";
const FUR_DARK = "BCDE";
const CREAM = "FGH";
const NUT = "IJK";
const CAP = "LM";

/** Segments on the tail, root to tip (sequence order). */
export const SEGMENTS = 6;
/** The send window, in segments. */
export const WINDOW = 3;
/** The window's base (first unacknowledged segment) on each idle frame: one ACK per frame. */
export const IDLE_BASE = [0, 1, 2, 3];

type Eyes = "open" | "fierce" | "shut" | "ko";
type Lamps = { kind: "window"; base: number } | { kind: "all" } | { kind: "lost"; base: number; lost: number } | { kind: "off" };

interface Pose {
  /** Whole-body offset (bob, sink). */
  dy: number;
  /** Head offset relative to the body. */
  hx: number;
  hy: number;
  /** Ear droop (0–1). */
  droop: number;
  /** Tail sway: + flicks the tip forward. */
  tail: number;
  /** Body lean forward in px (attack lunge). */
  lean: number;
  eyes: Eyes;
  open: boolean;
  lamps: Lamps;
}

const REST: Pose = { dy: 0, hx: 0, hy: 0, droop: 0, tail: 0, lean: 0, eyes: "open", open: false, lamps: { kind: "window", base: 0 } };

/** The tail's centre line, root → tip, for a pose. */
function tailPath(pose: Pose): [number, number][] {
  const s = pose.tail;
  const y = pose.dy;
  return [
    [35, 53 + y],
    [22, 51 + y],
    [15 + s * 0.2, 42 + y],
    [13 + s * 0.4, 28 + y],
    [17 + s * 0.7, 16 + y - s * 0.2],
    [26 + s, 10 + y - s * 0.4],
    [33 + s * 1.2, 14 + y - s * 0.4],
  ];
}
const TAIL_R = [5, 8, 9.5, 10, 8.5, 5.5, 3];

/** Where each segment lamp sits along the tail path (fraction of each span), root to tip. */
const LAMP_T: [number, number][] = [
  [1, 0.1],
  [1, 0.85],
  [2, 0.6],
  [3, 0.3],
  [3, 0.95],
  [4, 0.75],
];

/** Top-left of each segment's 3×3 lamp, per pose (rounded points on the tail's outer edge). */
export function lampPositions(pose: Partial<Pose> = {}): [number, number][] {
  const path = tailPath({ ...REST, ...pose });
  return LAMP_T.map(([i, t]) => {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    // nudge outward (to the upper left) from the centre line, onto the fluff
    const x = ax + (bx - ax) * t;
    const yy = ay + (by - ay) * t;
    const nx = by - ay;
    const ny = -(bx - ax);
    const n = Math.hypot(nx, ny) || 1;
    return [Math.round(x + (nx / n) * 3 - 1.5), Math.round(yy + (ny / n) * 3 - 1.5)];
  });
}

/** State of segment `s`'s lamp. */
export function segmentState(lamps: Lamps, s: number): "unsent" | "flight" | "acked" | "lost" {
  if (lamps.kind === "off") return "unsent";
  if (lamps.kind === "all") return "flight";
  if (s < lamps.base) return "acked";
  if (s >= lamps.base + WINDOW) return "unsent";
  if (lamps.kind === "lost" && s === lamps.lost) return "lost";
  return "flight";
}

const LAMP_ROWS = {
  unsent: ["MxM", "xxx", "MxM"],
  flight: ["YyY", "ymy", "YyY"],
  acked: ["cac", "aac", "cac"],
  lost: ["MrM", "rrr", "MrM"],
};

function tail(p: Painter, pose: Pose) {
  const path = tailPath(pose);
  p.tube(path, TAIL_R, FUR, { rim: "E" });
  // fluffy tufts along the outer edge
  for (const i of [2, 3, 4])
    for (const t of [0.2, 0.7]) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const r = TAIL_R[i] + (TAIL_R[i + 1] - TAIL_R[i]) * t;
      const nx = by - ay;
      const ny = -(bx - ax);
      const n = Math.hypot(nx, ny) || 1;
      p.ellipse(ax + (bx - ax) * t + (nx / n) * (r - 2.5), ay + (by - ay) * t + (ny / n) * (r - 2.5), 2.4, 2.4, FUR, { bias: 0.15 });
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
        [mx - (bx - ax) * 0.18, my - (by - ay) * 0.18],
        [mx + (bx - ax) * 0.18, my + (by - ay) * 0.18],
      ],
      [0.6, 0.6],
      "D",
      { clip: true },
    );
  }
  // a curled, lighter tip with a flick of fur
  const [tx, ty] = path[path.length - 1];
  p.ellipse(tx - 1, ty - 1, 3.5, 3, "AB", { clip: true });
  p.stamp(Math.round(tx + 1), Math.round(ty + 2), ["B.", "CB", ".C"]);
  // sockets for the segment lamps
  for (const [lx, ly] of lampPositions(pose)) p.stamp(lx - 1, ly - 1, [".EEE.", "E...E", "E...E", "E...E", ".EEE."]);
}

function lamps(p: Painter, pose: Pose) {
  lampPositions(pose).forEach(([lx, ly], s) => p.stamp(lx, ly, LAMP_ROWS[segmentState(pose.lamps, s)]));
}

function body(p: Painter, pose: Pose, back: boolean) {
  const y = pose.dy;
  const l = pose.lean;
  // haunch and feet
  p.ellipse(30 + l * 0.3, 50 + y, 10, 8, FUR, { rim: "E" });
  p.ellipse(36 + l * 0.5, 58 + y * 0.5, 6, 3, FUR_DARK, { rim: "E" });
  // upright torso and cream belly
  p.ellipse(36 + l * 0.6, 42 + y, 9, 12, FUR, { rim: "E" });
  if (!back) p.ellipse(39 + l * 0.7, 44 + y, 5.5, 9, CREAM, { clip: true, bias: 0.15 });
}

function acorn(p: Painter, pose: Pose) {
  const ax = 42 + pose.lean;
  const ay = 41 + pose.dy;
  p.ellipse(ax, ay + 2, 4, 4.5, NUT, { rim: "K" });
  p.ellipse(ax, ay - 1.5, 4.6, 2.4, CAP, { rim: "M" });
  p.stamp(Math.round(ax), Math.round(ay - 5), ["M", "M"]);
  // paws wrapped round it
  p.ellipse(ax - 3, ay + 3, 2.6, 2.2, FUR_DARK, { rim: "E" });
  p.ellipse(ax + 3, ay + 4, 2.4, 2.2, FUR_DARK, { rim: "E" });
}

function head(p: Painter, pose: Pose, back: boolean) {
  const hx = 41 + pose.hx + pose.lean;
  const hy = 24 + pose.hy + pose.dy;
  // ears with tufts, back ear first
  const droop = pose.droop;
  const ear = (bx: number, tipX: number, ramp: string) =>
    p.tube(
      [
        [bx, hy - 5],
        [tipX - droop * 6, hy - 13 + droop * 7],
      ],
      [3.4, 1.4],
      ramp,
      { rim: "E" },
    );
  ear(hx - 4, hx - 7, FUR_DARK);
  p.ellipse(hx, hy, 11, 9.5, FUR, { rim: "E" });
  ear(hx + 2, hx + 2, FUR);
  if (!back) {
    // inner ear
    p.tube(
      [
        [hx + 2, hy - 6],
        [hx + 2 - droop * 6, hy - 11 + droop * 7],
      ],
      [1.4, 0.6],
      "p",
      { clip: true },
    );
  }
  // tuft on the ear tip
  p.stamp(Math.round(hx + 1 - droop * 6), Math.round(hy - 16 + droop * 7), [".B", "BC"]);

  if (back) {
    // from behind: a cream nape and the cheek fluff peeking out
    p.ellipse(hx - 2, hy + 3, 5, 3.5, FUR_DARK, { clip: true, bias: -0.2 });
    p.stamp(Math.round(hx + 8), Math.round(hy + 2), ["G.", "GG"]);
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(Math.round(hx + 9), Math.round(hy - 4), ["w.", ".w"]);
    return;
  }
  // muzzle and puffy cheek
  p.ellipse(hx + 6, hy + 3, 5.5, 4, CREAM, { rim: "H", bias: 0.1 });
  p.stamp(Math.round(hx + 10), Math.round(hy + 1), ["kk", "kk"]);
  if (pose.open) p.stamp(Math.round(hx + 6), Math.round(hy + 5), ["kkkk", "kppk", ".kk."]);
  else p.stamp(Math.round(hx + 7), Math.round(hy + 5), ["k.k", ".k."]);
  // buck teeth
  if (!pose.open) p.stamp(Math.round(hx + 8), Math.round(hy + 6), ["w"]);
  const EYE: Record<Eyes, string[]> = {
    open: [".kkk.", "kwwik", "kwiik", "kiiik", ".kkk."],
    fierce: ["kkkk.", "kkwik", "kwiik", "kiiik", ".kkk."],
    shut: [".....", ".....", "kkkkk", ".kkk.", "....."],
    ko: ["k...k", ".k.k.", "..k..", ".k.k.", "k...k"],
  };
  p.stamp(Math.round(hx + 1), Math.round(hy - 4), EYE[pose.eyes]);
  p.stamp(Math.round(hx - 1), Math.round(hy + 3), ["pp", "pp"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(64, 64);
  if (back) {
    // from behind the tail is nearer than the body
    body(p, pose, back);
    head(p, pose, true);
    tail(p, pose);
  } else {
    tail(p, pose);
    body(p, pose, back);
    head(p, pose, false);
    acorn(p, pose);
  }
  lamps(p, pose);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const w = (base: number): Lamps => ({ kind: "window", base });
  return {
    idle: [f({ lamps: w(0) }), f({ dy: 1, tail: 1, lamps: w(1) }), f({ dy: 1, hy: 1, tail: 2, lamps: w(2) }), f({ tail: 1, lamps: w(3) })],
    attack: [f({ lean: -2, hy: 1, tail: -2, eyes: "fierce", lamps: { kind: "all" } }), f({ lean: 3, hx: 1, tail: 3, eyes: "fierce", open: true, lamps: { kind: "all" } })],
    hurt: [f({ hx: -3, hy: -1, droop: 0.3, tail: -1, eyes: "shut", lamps: { kind: "lost", base: 1, lost: 2 } }), f({ hx: -1, droop: 0.15, eyes: "shut", lamps: { kind: "lost", base: 1, lost: 2 } })],
    faint: [f({ dy: 2, hy: 2, droop: 0.6, eyes: "ko", tail: -1, lamps: { kind: "off" } }), f({ dy: 4, hy: 3, droop: 1, eyes: "ko", tail: -2, lamps: { kind: "off" } })],
  };
}

export const ACKORN: CreatureArt = {
  id: "ackorn",
  name: "Ackorn",
  size: 64,
  front: anims(false),
  back: anims(true),
  idleFps: 4,
  blurb: "Never lets go of an acorn until it hears the ACK. Its tail lamps slide forward one segment at a time, and a lost one makes it freeze until the timer runs out.",
};

/**
 * The largest window for `seqBits`-bit sequence numbers: Go-Back-N can have
 * 2^k − 1 unacknowledged segments, Selective Repeat at most 2^(k−1), or the
 * receiver can't tell a retransmission from a new segment.
 */
export function maxWindow(seqBits: number, protocol: "GBN" | "SR"): number {
  if (!Number.isInteger(seqBits) || seqBits < 1 || seqBits > 32) throw new RangeError("seqBits must be 1–32");
  return protocol === "GBN" ? 2 ** seqBits - 1 : 2 ** (seqBits - 1);
}

/**
 * Throughput cap of a window-limited sender: at most one window per round
 * trip. `windowBytes` per `rttSeconds`, in bits per second, and the
 * utilisation of a link of `linkBps`.
 */
export function windowThroughput(windowBytes: number, rttSeconds: number, linkBps?: number) {
  if (windowBytes <= 0 || rttSeconds <= 0) throw new RangeError("window and RTT must be positive");
  const bps = (windowBytes * 8) / rttSeconds;
  return { bps, utilisation: linkBps ? Math.min(1, bps / linkBps) : undefined };
}
