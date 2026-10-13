import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Gigaroc, the gym 9 boss of Backbone Summit: a vast crimson storm roc perched
 * on the snowy crag at the top of the network. A fibre-optic cable runs along
 * the leading edge of its raised near wing, from shoulder to wingtip, and the
 * tips of its tail feathers glow like fibre ends.
 *
 * Its idle loop is one pulse of light crossing the backbone link: each frame
 * the pulse is a little further from the shoulder (the sender) towards the
 * wingtip (the receiver), which is propagation delay you can watch. On the
 * attack the whole cable is lit at once, a link full of bits: the
 * bandwidth-delay product. The delay helpers below solve the Kurose & Ross
 * chapter 1 problems the gauntlet asks. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed. Drawn facing right; the stage
 * mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#140d16",
  // crimson plumage, highlight → shadow
  A: "#ff9478",
  B: "#d94a40",
  C: "#9c2a36",
  D: "#561428",
  // cream chest and face, highlight → shadow
  U: "#fff4da",
  V: "#ecca90",
  W: "#b48a56",
  // gold beak, talons and crest, highlight → shadow
  G: "#ffe58a",
  H: "#e3a432",
  J: "#8f561c",
  // summit rock, highlight → shadow
  R: "#bdb7cc",
  S: "#7f7a94",
  T: "#4a4562",
  // snow
  K: "#d6e8f5",
  // eyes and mouth
  k: "#0b0d10",
  w: "#ffffff",
  e: "#ffcf3f",
  r: "#c8444f",
  // fibre: dark cable, cyan light, the pulse's hot core
  f: "#1c2434",
  c: "#6ff4ff",
  y: "#f4fff6",
};

const PLUME = "ABCD";
const CREAM = "UVW";
const GOLD = "GHJ";
const STONE = "RST";

/** Transmission delay: the time to push L bits onto a link of R bit/s (L/R). */
export const transmissionDelay = (bits: number, rate: number) => bits / rate;

/** Propagation delay: the time for one bit to cross d metres at s m/s (d/s). */
export const propagationDelay = (metres: number, speed: number) => metres / speed;

/** Bits "in flight" on a link: R × d_prop. */
export const bandwidthDelayProduct = (rate: number, metres: number, speed: number) => rate * propagationDelay(metres, speed);

/** How long one bit is on the wire, in metres: link length / (R × d_prop) = s / R. */
export const bitWidth = (rate: number, speed: number) => speed / rate;

export interface StoreAndForward {
  /** Size of the whole message in bits. */
  messageBits: number;
  /** Packet size in bits (the message size when it isn't segmented). */
  packetBits: number;
  /** Rate of every link in bit/s. */
  rate: number;
  /** Links between source and destination (routers + 1). */
  links: number;
}

/**
 * End-to-end time to move a message across `links` store-and-forward links of
 * the same rate, ignoring propagation, queuing and processing (Kurose & Ross
 * §1.3.1 and problem P31): the first packet takes `links` transmission times
 * and every later one arrives one transmission time after it.
 */
export function storeAndForward(q: StoreAndForward): number {
  const packets = Math.ceil(q.messageBits / q.packetBits);
  return (packets + q.links - 1) * transmissionDelay(q.packetBits, q.rate);
}

export interface NodalDelay {
  bits: number;
  rate: number;
  metres: number;
  speed: number;
  /** Seconds spent queued and processing at the node. */
  queuing?: number;
  processing?: number;
}

/** d_nodal = d_proc + d_queue + d_trans + d_prop (Kurose & Ross §1.4.1). */
export const nodalDelay = (q: NodalDelay) =>
  (q.processing ?? 0) + (q.queuing ?? 0) + transmissionDelay(q.bits, q.rate) + propagationDelay(q.metres, q.speed);

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Head offset. */
  hx: number;
  hy: number;
  /** Wing raise: negative lifts the wings higher. */
  wy: number;
  /** Wing sweep: positive spreads them further back. */
  spread: number;
  breath: number;
  /** Indices of the cable positions where light is passing. */
  pulse: number[];
  /** Tail-feather fibre ends glowing. */
  glow: boolean;
  eyes: Eyes;
  beakOpen: boolean;
  /** Legs folding for the faint. */
  crouch: number;
}

