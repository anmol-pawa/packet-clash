import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Synackle, the gym 5 boss of Synport: twin harbour otters sitting on one
 * mooring rock, joined by a single shared tail that arches over both heads.
 * The arch is their connection. The teal twin on the left is the *client*
 * and the gold twin on the right is the *server*, and each wears a state lamp
 * on its chest.
 *
 * Its idle loop is TCP's three-way handshake: a segment of light runs along
 * the arch each frame (SYN →, SYN-ACK ←, ACK →) and the lamps step through
 * the RFC 793 states, until on the last frame both read ESTABLISHED and the
 * twins' paws finally clasp. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed.
 */
const PALETTE = {
  o: "#121426",
  // client fur (teal), highlight → shadow
  A: "#9fe6e0",
  B: "#4fb3b4",
  C: "#2c7486",
  D: "#1c3f55",
  // server fur (gold), highlight → shadow
  E: "#ffe39a",
  F: "#e3a948",
  G: "#a8682c",
  H: "#5e3a22",
  // bellies and muzzles, highlight → shadow
  J: "#fff6e4",
  K: "#ecd6b4",
  L: "#b89c80",
  // eyes, nose and mouth
  k: "#0b0c16",
  w: "#ffffff",
  p: "#e0707c",
  // the mooring rock, highlight → shadow
  R: "#9aa3b5",
  S: "#687188",
  T: "#3e4560",
  // state lamps: LISTEN, half-open, ESTABLISHED, off
  b: "#7cc4ff",
  a: "#ffb347",
  e: "#7dff8a",
  f: "#3a3f52",
  // the segment of light on the arch and its trail
  g: "#ffffff",
  y: "#ffe86a",
};

const TEAL = "ABCD";
const GOLD = "EFGH";
const PALE = "JKL";
const ROCK = "RST";

/** A TCP state as RFC 793 names it (only the ones the handshake passes through). */
export type TcpState = "CLOSED" | "LISTEN" | "SYN_SENT" | "SYN_RCVD" | "ESTABLISHED";

export interface Segment {
  from: "client" | "server";
  flags: ("SYN" | "ACK")[];
  seq: number;
  /** Acknowledgment number, present when the ACK flag is set. */
  ack: number | null;
}

/**
 * The three-way handshake for client ISN `x` and server ISN `y` (Kurose & Ross
 * §3.5.6): SYN seq=x; SYN-ACK seq=y ack=x+1; ACK seq=x+1 ack=y+1. A SYN uses
 * up one sequence number, which is why each side acknowledges ISN + 1.
 * Sequence numbers wrap modulo 2^32.
 */
export function handshake(x: number, y: number): Segment[] {
  const inc = (n: number) => (n + 1) % 2 ** 32;
  return [
    { from: "client", flags: ["SYN"], seq: x, ack: null },
    { from: "server", flags: ["SYN", "ACK"], seq: y, ack: inc(x) },
    { from: "client", flags: ["ACK"], seq: inc(x), ack: inc(y) },
  ];
}

/**
 * Both ends' states after each step: before anything is sent, then after the
 * SYN, the SYN-ACK and the ACK have each been sent (and the earlier one
 * received). A passive open puts the server in LISTEN.
 */
export const HANDSHAKE_STATES: { client: TcpState; server: TcpState }[] = [
  { client: "CLOSED", server: "LISTEN" },
  { client: "SYN_SENT", server: "LISTEN" },
  { client: "SYN_SENT", server: "SYN_RCVD" },
  { client: "ESTABLISHED", server: "SYN_RCVD" },
  { client: "ESTABLISHED", server: "ESTABLISHED" },
];

/** Lamp colour for each state: dark, blue listening, amber half-open, green open. */
export const STATE_LAMP: Record<TcpState, string> = {
  CLOSED: "f",
  LISTEN: "b",
  SYN_SENT: "a",
  SYN_RCVD: "a",
  ESTABLISHED: "e",
};

