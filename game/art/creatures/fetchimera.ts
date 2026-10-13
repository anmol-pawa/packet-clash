import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Fetchimera, the gym 8 boss of Waypoint: a three-headed chimera standing on
 * the town's milestone. A teal-maned hound head at the front fetches, a ram
 * head rises from its shoulders and its tail is a cable serpent with its own
 * head. A harness strap across its flank carries four lamps, one per stage of
 * "what happens when you type a URL": DNS lookup, TCP handshake, TLS
 * handshake and the HTTP request.
 *
 * Its idle loop is that journey: each frame lights the next stage's lamp, and
 * on the last frame the hound holds the fetched page (an envelope) in its
 * jaws. `pageLoadTime` computes how long the journey takes in RTTs, the
 * Kurose & Ross way. Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed. Drawn facing right; the stage
 * mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#101a1c",
  // tawny hide, highlight → shadow
  A: "#f3d9a0",
  B: "#d1a462",
  C: "#9a6f3a",
  D: "#5e4122",
  // teal mane and serpent scales, highlight → shadow
  M: "#9ff2df",
  N: "#4fc4ad",
  P: "#2a8577",
  Q: "#164c48",
  // ram head wool and horns, highlight → shadow
  U: "#f4f0e6",
  V: "#c9c0ac",
  W: "#8f8571",
  // milestone stone, highlight → shadow
  R: "#c2bcae",
  S: "#8a8373",
  T: "#57513f",
  // eyes, mouth, nose
  k: "#0b0d10",
  w: "#ffffff",
  e: "#ffcf3f",
  r: "#c8444f",
  // harness strap, dark lamp, glow
  h: "#6a3b5c",
  f: "#202a2e",
  y: "#fff4a8",
  // stage lamps, one colour per stage
  d: "#c49bff",
  t: "#ffa64a",
  s: "#7ff0ff",
  g: "#8ee07a",
};

const HIDE = "ABCD";
const MANE = "MNPQ";
const WOOL = "UVW";
const STONE = "RST";

/** The stages of loading a page, in order, with each lamp's colour. */
export const JOURNEY = [
  { stage: "DNS", what: "resolve the host name to an IP address", lamp: "d" },
  { stage: "TCP", what: "three-way handshake with the server's port", lamp: "t" },
  { stage: "TLS", what: "negotiate keys and check the certificate (https only)", lamp: "s" },
  { stage: "HTTP", what: "send GET and receive the response", lamp: "g" },
] as const;

export interface ParsedUrl {
  scheme: "http" | "https";
  host: string;
  port: number;
  path: string;
}