const REST: Pose = {
  bx: 0,
  by: 0,
  hx: 0,
  hy: 0,
  wy: 0,
  spread: 0,
  breath: 0,
  pulse: [],
  glow: true,
  eyes: "open",
  beakOpen: false,
  crouch: 0,
};

const r = Math.round;
type Pt = [number, number];

/** The near wing's arm, shoulder → wrist → wingtip, which carries the cable. */
function arm(pose: Pose): [Pt, Pt, Pt] {
  const { bx, by, wy, spread: sp } = pose;
  return [
    [47 + bx, 47 + by],
    [33 + bx - sp * 0.5, 28 + by + wy],
    [23 + bx - sp, 18 + by + wy * 1.4 - sp * 0.3],
  ];
}

/** Where along the cable (0 = shoulder, 1 = wingtip) each pulse position sits. */
const PULSE_T = [0.14, 0.38, 0.62, 0.86];

function along(pts: Pt[], t: number): Pt {
  const segs = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
  let d = t * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = Math.min(1, d / segs[i]);
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

const pulseAt = (pose: Pose, i: number): Pt => {
  const [x, y] = along(arm(pose), PULSE_T[i]);
  return [r(x), r(y)];
};

/** Pulse centres on the cable at rest, shoulder (sender) → wingtip (receiver). */
export const PULSE_POS: readonly (readonly [number, number])[] = PULSE_T.map((_, i) => pulseAt(REST, i));

function summit(p: Painter) {
  // the crag at the top of the backbone, capped with snow
  p.polygon(
    [
      [16, 94],
      [26, 84],
      [34, 81],
      [42, 79],
      [62, 79],
      [72, 82],
      [80, 86],
      [86, 94],
    ],
    "S",
  );
  p.ellipse(50, 92, 38, 14, STONE, { clip: true, bias: 0.25 });
  // cracks
  for (const [x, y, s] of [
    [30, 88, ["T.", "TT", ".T"]],
    [66, 86, [".T", "T.", "T."]],
    [52, 90, ["TT."]],
  ] as const)
    p.stamp(x, y, [...s]);
  // snow along the top edge, thicker on the ridge
  for (let x = 24; x <= 80; x++) {
    let top = 0;
    while (top < 96 && !p.get(x, top)) top++;
    const depth = x > 36 && x < 68 ? 3 : 2;
    for (let d = 0; d < depth; d++) p.set(x, top + d, d === 0 ? "w" : "K");
    if (x % 7 === 3) p.set(x, top + depth, "K");
  }
}

function feather(p: Painter, base: Pt, dir: Pt, len: number, width: number, ramp: string) {
  const end: Pt = [base[0] + dir[0] * len, base[1] + dir[1] * len];
  p.tube([base, end], [width, width * 0.55], ramp, { rim: ramp[ramp.length - 1] });
}

function wing(p: Painter, pose: Pose, far: boolean) {
  const [s0, w0, t0] = arm(pose);
  // the far wing is the same shape, further right and a little higher
  const off: Pt = far ? [9, -2] : [0, 0];
  const pts = [s0, w0, t0].map(([x, y]) => [x + off[0], y + off[1]] as Pt);
  const ramp = far ? "BCD" : "ABCD";
  const fr = far ? "CD" : "BCD";
  // flight feathers hanging from the arm, longest at the hand
  const n = 9;
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const b = along(pts, 0.12 + t * 0.88);
    const ang = Math.PI * (0.6 + t * 0.15);
    const dir: Pt = [Math.cos(ang), Math.sin(ang)];
    const len = 13 + t * 9 + (far ? -3 : 0);
    feather(p, b, dir, len, 3.1 - t * 0.6, fr);
    // pale banded tips on the flight feathers
    const tip: Pt = [b[0] + dir[0] * (len - 2), b[1] + dir[1] * (len - 2)];
    if (!far) p.ellipse(tip[0], tip[1], 1.6, 1.6, "VW", { clip: true });
  }
  // covert feathers along the arm, then the arm itself
  for (let i = 0; i <= 6; i++) {
    const b = along(pts, 0.06 + (i / 6) * 0.78);
    feather(p, b, [-0.45, 0.9], 6 - i * 0.4, 3.2, ramp);
  }
  // a gold bar across the coverts
  if (!far)
    for (let i = 1; i <= 5; i++) {
      const [x, y] = along(pts, 0.08 + (i / 6) * 0.72);
      p.ellipse(x - 2.6, y + 5, 1.5, 1.5, "GH", { clip: true });
    }
  p.tube(pts, [4.4, 3.2, 1.6], ramp, { rim: "D" });
  if (far) return;
  // the fibre along the leading edge, with light where the pulse is
  p.tube(pts, [1.3, 1.1, 0.8], "f", { clip: true });
  for (const i of pose.pulse) {
    const [x, y] = pulseAt(pose, i);
    p.stamp(x - 3, y - 3, ["...c...", "..ccc..", ".ccwcc.", "ccwywcc", ".ccwcc.", "..ccc..", "...c..."]);
  }
}