/** Where each twin's chest lamp is centred, in the unflipped (front) drawing. */
export const LAMP_POS = { client: [29, 70], server: [67, 70] } as const;

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  /** Whole-group offset (lean and sink). */
  bx: number;
  by: number;
  /** Head offsets (client, server) for bobbing. */
  hy: [number, number];
  /** Body swell for breathing. */
  breath: number;
  /** Lamp colours (client, server). */
  lamps: [string, string];
  /** Segment on the arch: 0 (client end) … 1 (server end) and its direction, or null. */
  orb: { t: number; dir: 1 | -1 } | null;
  /** 0 paws reaching towards each other, 1 clasped, 2 thrown up (attack). */
  paws: 0 | 1 | 2;
  /** How far the tail arch sags (faint) or kinks (hurt). */
  sag: number;
  /** The arch glows along its whole length (attack). */
  flare: boolean;
  eyes: Eyes;
  mouthOpen: boolean;
}

const REST: Pose = { bx: 0, by: 0, hy: [0, 0], breath: 0, lamps: ["f", "b"], orb: null, paws: 0, sag: 0, flare: false, eyes: "open", mouthOpen: false };

/** The arch's centre line: from the client's rump, up over both heads, down to the server's. */
function archPoints(pose: Pose): [number, number][] {
  const pts: [number, number][] = [[13, 82 + pose.by]];
  // a smooth horseshoe: half an ellipse plus a little, from the client's side over to the server's
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * (1.1 - (i / 20) * 1.2);
    const lift = Math.max(0, Math.sin(a));
    pts.push([48 + 40 * Math.cos(a), 60 - 42 * Math.sin(a) + pose.by + pose.sag * lift]);
  }
  pts.push([83, 82 + pose.by]);
  return pts;
}

/** A point `t` (0…1) of the way along a polyline by arc length. */
function along(pts: [number, number][], t: number): [number, number] {
  const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let d = t * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = Math.min(1, d / seg[i]);
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}

function tail(p: Painter, pose: Pose, X: (x: number) => number) {
  // the tail is rooted behind them, so it only follows a lean part of the way
  const pts = archPoints(pose).map(([x, y]) => [X(x + pose.bx * 0.4), y] as [number, number]);
  // two tubes meeting at the top: the client's half teal, the server's gold
  const mid = Math.floor(pts.length / 2);
  const radii = (n: number, rev: boolean) => {
    const r = Array.from({ length: n }, (_, i) => 4.6 - (i / (n - 1)) * 1.6);
    return rev ? r.reverse() : r;
  };
  const left = pts.slice(0, mid + 1);
  const right = pts.slice(mid);
  p.tube(left, radii(left.length, false), TEAL, { rim: "D" });
  p.tube(right, radii(right.length, true), GOLD, { rim: "H", bias: 0.05 });
  // a knot where the halves meet
  const [kx, ky] = pts[mid];
  p.ellipse(kx, ky, 4, 3.6, PALE, { rim: "L" });
  // fur rings down both halves
  for (const t of [0.12, 0.26, 0.74, 0.88]) {
    const [rx, ry] = along(pts, t);
    p.set(rx, ry, t < 0.5 ? "D" : "H");
    p.set(rx + 1, ry, t < 0.5 ? "C" : "G");
  }
  if (pose.flare) {
    // the whole connection lights up: a bright core line along the arch
    for (let i = 4; i <= 96; i++) {
      const [x, y] = along(pts, i / 100);
      p.set(x, y, i % 4 === 0 ? "g" : "y");
    }
  }
  if (pose.orb) {
    // the segment in flight, with a short trail behind it showing which way it goes
    for (let k = 1; k <= 4; k++) {
      const [tx, ty] = along(pts, pose.orb.t - pose.orb.dir * (0.03 + k * 0.022));
      p.stamp(Math.round(tx) - 1, Math.round(ty) - 1, k < 4 ? [".y.", "yyy", ".y."] : ["y"]);
    }
    const [ox, oy] = along(pts, pose.orb.t);
    p.stamp(Math.round(ox) - 3, Math.round(oy) - 3, ["..yyy..", ".yyyyy.", "yyggyyy", "yygggyy", "yyyggyy", ".yyyyy.", "..yyy.."]);
  }
}

