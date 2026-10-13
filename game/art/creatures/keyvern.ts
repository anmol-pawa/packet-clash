import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Keyvern, the gym 7 boss of Cipher Keep: a slate-scaled wyvern perched on
 * the keep's battlement, its tail ending in a brass key bit and a padlock
 * hanging from a chain collar on its chest. A gem sits in each wing wrist:
 * the near wing's cyan gem is the *client's* key share and the far wing's
 * amber gem the *server's*.
 *
 * Its idle loop is the TLS 1.3 full handshake (RFC 8446 §2): the client sends
 * its key share in the ClientHello, the server answers with its own in the
 * ServerHello (from then on both sides can derive the shared secret, so the
 * keyhole glows and the rest of the handshake is encrypted), the client sends
 * its Finished, and on the last frame the shackle snaps shut for encrypted
 * application data. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed. Drawn facing right; the stage
 * mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#10111f",
  // slate scales, highlight → shadow
  A: "#bccbe6",
  B: "#7f90bb",
  C: "#525e8c",
  D: "#2d3459",
  // belly plates and the brass lock, highlight → shadow
  J: "#fff0c4",
  K: "#e0bd78",
  L: "#a07e46",
  // wing membrane, highlight → shadow
  W: "#a493e6",
  X: "#6c5bb4",
  Y: "#3e3279",
  // the keep's stone, highlight → shadow
  R: "#bdb4a2",
  S: "#877d6c",
  T: "#554c41",
  // horns, talons and the shackle
  h: "#f4eedd",
  i: "#aaa089",
  // eyes and mouth
  k: "#0c0b14",
  w: "#ffffff",
  e: "#ffcf3f",
  r: "#c8444f",
  // key-share gems (client lit, server lit, dark), the key bit and the keyhole glow
  c: "#7ff0ff",
  s: "#ffa64a",
  f: "#24203a",
  g: "#ffd257",
  y: "#fff4a8",
};

const SCALE = "ABCD";
const PALE = "JKL";
const MEMBRANE = "WXY";
const STONE = "RST";
const HORN = "hi";

/** Who sends a flight of the handshake. */
export type TlsSide = "client" | "server";

export interface TlsFlight {
  from: TlsSide;
  /** RFC 8446 notation: {braces} are encrypted with handshake keys, [brackets] with application keys. */
  messages: string[];
}

/** The TLS 1.3 full (1-RTT) handshake, as RFC 8446 §2 Figure 1 draws it. */
export const TLS13_HANDSHAKE: TlsFlight[] = [
  { from: "client", messages: ["ClientHello + key_share"] },
  {
    from: "server",
    messages: ["ServerHello + key_share", "{EncryptedExtensions}", "{Certificate}", "{CertificateVerify}", "{Finished}"],
  },
  { from: "client", messages: ["{Finished}"] },
  { from: "client", messages: ["[Application Data]"] },
];

/** What Keyvern's lamps show after each flight. */
export interface LockState {
  client: boolean;
  server: boolean;
  /** Both key shares have been exchanged, so either side can derive the shared secret. */
  secret: boolean;
  /** The handshake is over and application data flows under the session keys. */
  locked: boolean;
}

/** The lamp state after flight `step` (0-based) of `TLS13_HANDSHAKE`. */
export function lockState(step: number, flights: TlsFlight[] = TLS13_HANDSHAKE): LockState {
  const sent = flights.slice(0, step + 1).flatMap((f) => f.messages.map((m) => ({ from: f.from, m })));
  const client = sent.some((x) => x.from === "client" && x.m.includes("key_share"));
  const server = sent.some((x) => x.from === "server" && x.m.includes("key_share"));
  const finished = (side: TlsSide) => sent.some((x) => x.from === side && x.m === "{Finished}");
  return {
    client,
    server,
    secret: client && server,
    locked: finished("client") && finished("server") && sent.some((x) => x.m.startsWith("[")),
  };
}

const modPow = (b: bigint, e: bigint, m: bigint) => {
  let acc = BigInt(1);
  b %= m;
  while (e > BigInt(0)) {
    if (e & BigInt(1)) acc = (acc * b) % m;
    b = (b * b) % m;
    e >>= BigInt(1);
  }
  return acc;
};