function tail(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const root: Pt = [42 + bx, 70 + by];
  const ends: Pt[] = [
    [18, 82],
    [22, 87],
    [28, 90],
  ];
  ends.forEach(([x, y], i) => {
    p.tube([root, [x + bx * 0.5, y + by * 0.3]], [4.2, 2.4], i === 1 ? "BCD" : "CD", { rim: "D" });
  });
  // fibre-optic ends on each tail feather
  for (const [x, y] of ends) {
    const ex = r(x + bx * 0.5) - 1;
    const ey = r(y + by * 0.3) - 1;
    p.stamp(ex, ey, pose.glow ? ["cy", "cc"] : ["ff", "ff"]);
  }
}

function legs(p: Painter, pose: Pose, near: boolean) {
  const { bx, by, crouch } = pose;
  const x = near ? 55 : 47;
  const top: Pt = [x + bx, 72 + by];
  const foot: Pt = [x + bx * 0.3 + (near ? 1 : -1), 80];
  // feathered trousers
  p.ellipse(top[0], top[1] + crouch * 0.3, 5.5, 5 - crouch * 0.4, near ? PLUME : "BCD", { rim: "D" });
  p.tube([[top[0], top[1] + 3], foot], [2.2, 1.8], GOLD, { rim: "J" });
  // talons gripping the crag
  const fx = r(foot[0]);
  p.stamp(fx - 3, 79, [".HGH..", "HHHHHH", "k.k.k."]);
}

function body(p: Pose, pp: Painter, back: boolean) {
  const { bx, by, breath } = p;
  pp.ellipse(52 + bx, 58 + by, 12 + breath, 17 + breath * 0.5, PLUME, { rim: "D", rot: -0.35 });
  if (!back) {
    // cream chest with crimson chevrons
    pp.ellipse(58 + bx, 58 + by, 7 + breath, 13, CREAM, { clip: true, rot: -0.35, bias: 0.1 });
    for (const [x, y] of [
      [57, 54],
      [55, 60],
      [53, 66],
      [60, 59],
      [58, 65],
    ])
      pp.stamp(x + bx, y + by, ["C.C", ".C."]);
  } else {
    // a darker mantle down the back
    pp.ellipse(48 + bx, 54 + by, 7, 12, "CD", { clip: true, rot: -0.35 });
  }
}