/** Splits a URL into what the browser needs for the journey; the port defaults by scheme (80/443). */
export function parseUrl(url: string): ParsedUrl {
  const m = /^(https?):\/\/([^/:?#]+)(?::(\d+))?([^#]*)/i.exec(url.trim());
  if (!m) throw new Error(`not an http(s) URL: ${url}`);
  const scheme = m[1].toLowerCase() as "http" | "https";
  const path = m[4] || "/";
  return {
    scheme,
    host: m[2].toLowerCase(),
    port: m[3] ? Number(m[3]) : scheme === "https" ? 443 : 80,
    path: path.startsWith("/") ? path : `/${path}`,
  };
}

/** The stages a fetch of `url` goes through (no TLS for plain http). */
export const journeyFor = (url: string) => JOURNEY.filter((j) => j.stage !== "TLS" || parseUrl(url).scheme === "https").map((j) => j.stage);

export type HttpMode = "non-persistent" | "non-persistent-parallel" | "persistent" | "persistent-pipelined";

export interface PageLoad {
  /** RTTs to each DNS server visited (empty when the address is cached). */
  dnsRtts: number[];
  /** RTT between the client and the web server. */
  rtt: number;
  /** Objects referenced by the base HTML file. */
  objects: number;
  mode: HttpMode;
  /** Parallel connections for "non-persistent-parallel". */
  parallel?: number;
  /** Extra RTTs of TLS handshake per new connection (1 for TLS 1.3, 2 for TLS 1.2, 0 for http). */
  tlsRtts?: number;
}

/**
 * Time from clicking a link until the page and all its objects have arrived,
 * with zero transmission time (Kurose & Ross, chapter 2 problems P7/P8).
 * Each new TCP connection costs one RTT to set up (plus any TLS RTTs), then
 * one RTT per request/response.
 */
export function pageLoadTime(q: PageLoad): number {
  const dns = q.dnsRtts.reduce((a, b) => a + b, 0);
  const conn = q.rtt * (1 + (q.tlsRtts ?? 0));
  const fetch = conn + q.rtt; // the base HTML over a fresh connection
  const n = q.objects;
  let rest: number;
  switch (q.mode) {
    case "non-persistent":
      rest = n * (conn + q.rtt);
      break;
    case "non-persistent-parallel":
      rest = Math.ceil(n / (q.parallel ?? 1)) * (conn + q.rtt);
      break;
    case "persistent":
      rest = n * q.rtt;
      break;
    case "persistent-pipelined":
      rest = n > 0 ? q.rtt : 0;
      break;
  }
  return dns + fetch + rest;
}

/** Lamp centres at rest, along the harness strap from back to front. */
export const LAMP_POS: readonly (readonly [number, number])[] = [
  [32, 59],
  [40, 61],
  [48, 62],
  [56, 61],
];
/** Where the fetched page sits in the hound's jaws. */
export const PAGE_POS = [84, 49] as const;

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Hound head offset. */
  hx: number;
  hy: number;
  /** Ram head offset. */
  gx: number;
  gy: number;
  /** Serpent tail sway and its head's offset. */
  sway: number;
  sy: number;
  breath: number;
  /** How many lamps are lit (0–4). */
  lit: number;
  page: boolean;
  /** Sparks around the lamp just lit. */
  spark: number | null;
  eyes: Eyes;
  mouthOpen: boolean;
  /** Legs bent for the faint. */
  crouch: number;
}

const REST: Pose = {
  bx: 0,
  by: 0,
  hx: 0,
  hy: 0,
  gx: 0,
  gy: 0,
  sway: 0,
  sy: 0,
  breath: 0,
  lit: 0,
  page: false,
  spark: null,
  eyes: "open",
  mouthOpen: false,
  crouch: 0,
};

const r = Math.round;

function milestone(p: Painter) {
  // a wide cobbled road slab with a carved arrow, the town's waypoint
  p.polygon(
    [
      [14, 83],
      [88, 83],
      [90, 93],
      [12, 93],
    ],
    "S",
  );
  p.ellipse(51, 87, 42, 11, STONE, { clip: true, bias: 0.2 });
  for (let x = 14; x <= 88; x++) {
    p.set(x, 83, "R");
    p.set(x, 84, "T");
  }
  for (const [x, y] of [
    [24, 88],
    [40, 90],
    [61, 88],
    [78, 90],
  ])
    p.stamp(x, y, ["TT.", ".TT"]);
  // the arrow pointing on down the road
  p.stamp(46, 87, ["....T.", "TTTTTT", "....T."]);
}

function sparkle(p: Painter, x: number, y: number, ch: string) {
  for (const [dx, dy] of [
    [-4, -6],
    [4, -6],
    [0, -9],
  ])
    p.stamp(r(x + dx) - 1, r(y + dy) - 1, [`.${ch}.`, `${ch}w${ch}`, `.${ch}.`]);
}

function leg(p: Pose, pp: Painter, x: number, far: boolean, front: boolean) {
  const { bx, by } = p;
  const ramp = far ? "BCD" : HIDE;
  const top: [number, number] = [x + bx, 64 + by];
  const knee: [number, number] = [x + bx + (front ? 1 : -2) + p.crouch, 74 + by * 0.5 + p.crouch * 0.4];
  const foot: [number, number] = [x + bx * 0.4 + (front ? 2 : 0), 81];
  pp.tube([top, knee, foot], [front ? 5 : 5.8, 3.6, 3.2], ramp, { rim: "D" });
  // paw with toes
  const fx = r(foot[0]);
  pp.ellipse(fx + 1, 81.5, 4, 2.2, ramp, { rim: "D" });
  pp.stamp(fx - 1, 82, ["k.k.k"]);
}

function serpent(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const s = pose.sway;
  const head: [number, number] = [17 + bx + s, 26 + by + pose.sy];
  p.tube(
    [
      [30 + bx, 58 + by],
      [18 + bx, 60 + by],
      [10 + bx + s * 0.4, 50 + by],
      [12 + bx + s * 0.8, 38 + by + pose.sy * 0.5],
      [head[0] - 1, head[1] + 4],
    ],
    [4.4, 3.8, 3.4, 3, 2.8],
    MANE,
    { rim: "Q" },
  );
  // scale bands down the cable
  for (const [x, y] of [
    [20, 60],
    [12, 52],
    [11, 44],
  ])
    p.stamp(r(x + bx + s * 0.4) - 1, r(y + by), ["PPP"]);
  // the serpent's head: a wedge with a forked tongue
  const [sx, sy] = [r(head[0]), r(head[1])];
  p.ellipse(sx + 1, sy, 5, 3.6, MANE, { rim: "Q", bias: 0.1 });
  if (pose.eyes === "ko") p.stamp(sx + 1, sy - 2, ["k.k", ".k.", "k.k"]);
  else if (pose.eyes === "shut") p.stamp(sx + 1, sy - 1, ["kk"]);
  else p.stamp(sx + 1, sy - 1, ["ek"]);
  if (pose.mouthOpen) p.stamp(sx + 6, sy + 1, ["rr.r", "..r."]);
}

function body(p: Painter, pose: Pose) {
  const { bx, by, breath } = pose;
  p.ellipse(47 + bx, 60 + by, 20 + breath, 11 + breath * 0.5, HIDE, { rim: "D" });
  // pale underbelly
  p.ellipse(49 + bx, 67 + by, 14, 5, "AB", { clip: true, bias: 0.15 });
}

function harness(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  // the strap: a band across the flank, under the lamps
  LAMP_POS.forEach(([x, y], i) => {
    if (i < LAMP_POS.length - 1) {
      const [nx, ny] = LAMP_POS[i + 1];
      p.tube(
        [
          [x + bx, y + by],
          [nx + bx, ny + by],
        ],
        [1.6, 1.6],
        "h",
        { clip: true },
      );
    }
  });
  p.tube(
    [
      [LAMP_POS[0][0] - 5 + bx, 52 + by],
      [LAMP_POS[0][0] + bx, LAMP_POS[0][1] + by],
    ],
    [1.5, 1.6],
    "h",
    { clip: true },
  );
  p.tube(
    [
      [LAMP_POS[3][0] + bx, LAMP_POS[3][1] + by],
      [LAMP_POS[3][0] + 5 + bx, 51 + by],
    ],
    [1.6, 1.5],
    "h",
    { clip: true },
  );
  LAMP_POS.forEach(([x, y], i) => {
    const cx = x + bx;
    const cy = y + by;
    const ch = i < pose.lit ? JOURNEY[i].lamp : null;
    p.stamp(cx - 3, cy - 3, [".TTTTT.", "T.....T", "T.....T", "T.....T", "T.....T", "T.....T", ".TTTTT."]);
    if (ch) p.stamp(cx - 2, cy - 2, [`.${ch}${ch}${ch}.`, `${ch}ww${ch}${ch}`, `${ch}w${ch}${ch}${ch}`, `${ch}${ch}${ch}${ch}${ch}`, `.${ch}${ch}${ch}.`]);
    else p.stamp(cx - 2, cy - 2, [".fff.", "fffff", "fffff", "fffff", ".fff."]);
    p.set(cx, cy, ch ?? "f");
  });
  if (pose.spark !== null) {
    const [x, y] = LAMP_POS[pose.spark];
    sparkle(p, x + bx, y + by, JOURNEY[pose.spark].lamp);
  }
}

function ram(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const gx = 40 + bx + pose.gx;
  const gy = 38 + by + pose.gy;
  // neck rising from the shoulders
  p.tube(
    [
      [42 + bx, 54 + by],
      [gx - 1, gy + 5],
    ],
    [5.5, 4.2],
    HIDE,
    { rim: "D" },
  );
  // woolly skull and a long muzzle angled down-right
  p.ellipse(gx, gy, 7, 6, WOOL, { rim: "W" });
  for (const [dx, dy] of [
    [-4, 5],
    [0, 6],
    [-6, 1],
  ])
    p.ellipse(gx + dx, gy + dy, 2.6, 2.2, WOOL, { rim: "W" });
  p.tube(
    [
      [gx + 2, gy + 1],
      [gx + 8, gy + 5],
    ],
    [3.6, 2.4],
    WOOL,
    { rim: "W", bias: 0.05 },
  );
  // beard
  p.tube(
    [
      [gx + 6, gy + 7],
      [gx + 5, gy + 11],
    ],
    [1.6, 0.8],
    "VW",
  );
  // curled grey horn: back, down and forward round the ear
  p.tube(
    [
      [gx - 1, gy - 4],
      [gx - 7, gy - 6],
      [gx - 10, gy - 1],
      [gx - 7, gy + 4],
      [gx - 3, gy + 3],
    ],
    [2.8, 2.6, 2.2, 1.7, 1.1],
    STONE,
    { rim: "T" },
  );
  for (const [x, y] of [
    [-6, -6],
    [-9, -2],
    [-8, 2],
  ])
    p.set(gx + x, gy + y, "T");
  const ex = r(gx + 2);
  const ey = r(gy - 1);
  if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
  else if (pose.eyes === "shut") p.stamp(ex - 1, ey, ["kkk"]);
  else {
    // a goat's sideways pupil
    p.stamp(ex - 1, ey - 1, ["eee", "kkk", "eee"]);
    if (pose.eyes === "fierce") p.stamp(ex - 2, ey - 3, ["WW..", ".WWW"]);
  }
  p.set(r(gx + 9), r(gy + 4), "k");
}

function hound(p: Painter, pose: Pose) {
  const { bx, by } = pose;
  const hx = 72 + bx + pose.hx;
  const hy = 41 + by + pose.hy;
  // mane: spiky teal ruff round the neck
  p.tube(
    [
      [60 + bx, 56 + by],
      [65 + bx + pose.hx * 0.6, 46 + by + pose.hy * 0.6],
    ],
    [6, 5],
    HIDE,
    { rim: "D" },
  );
  p.ellipse(65 + bx + pose.hx * 0.5, 47 + by + pose.hy * 0.5, 7.5, 9, MANE, { rim: "Q" });
  for (const [dx, dy] of [
    [-7, -6],
    [-9, 1],
    [-6, 8],
    [-1, -9],
  ]) {
    const x = 65 + bx + pose.hx * 0.5 + dx;
    const y = 47 + by + pose.hy * 0.5 + dy;
    p.tube(
      [
        [x - dx * 0.25, y - dy * 0.25],
        [x + dx * 0.2, y + dy * 0.2],
      ],
      [2.8, 0.8],
      MANE,
      { rim: "Q" },
    );
  }
  // skull and a long hound snout
  p.ellipse(hx, hy, 8.5, 7.5, HIDE, { rim: "D" });
  p.tube(
    [
      [hx + 3, hy + 2],
      [hx + 12, hy + 5],
    ],
    [5, 3.6],
    HIDE,
    { rim: "D", bias: 0.08 },
  );
  // pale muzzle
  p.ellipse(hx + 9, hy + 7, 5, 2.4, "AB", { clip: true, bias: 0.2 });
  // nose
  p.stamp(r(hx) + 13, r(hy) + 2, ["kk", "kk"]);
  // brow
  p.tube(
    [
      [hx - 1, hy - 4],
      [hx + 6, hy - 3],
    ],
    [1.5, 1.2],
    "BCD",
  );
  const ex = r(hx + 4);
  const ey = r(hy - 1);
  if (pose.eyes === "shut") p.stamp(ex - 2, ey, ["kkkk", ".kk."]);
  else if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
  else {
    p.stamp(ex - 2, ey - 1, ["kkkk", "kewk", "keek", ".kk."]);
    if (pose.eyes === "fierce") p.stamp(ex - 3, ey - 3, ["DD...", ".DDDD"]);
  }
  // mouth
  if (pose.mouthOpen) p.stamp(r(hx) + 4, r(hy) + 6, ["kkkkkkkkk", "kwrrrrrwk", ".kkkkkkk."]);
  else for (let x = 4; x <= 12; x++) p.set(hx + x, hy + 7, "k");
  // floppy ear hanging behind the eye
  p.tube(
    [
      [hx - 3, hy - 5],
      [hx - 7, hy],
      [hx - 6, hy + 8],
    ],
    [2.6, 3.4, 2.4],
    "BCD",
    { rim: "D" },
  );
}

function page(p: Painter, x: number, y: number) {
  // the fetched page: an envelope held crosswise in the jaws
  p.stamp(x - 5, y - 3, ["TTTTTTTTTTT", "TwUUUUUUUwT", "TUwUUUUUwUT", "TUUwUUUwUUT", "TUUUwgwUUUT", "TUUUUUUUUUT", "TTTTTTTTTTT"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  milestone(p);
  serpent(p, pose);
  leg(pose, p, 34, true, false);
  leg(pose, p, 58, true, true);
  body(p, pose);
  leg(pose, p, 38, false, false);
  leg(pose, p, 62, false, true);
  if (back) {
    // from behind: a dark dorsal stripe along the spine instead of the belly
    p.ellipse(46 + pose.bx, 53 + pose.by, 16, 3, "CD", { clip: true });
  }
  ram(p, pose);
  hound(p, pose);
  harness(p, pose);
  if (pose.page) page(p, PAGE_POS[0] + pose.bx + pose.hx, PAGE_POS[1] + pose.by + pose.hy);
  if (back) {
    // the back view hides the faces: paint the backs of both heads over them
    const hx = 72 + pose.bx + pose.hx;
    const hy = 41 + pose.by + pose.hy;
    p.ellipse(hx - 1, hy, 8, 7, "BCD", { clip: true });
    p.ellipse(hx - 3, hy - 1, 2.5, 5, "CD", { clip: true });
    const gx = 40 + pose.bx + pose.gx;
    const gy = 38 + pose.by + pose.gy;
    p.ellipse(gx + 1, gy, 5, 4.5, "VW", { clip: true });
  }
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const bob = [
    { hy: 0, gy: 0, sway: 0, sy: 0, breath: 0 },
    { hy: -1, gy: 1, sway: 1, sy: -1, breath: 1 },
    { hy: 0, gy: 0, sway: 2, sy: 0, breath: 1 },
    { hy: -1, gy: -1, sway: 1, sy: 1, breath: 0 },
  ];
  return {
    // the URL journey: DNS, TCP, TLS, then HTTP, with the page in its jaws
    idle: JOURNEY.map((_, i) => f({ ...bob[i], lit: i + 1, spark: i, page: i === JOURNEY.length - 1 })),
    attack: [
      f({ lit: 4, by: -2, hy: -2, gy: -2, sway: -2, sy: -2, eyes: "fierce", mouthOpen: true }),
      f({ lit: 4, bx: 4, by: 1, hx: 3, hy: 2, gx: 2, sway: 3, eyes: "fierce", mouthOpen: true, spark: 3 }),
    ],
    hurt: [
      f({ bx: -3, hx: -3, hy: 2, gx: -2, gy: 1, sway: -2, eyes: "shut" }),
      f({ bx: -1, hx: -1, hy: 1, gx: -1, eyes: "shut" }),
    ],
    faint: [
      f({ by: 2, hx: 1, hy: 6, gy: 5, sy: 8, sway: -1, eyes: "ko", mouthOpen: true, crouch: 2 }),
      f({ by: 5, hx: 2, hy: 11, gy: 9, sy: 16, sway: -2, eyes: "ko", mouthOpen: true, crouch: 4 }),
    ],
  };
}

export const FETCHIMERA: CreatureArt = {
  id: "fetchimera",
  name: "Fetchimera",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "FULL PAGE LOAD",
  blurb:
    "Guardian of Waypoint. Its serpent asks the way (DNS), its ram head knocks (TCP, then TLS), and its hound head fetches the page (HTTP) before anyone else can blink.",
};