/**
 * Diffie-Hellman over the integers mod `p` with generator `g`: the key shares
 * each side publishes and the secret each one computes from the other's share
 * (they always agree). Ephemeral (EC)DHE like this is the only key exchange
 * TLS 1.3 allows.
 */
export function diffieHellman(p: number, g: number, a: number, b: number) {
  const [P, G, Ap, Bp] = [p, g, a, b].map(BigInt);
  const A = modPow(G, Ap, P);
  const B = modPow(G, Bp, P);
  return {
    A: Number(A),
    B: Number(B),
    clientSecret: Number(modPow(B, Ap, P)),
    serverSecret: Number(modPow(A, Bp, P)),
  };
}

/** Lamp centres at rest: the gems in the wing wrists, the keyhole and the shackle's right leg. */
export const GEM_POS = { client: [26, 26], server: [47, 18] } as const;
export const KEYHOLE_POS = [68, 65] as const;
export const SHACKLE_POS = [71, 60] as const;

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Head offset (bob and recoil). */
  hx: number;
  hy: number;
  /** Wing fingers spreading (+) or folding (−); the wrists stay put. */
  spread: number;
  /** Wrist offset for the attack and faint. */
  wy: number;
  breath: number;
  tail: number;
  lamps: LockState;
  /** The side whose gem is sending this frame gets sparks. */
  sending: TlsSide | null;
  /** Encrypted data sparks around the lock. */
  data: boolean;
  eyes: Eyes;
  mouthOpen: boolean;
}

const DARK: LockState = { client: false, server: false, secret: false, locked: false };

const REST: Pose = {
  bx: 0,
  by: 0,
  hx: 0,
  hy: 0,
  spread: 0,
  wy: 0,
  breath: 0,
  tail: 0,
  lamps: DARK,
  sending: null,
  data: false,
  eyes: "open",
  mouthOpen: false,
};

const r = Math.round;

function battlement(p: Painter) {
  // the top of the keep's wall: a stone block with a lit top face and mortar lines
  p.polygon(
    [
      [20, 82],
      [86, 82],
      [86, 93],
      [20, 93],
    ],
    "S",
  );
  p.ellipse(53, 86, 40, 12, STONE, { clip: true, bias: 0.2 });
  for (let x = 20; x <= 86; x++) {
    p.set(x, 82, "R");
    p.set(x, 83, "R");
    p.set(x, 84, "T");
    p.set(x, 89, "T");
  }
  for (const x of [30, 48, 66, 82]) for (let y = 85; y < 89; y++) p.set(x, y, "T");
  for (const x of [22, 39, 57, 75]) for (let y = 90; y < 93; y++) p.set(x, y, "T");
}

function gem(p: Painter, x: number, y: number, lit: string | null) {
  x = r(x);
  y = r(y);
  p.stamp(x - 3, y - 3, ["...D...", "..DCD..", ".DC.CD.", "DC...CD", ".DC.CD.", "..DCD..", "...D..."]);
  if (lit) p.stamp(x - 2, y - 2, [`..${lit}..`, `.${lit}w${lit}.`, `${lit}www${lit}`, `.${lit}${lit}${lit}.`, `..${lit}..`]);
  else p.stamp(x - 2, y - 2, ["..f..", ".fff.", "fffff", ".fff.", "..f.."]);
  p.set(x, y, lit ?? "f");
}

function sparks(p: Painter, x: number, y: number, ch: string) {
  for (const [dx, dy] of [
    [-6, -5],
    [6, -5],
    [-7, 4],
    [0, -8],
  ])
    p.stamp(r(x + dx) - 1, r(y + dy) - 1, [`.${ch}.`, `${ch}w${ch}`, `.${ch}.`]);
}