function head(p: Painter, pose: Pose, back: boolean) {
  const { bx, by } = pose;
  const hx = 64 + bx + pose.hx;
  const hy = 30 + by + pose.hy;
  // neck
  p.tube(
    [
      [57 + bx, 47 + by],
      [hx - 1, hy + 4],
    ],
    [6.5, 5.5],
    PLUME,
    { rim: "D" },
  );
  // golden crest swept back
  for (const [dx, dy, len] of [
    [-6, -5, 9],
    [-7, -1, 10],
    [-6, 3, 8],
  ])
    p.tube(
      [
        [hx - 2, hy + dy * 0.4],
        [hx + dx - len * 0.7, hy + dy - len * 0.25],
      ],
      [2.6, 0.9],
      GOLD,
      { rim: "J" },
    );
  p.ellipse(hx, hy, 8.5, 8, PLUME, { rim: "D" });
  // hooked beak
  p.tube(
    [
      [hx + 5, hy - 1],
      [hx + 11, hy + 1],
      [hx + 13, hy + 5],
      [hx + 11, hy + 7],
    ],
    [3.2, 2.6, 1.6, 0.8],
    GOLD,
    { rim: "J", bias: 0.1 },
  );
  if (pose.beakOpen) {
    p.tube(
      [
        [hx + 5, hy + 5],
        [hx + 10, hy + 9],
      ],
      [1.8, 1],
      GOLD,
      { rim: "J" },
    );
    p.stamp(r(hx) + 6, r(hy) + 4, ["kkk", "krr", ".kr"]);
  } else for (let x = 5; x <= 9; x++) p.set(hx + x, hy + 4, "J");
  if (back) {
    // from behind: the back of the head hides the face, leaving the beak's hook
    p.ellipse(hx + 1, hy, 9, 8.5, PLUME, { bias: -0.2 });
    p.ellipse(hx - 1, hy - 1, 5, 6.5, "CD", { clip: true });
    return;
  }
  // pale face and cheek
  p.ellipse(hx + 2, hy + 4, 3.6, 3, CREAM, { clip: true, bias: 0.15 });
  // nostril
  p.set(r(hx) + 8, r(hy), "J");
  const ex = r(hx + 2);
  const ey = r(hy - 1);
  if (pose.eyes === "shut") p.stamp(ex - 1, ey, ["kkk"]);
  else if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
  else p.stamp(ex - 1, ey - 1, ["kkk", "kek", "kkk"]);
  // a heavy raptor brow
  p.stamp(ex - 3, ey - 3, pose.eyes === "fierce" ? ["DD...", ".DDDD", "...DD"] : ["DDDDD", "...DD"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  summit(p);
  wing(p, pose, true);
  tail(p, pose);
  legs(p, pose, false);
  body(pose, p, back);
  legs(p, pose, true);
  head(p, pose, back);
  wing(p, pose, false);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const bob = [
    { hy: 0, breath: 0 },
    { hy: -1, breath: 1 },
    { hy: 0, hx: 1, breath: 1 },
    { hy: 1, breath: 0 },
  ];
  return {
    // one pulse of light crossing the link, sender (shoulder) → receiver (wingtip)
    idle: PULSE_T.map((_, i) => f({ ...bob[i], pulse: [i] })),
    attack: [
      f({ by: -2, hy: -2, wy: -1, spread: 1, eyes: "fierce", beakOpen: true, pulse: [0, 1, 2, 3] }),
      f({ bx: 4, by: 1, hx: 4, hy: 2, wy: 1, spread: -1, eyes: "fierce", beakOpen: true, pulse: [0, 1, 2, 3] }),
    ],
    hurt: [
      f({ bx: -3, hx: -3, hy: 2, wy: 3, eyes: "shut", glow: false }),
      f({ bx: -1, hx: -1, hy: 1, wy: 1, eyes: "shut", glow: false }),
    ],
    faint: [
      f({ by: 2, hx: 1, hy: 6, wy: 6, spread: -1, eyes: "ko", beakOpen: true, glow: false, crouch: 2 }),
      f({ by: 4, hx: 2, hy: 11, wy: 11, spread: -2, eyes: "ko", beakOpen: true, glow: false, crouch: 4 }),
    ],
  };
}

export const GIGAROC: CreatureArt = {
  id: "gigaroc",
  name: "Gigaroc",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "BACKBONE SURGE",
  blurb:
    "Keeper of Backbone Summit. Light races along the fibre in its wing, and it asks every challenger the same thing: how many bits fit in the sky between here and the next peak?",
};