/** One twin: body, belly, arms, head. `side` −1 is the client, +1 the server. */
function twin(p: Painter, pose: Pose, side: -1 | 1, back: boolean, X: (x: number) => number) {
  const ramp = side < 0 ? TEAL : GOLD;
  const dark = side < 0 ? "D" : "H";
  const mid = side < 0 ? "C" : "G";
  const cx = 48 + side * 19 + pose.bx;
  const cy = 67 + pose.by;
  const hy = 42 + pose.by + pose.hy[side < 0 ? 0 : 1];
  // body: a plump pear, with a stubby foot either side
  for (const f of [-1, 1]) p.ellipse(X(cx + f * 9), 83 + pose.by * 0.4, 6, 3.5, ramp, { rim: dark });
  p.ellipse(X(cx), cy, 15 + pose.breath, 17 + pose.breath, ramp, { rim: dark });
  if (!back) p.ellipse(X(cx), cy + 3, 10 + pose.breath, 13 + pose.breath, PALE, { clip: true, bias: 0.1 });
  else for (let r = 0; r < 3; r++) p.stamp(Math.round(X(cx)) - 2 + (r % 2), Math.round(cy - 8 + r * 7), [`${mid}.${mid}`, `.${dark}.`]);

  // head with round ears
  const hx = cx + side * -1;
  // small round ears set low on a broad, flat otter head
  for (const e of [-1, 1]) p.ellipse(X(hx + e * 12), hy - 6, 2.8, 2.6, ramp, { rim: dark });
  // a thick neck so the head runs straight into the body
  p.ellipse(X(hx), hy + 8, 11, 6, ramp, { bias: -0.05 });
  p.ellipse(X(hx), hy, 14.5, 10, ramp, { rim: dark });
  if (back) {
    // back of the head: a darker crown stripe
    p.ellipse(X(hx), hy - 2, 4, 8, ramp.slice(1), { clip: true, bias: -0.2 });
    return;
  }
  // muzzle
  // a wide pale face mask and a fat whiskered muzzle
  p.ellipse(X(hx), hy + 3, 11, 6.5, PALE, { clip: true, bias: 0.15 });
  for (const m of [-1, 1]) p.ellipse(X(hx + m * 3), hy + 4.5, 4.2, 3.2, "JK", { bias: 0.25 });
  const nx = Math.round(X(hx));
  const ny = Math.round(hy + 2);
  p.stamp(nx - 1, ny, ["kkk", ".k."]);
  p.set(nx - 1, ny, "L");
  p.stamp(nx - 2, ny + 3, pose.mouthOpen ? [".kkk.", "kpppk", ".kkk."] : ["k.k.k", ".k.k."]);
  // whiskers
  for (const w of [-1, 1]) {
    const wx = Math.round(X(hx + w * 8));
    const d = w * (X(1) - X(0));
    for (let i = 0; i < 4; i++) {
      p.set(wx + d * i, ny + 3 - (i >> 1), dark);
      p.set(wx + d * i, ny + 5 + (i >> 1), dark);
    }
  }
  for (const e of [-1, 1]) {
    const ex = Math.round(X(hx + e * 5));
    const ey = Math.round(hy - 2);
    if (pose.eyes === "shut") p.stamp(ex - 1, ey, ["k.k", ".k."].reverse());
    else if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
    else {
      p.stamp(ex - 1, ey - 1, ["kkk", "kkk", "kkk"]);
      p.set(ex - 1, ey - 1, "w");
      if (pose.eyes === "fierce") {
        // brows slanting down towards the middle of the face
        for (let i = 0; i <= 4; i++) p.set(X(hx + e * (7 - i)), ey - 4 + Math.floor(i / 2), dark);
      }
    }
  }
}