/** One wing: arm to the wrist, three finger bones, membrane between them. */
function wing(p: Painter, pose: Pose, far: boolean) {
  const { bx, by } = pose;
  const sp = pose.spread;
  const sh: [number, number] = far ? [54 + bx, 48 + by] : [44 + bx, 52 + by];
  const [gx, gy] = far ? GEM_POS.server : GEM_POS.client;
  const wr: [number, number] = [gx + bx, gy + by + pose.wy];
  const tips: [number, number][] = far
    ? [
        [34 + bx - sp, 13 + by + pose.wy - sp * 0.5],
        [33 + bx - sp, 27 + by + pose.wy * 0.6],
        [40 + bx, 40 + by + sp * 0.5],
      ]
    : [
        [9 + bx - sp, 32 + by + pose.wy - sp],
        [7 + bx - sp, 49 + by + pose.wy * 0.5],
        [17 + bx - sp * 0.5, 62 + by + sp * 0.5],
      ];
  const root: [number, number] = far ? [48 + bx, 50 + by] : [36 + bx, 66 + by];
  // membrane with scalloped trailing edges between the fingers
  const scallop = (a: [number, number], b: [number, number]): [number, number] => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    return [mx + (wr[0] - mx) * 0.28, my + (wr[1] - my) * 0.28];
  };
  p.polygon(
    [sh, wr, tips[0], scallop(tips[0], tips[1]), tips[1], scallop(tips[1], tips[2]), tips[2], scallop(tips[2], root), root],
    far ? "Y" : "X",
  );
  // soft shading over the membrane, lighter towards the arm
  p.ellipse(wr[0] - 2, wr[1] + 8, far ? 14 : 18, far ? 18 : 24, far ? "XY" : MEMBRANE, { clip: true, bias: far ? -0.15 : 0.05 });
  // finger bones
  for (const t of tips)
    p.tube([wr, t], [1.5, 0.7], far ? "CD" : "BCD", { bias: 0.1 });
  // arm: shoulder to wrist
  p.tube([sh, [(sh[0] + wr[0]) / 2 + 1, (sh[1] + wr[1]) / 2 - 2], wr], [3.6, 2.8, 2.4], far ? "BCD" : SCALE, { rim: "D" });
  // thumb claw
  p.stamp(r(wr[0]) - 1, r(wr[1]) - 4, [".h", "hi", "i."]);
}

function tail(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const t = pose.tail;
  const tip: [number, number] = [10 + bx + t, 66 + by - t];
  p.tube(
    [
      [40 + bx, 74 + by],
      [28 + bx, 80 + by],
      [17 + bx + t * 0.5, 78 + by],
      tip,
    ],
    [5.5, 4, 2.6, 1.6],
    SCALE,
    { rim: "D" },
  );
  // the key bit at the tip: a brass blade with two teeth
  const kx = r(tip[0]);
  const ky = r(tip[1]);
  p.stamp(kx - 3, ky - 9, ["..gg..", ".gKKg.", ".gKLg.", ".gKLg.", ".gKLg.", "ggKLgg", "gKKLLg", "gK..Lg", "gL..Lg", "gL..L.", ".L...."]);
}

function legs(p: Painter, pose: Pose, near: boolean) {
  const { bx, by } = pose;
  const lx = near ? 46 : 58;
  // thigh, shin and a foot gripping the wall top with three talons
  p.ellipse(lx + bx, 73 + by, 7, 6, near ? SCALE : "BCD", { rim: "D" });
  p.tube(
    [
      [lx + 1 + bx, 76 + by],
      [lx + 3 + bx * 0.4, 81 + by * 0.4],
    ],
    [3.2, 2.6],
    near ? SCALE : "BCD",
    { rim: "D" },
  );
  const fx = r(lx + 3 + bx * 0.4);
  const fy = r(81 + by * 0.4);
  p.ellipse(fx, fy, 5, 2.4, near ? SCALE : "BCD", { rim: "D" });
  p.stamp(fx - 5, fy, ["h...h...h", "i...i...i"]);
}

function body(p: Pose, pp: Painter, back: boolean) {
  const { bx, by, breath } = p;
  pp.ellipse(50 + bx, 63 + by, 14 + breath, 14 + breath * 0.5, SCALE, { rim: "D" });
  if (!back) {
    // belly plates down the chest
    pp.ellipse(57 + bx, 64 + by, 7 + breath, 11, PALE, { clip: true, bias: 0.1 });
    for (let y = 56; y <= 74; y += 3)
      for (let x = 51; x <= 63; x++) if (pp.get(x + bx, y + by) === "K" || pp.get(x + bx, y + by) === "J") pp.set(x + bx, y + by, "L");
  } else {
    // a row of spines down the back
    for (const [sx, sy] of [
      [40, 52],
      [37, 58],
      [36, 64],
      [37, 70],
    ])
      pp.stamp(sx + bx - 3, sy + by - 1, ["CC..", ".CCC", "..D."]);
    pp.ellipse(44 + bx, 61 + by, 4, 12, "CD", { clip: true });
  }
}

function neckAndHead(p: Painter, pose: Pose, back: boolean) {
  const { bx, by } = pose;
  const hx = 72 + bx + pose.hx;
  const hy = 29 + by + pose.hy;
  const neck: [number, number][] = [
    [55 + bx, 56 + by],
    [62 + bx + pose.hx * 0.3, 44 + by + pose.hy * 0.4],
    [hx - 3, hy + 3],
  ];
  p.tube(neck, [7, 5.4, 5], SCALE, { rim: "D" });
  if (!back)
    p.tube(
      neck.map(([x, y]) => [x + 3, y + 2]),
      [4, 3, 2.6],
      PALE,
      { clip: true, bias: 0.15 },
    );
  // spines along the back of the neck
  for (const f of [0.15, 0.4, 0.65]) {
    const x = neck[0][0] + (neck[2][0] - neck[0][0]) * f - 6;
    const y = neck[0][1] + (neck[2][1] - neck[0][1]) * f - 1;
    p.stamp(r(x) - 2, r(y) - 1, ["CC.", ".CC", "..D"]);
  }
  // horns swept back
  p.tube(
    [
      [hx - 3, hy - 5],
      [hx - 9, hy - 11],
      [hx - 15, hy - 14],
    ],
    [2.6, 1.7, 0.8],
    HORN,
    { rim: "i" },
  );
  p.tube(
    [
      [hx + 2, hy - 6],
      [hx - 1, hy - 12],
      [hx - 5, hy - 16],
    ],
    [2.4, 1.5, 0.7],
    HORN,
    { rim: "i" },
  );
  // skull and snout
  p.ellipse(hx, hy, 9, 7.5, SCALE, { rim: "D" });
  p.tube(
    [
      [hx + 3, hy + 1],
      [hx + 12, hy + 4],
    ],
    [5.2, 3.4],
    SCALE,
    { rim: "D", bias: 0.05 },
  );
  // brow ridge
  p.tube(
    [
      [hx - 2, hy - 4],
      [hx + 7, hy - 3],
    ],
    [1.8, 1.4],
    "BCD",
  );
  if (back) {
    // back of the head: a dark crest down the middle
    p.ellipse(hx - 4, hy, 3, 6, "CD", { clip: true });
    return;
  }
  // nostril and mouth
  p.set(hx + 12, hy + 2, "k");
  if (pose.mouthOpen) {
    p.stamp(r(hx) + 3, r(hy) + 5, ["kkkkkkkk.", "khrrrrhk.", ".kkkkkkk."]);
  } else for (let x = 3; x <= 13; x++) p.set(hx + x, hy + 5 + (x > 10 ? -1 : 0), "k");
  // gold eye under the brow
  const ex = r(hx + 4);
  const ey = r(hy - 1);
  if (pose.eyes === "shut") p.stamp(ex - 2, ey, ["kkkk", ".kk."]);
  else if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
  else {
    p.stamp(ex - 2, ey - 1, ["kkkk", "kewk", "keek", ".kk."]);
    p.set(ex, ey + 1, "k");
    if (pose.eyes === "fierce") p.stamp(ex - 3, ey - 3, ["DD...", ".DDDD"]);
  }
}