function arms(p: Pose, pp: Painter, side: -1 | 1, X: (x: number) => number) {
  const ramp = side < 0 ? TEAL : GOLD;
  const dark = side < 0 ? "D" : "H";
  const cx = 48 + side * 19 + p.bx;
  const sh: [number, number] = [cx - side * 9, 60 + p.by];
  // reaching paws stop just short; clasped ones overlap in the middle; attack throws them up
  const hand: [number, number] =
    p.paws === 1 ? [48 + p.bx + side * 1.5, 62 + p.by] : p.paws === 2 ? [cx - side * 13, 46 + p.by] : [48 + p.bx + side * 5, 64 + p.by];
  pp.tube(
    [
      [X(sh[0]), sh[1]],
      [X(hand[0]), hand[1]],
    ],
    [3.6, 3],
    ramp,
    { rim: dark },
  );
  pp.ellipse(X(hand[0]), hand[1], 3.4, 3, ramp, { rim: dark, bias: 0.1 });
  pp.set(X(hand[0]), hand[1] + 1, "K");
}

function rock(p: Painter, X: (x: number) => number) {
  p.ellipse(X(48), 88, 42, 6.5, ROCK, { rim: "T" });
  // weed and a barnacle
  for (const [rx, ry] of [
    [16, 86],
    [72, 90],
    [36, 91],
  ])
    p.stamp(Math.round(X(rx)), ry, ["RT"]);
  p.stamp(Math.round(X(80)) - 1, 85, [".J.", "JLJ"]);
}

function lamp(p: Painter, pose: Pose, who: 0 | 1, X: (x: number) => number) {
  const [lx, ly] = who === 0 ? LAMP_POS.client : LAMP_POS.server;
  const x = Math.round(X(lx + pose.bx));
  const y = Math.round(ly + pose.by);
  const ch = pose.lamps[who];
  p.stamp(x - 2, y - 2, ["TTTTT", "T...T", "T...T", "T...T", "TTTTT"]);
  p.stamp(x - 1, y - 1, [ch.repeat(3), ch.repeat(3), ch.repeat(3)]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  // the back view is seen from behind, so the client sits on the right
  const X = (x: number) => (back ? 96 - x : x);
  tail(p, pose, X);
  rock(p, X);
  twin(p, pose, -1, back, X);
  twin(p, pose, 1, back, X);
  arms(pose, p, -1, X);
  arms(pose, p, 1, X);
  // the chest lamps are worn on a strap, so they show from behind too
  lamp(p, pose, 0, X);
  lamp(p, pose, 1, X);
  p.outline("o");
  return p.sprite(PALETTE);
}

const S = HANDSHAKE_STATES;
const lampsAt = (i: number): [string, string] => [STATE_LAMP[S[i].client], STATE_LAMP[S[i].server]];

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const dark: [string, string] = ["f", "f"];
  return {
    // the three-way handshake: SYN →, SYN-ACK ←, ACK →, then ESTABLISHED and a clasp
    idle: [
      f({ lamps: lampsAt(1), orb: { t: 0.32, dir: 1 }, hy: [-1, 0] }),
      f({ lamps: lampsAt(2), orb: { t: 0.66, dir: -1 }, hy: [0, -1], breath: 1 }),
      f({ lamps: lampsAt(3), orb: { t: 0.4, dir: 1 }, hy: [-1, 0] }),
      f({ lamps: lampsAt(4), paws: 1, hy: [1, 1], breath: 1 }),
    ],
    attack: [
      f({ lamps: lampsAt(4), paws: 2, flare: true, by: -2, eyes: "fierce", mouthOpen: true }),
      f({ lamps: lampsAt(4), paws: 1, flare: true, bx: 5, by: -1, hy: [1, 1], eyes: "fierce", mouthOpen: true }),
    ],
    hurt: [
      f({ lamps: dark, bx: -4, by: -1, hy: [2, 2], sag: 3, eyes: "shut" }),
      f({ lamps: dark, bx: -2, hy: [1, 1], sag: 1, eyes: "shut" }),
    ],
    faint: [
      f({ lamps: dark, by: 3, hy: [3, 3], sag: 6, eyes: "ko", mouthOpen: true }),
      f({ lamps: dark, by: 6, hy: [5, 5], sag: 10, eyes: "ko", mouthOpen: true }),
    ],
  };
}

export const SYNACKLE: CreatureArt = {
  id: "synackle",
  name: "Synackle",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "THREE WAY GRIP",
  blurb: "Warden of Synport. Twin otters sharing one tail: nothing passes between them until SYN, SYN-ACK and ACK have run along it and their paws clasp.",
};