function lock(p: Painter, pose: Pose) {
  const [kx, ky] = KEYHOLE_POS;
  // chain from the collar at the neck's base
  p.tube(
    [
      [55, 55],
      [62, 58],
      [kx, ky - 7],
    ],
    [1.2, 1.2, 1.2],
    "iT",
  );
  // brass body
  p.polygon(
    [
      [kx - 5.5, ky - 3.5],
      [kx + 5.5, ky - 3.5],
      [kx + 5.5, ky + 5.5],
      [kx - 5.5, ky + 5.5],
    ],
    "K",
  );
  p.ellipse(kx - 1, ky, 7, 7, PALE, { clip: true, bias: 0.05 });
  for (let x = kx - 5; x <= kx + 5; x++) {
    p.set(x, ky - 3, "T");
    p.set(x, ky + 5, "T");
  }
  for (let y = ky - 3; y <= ky + 5; y++) {
    p.set(kx - 5, y, "T");
    p.set(kx + 5, y, "T");
  }
  // the shackle: closed, or popped up with its right leg free
  const lift = pose.lamps.locked ? 0 : 3;
  p.tube(
    [
      [kx - 3, ky - 4],
      [kx - 3, ky - 6 - lift],
      [kx, ky - 9 - lift],
      [kx + 3, ky - 6 - lift],
      [kx + 3, ky - 4 - (pose.lamps.locked ? 0 : 4)],
    ],
    [1.3, 1.3, 1.3, 1.3, 1.3],
    HORN,
    { rim: "i" },
  );
  // keyhole: dark until both shares are in, then it glows with the shared secret
  if (pose.lamps.secret) p.stamp(kx - 1, ky - 1, [".g.", "gyg", ".y.", ".y."]);
  else p.stamp(kx - 1, ky - 1, [".k.", "kkk", ".k.", ".k."]);
  if (pose.data)
    for (const [dx, dy] of [
      [-9, -2],
      [9, 1],
      [-7, 8],
      [8, 9],
    ])
      p.stamp(kx + dx - 1, ky + dy - 1, [".y.", "ygy", ".y."]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  battlement(p);
  wing(p, pose, true);
  tail(p, pose);
  legs(p, pose, false);
  body(pose, p, back);
  legs(p, pose, true);
  neckAndHead(p, pose, back);
  wing(p, pose, false);
  const L = pose.lamps;
  gem(p, GEM_POS.client[0] + pose.bx, GEM_POS.client[1] + pose.by + pose.wy, L.client ? "c" : null);
  gem(p, GEM_POS.server[0] + pose.bx, GEM_POS.server[1] + pose.by + pose.wy, L.server ? "s" : null);
  if (pose.sending === "client") sparks(p, GEM_POS.client[0], GEM_POS.client[1], "c");
  if (pose.sending === "server") sparks(p, GEM_POS.server[0], GEM_POS.server[1], "s");
  // the lock is painted on its own canvas so its shading stays inside it, then rides along with the body
  const q = new Painter(96, 96);
  lock(q, pose);
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 96; x++) {
      const ch = q.get(x, y);
      if (ch) p.set(x + pose.bx, y + pose.by, ch);
    }
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const lit: LockState = { client: true, server: true, secret: true, locked: true };
  const senders: (TlsSide | null)[] = [...TLS13_HANDSHAKE.slice(0, 3).map((x) => x.from), null];
  const bob = [
    { hy: 0, spread: 0, tail: 0, breath: 0 },
    { hy: -1, spread: 2, tail: 1, breath: 1 },
    { hy: 0, spread: 3, tail: 2, breath: 1 },
    { hy: -1, spread: 1, tail: 1, breath: 0 },
  ];
  return {
    // the TLS 1.3 handshake: ClientHello, ServerHello…Finished, client Finished, then the lock shuts
    idle: TLS13_HANDSHAKE.map((_, i) =>
      f({ ...bob[i], lamps: lockState(i), sending: senders[i], data: i === 3 }),
    ),
    attack: [
      f({ lamps: lit, by: -2, hy: -1, spread: 3, wy: 0, eyes: "fierce", mouthOpen: true }),
      f({ lamps: lit, bx: 4, by: 1, hx: 3, hy: 2, spread: 2, eyes: "fierce", mouthOpen: true, data: true }),
    ],
    hurt: [
      f({ bx: -3, hx: -3, hy: 2, spread: -2, wy: 2, eyes: "shut", tail: -1 }),
      f({ bx: -1, hx: -1, hy: 1, spread: -1, wy: 1, eyes: "shut" }),
    ],
    faint: [
      f({ by: 2, hx: 1, hy: 6, spread: -3, wy: 6, eyes: "ko", mouthOpen: true, tail: -1 }),
      f({ by: 4, hx: 2, hy: 12, spread: -4, wy: 10, eyes: "ko", mouthOpen: true, tail: -2 }),
    ],
  };
}

export const KEYVERN: CreatureArt = {
  id: "keyvern",
  name: "Keyvern",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "KEY EXCHANGE",
  blurb:
    "Warden of Cipher Keep. A wyvern that trades key shares wing to wing (ClientHello, ServerHello, Finished) and only snaps its padlock shut once the handshake is done.",
};
