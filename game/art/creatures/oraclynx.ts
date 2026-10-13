import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Oraclynx, the gym 6 boss of Resolvia: a seer lynx sitting on a stone dais,
 * a crystal orb between its forepaws (its resolver cache) and three rune
 * stones floating behind it. The stones are the DNS hierarchy: the top one is
 * the root, the middle one a TLD server and the low one the authoritative
 * server, marked with one, two and three notches for their depth.
 *
 * Its idle loop is an iterative lookup: each frame lights the stone being
 * asked (root → TLD → authoritative, each answering with a referral to the
 * next) and on the last frame the answer lands in the orb, which glows gold.
 * Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed. Drawn facing right; the stage
 * mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#14111f",
  // fur, highlight → shadow
  A: "#f6dfc0",
  B: "#d6a877",
  C: "#a2704b",
  D: "#5f3d2e",
  // ruff, muzzle and belly, highlight → shadow
  J: "#fffaf0",
  K: "#eadcc8",
  L: "#b8a490",
  // ear tufts, spots, pupils
  k: "#0d0b14",
  w: "#ffffff",
  e: "#c9a2ff",
  p: "#e48a92",
  // rune stones and dais, highlight → shadow
  R: "#a9a2c4",
  S: "#706a92",
  T: "#433e62",
  // stone gems: lit and dark
  v: "#eedcff",
  f: "#2e2a44",
  // the orb, highlight → shadow
  Q: "#efe4ff",
  P: "#a27ff0",
  N: "#5a3da6",
  // the answer and query sparks
  g: "#ffd257",
  y: "#fff3a8",
};

const FUR = "ABCD";
const PALE = "JKL";
const STONE = "RST";
const ORB = "QPN";

/** A DNS server in the toy namespace, with what it knows. */
export interface NameServer {
  name: string;
  /** The zone it is authoritative for ("." is the root). */
  zone: string;
  /** Child zones it delegates, mapped to the name server that holds each one. */
  delegations: Record<string, string>;
  /** A records it can answer for directly. */
  records: Record<string, string>;
}

/**
 * The servers from Kurose & Ross's DNS example (§2.4.2): a host in cse.nyu.edu
 * looks up gaia.cs.umass.edu. The root refers it to an edu TLD server, which
 * refers it to umass.edu's authoritative server, which answers.
 */
export const NAME_SERVERS: NameServer[] = [
  {
    name: "a.root-servers.net",
    zone: ".",
    delegations: { "edu.": "a.edu-servers.net", "com.": "a.gtld-servers.net" },
    records: {},
  },
  {
    name: "a.edu-servers.net",
    zone: "edu.",
    delegations: { "umass.edu.": "dns.umass.edu", "nyu.edu.": "ns1.nyu.edu" },
    records: {},
  },
  { name: "a.gtld-servers.net", zone: "com.", delegations: {}, records: {} },
  {
    name: "dns.umass.edu",
    zone: "umass.edu.",
    delegations: {},
    records: { "gaia.cs.umass.edu.": "128.119.245.12" },
  },
  { name: "ns1.nyu.edu", zone: "nyu.edu.", delegations: {}, records: {} },
];

export const ROOT_SERVER = "a.root-servers.net";

export interface ResolveStep {
  /** The server the local resolver asked. */
  server: string;
  zone: string;
  /** What came back: a referral to a server lower down, an answer, or nothing. */
  reply:
    | { kind: "referral"; zone: string; server: string }
    | { kind: "answer"; address: string }
    | { kind: "nxdomain" };
}

const fqdn = (n: string) => (n.endsWith(".") ? n : `${n}.`);

/**
 * Iterative resolution as a local DNS server does it: ask the root, then
 * follow each referral (the longest delegated suffix of the name) down the
 * hierarchy until a server answers. Returns the queries in order.
 */
export function resolveIteratively(
  qname: string,
  servers: NameServer[] = NAME_SERVERS,
  start = ROOT_SERVER,
): ResolveStep[] {
  const name = fqdn(qname.toLowerCase());
  const byName = new Map(servers.map((s) => [s.name, s]));
  const steps: ResolveStep[] = [];
  let cur = byName.get(start);
  while (cur && steps.length < 16) {
    const s: NameServer = cur;
    if (s.records[name]) {
      steps.push({
        server: s.name,
        zone: s.zone,
        reply: { kind: "answer", address: s.records[name] },
      });
      break;
    }
    const child = Object.keys(s.delegations)
      .filter((z) => name === z || name.endsWith(`.${z}`))
      .sort((a, b) => b.length - a.length)[0];
    if (!child) {
      steps.push({ server: s.name, zone: s.zone, reply: { kind: "nxdomain" } });
      break;
    }
    steps.push({
      server: s.name,
      zone: s.zone,
      reply: { kind: "referral", zone: child, server: s.delegations[child] },
    });
    cur = byName.get(s.delegations[child]);
  }
  return steps;
}

/**
 * DNS messages sent for a lookup where the host asks its local server
 * recursively and the local server works iteratively: the host's query and
 * the final reply, plus a query and a reply per server asked (8 for the
 * three-server textbook example).
 */
export function messageCount(steps: ResolveStep[]): number {
  return 2 + 2 * steps.length;
}

/** Where each stone's gem and the orb are centred (front and back are drawn the same way round). */
export const STONE_POS = {
  root: [15, 22],
  tld: [15, 44],
  auth: [15, 66],
} as const;
export const ORB_POS = [80, 74] as const;
const STONES = ["root", "tld", "auth"] as const;

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Head offset for bobbing. */
  hy: number;
  breath: number;
  /** Which stones are lit (root, tld, auth). */
  lit: [boolean, boolean, boolean];
  /** The stone being asked right now gets sparks, or null. */
  asking: 0 | 1 | 2 | null;
  /** Per-stone bob and knock offsets. */
  sdx: [number, number, number];
  sdy: [number, number, number];
  /** The orb holds the answer (gold core). */
  answer: boolean;
  /** Ears folded back (hurt/faint). */
  earsBack: number;
  eyes: Eyes;
  mouthOpen: boolean;
}

const REST: Pose = {
  bx: 0,
  by: 0,
  hy: 0,
  breath: 0,
  lit: [false, false, false],
  asking: null,
  sdx: [0, 0, 0],
  sdy: [0, 0, 0],
  answer: false,
  earsBack: 0,
  eyes: "open",
  mouthOpen: false,
};

function stone(p: Painter, pose: Pose, i: 0 | 1 | 2) {
  const [sx, sy] = STONE_POS[STONES[i]];
  const x = sx + pose.sdx[i];
  const y = sy + pose.sdy[i];
  // a rough hexagonal rune stone, shaded like a slab
  p.ellipse(x, y, 7.5, 9, STONE, { rim: "T" });
  p.polygon(
    [
      [x - 7, y - 4],
      [x - 3, y - 9],
      [x + 3, y - 9],
      [x + 7, y - 4],
      [x + 7, y + 4],
      [x + 3, y + 9],
      [x - 3, y + 9],
      [x - 7, y + 4],
    ],
    "S",
    { clip: true },
  );
  p.ellipse(x - 1, y - 1, 5.5, 7, STONE, { clip: true, bias: 0.15 });
  // depth notches above the gem: one for the root, two for a TLD, three for authoritative
  for (let n = 0; n <= i; n++) p.set(x - i + n * 2, y - 6, "T");
  // the gem
  if (pose.lit[i]) {
    // lit: a bright diamond with a violet glow spilling over the stone
    p.stamp(
      x - 4,
      y - 4,
      [
        "...P...",
        "..PvP..",
        ".PvwvP.",
        "PvwvvvP",
        ".PvvvP.",
        "..PvP..",
        "...P...",
      ].map((r) => `.${r}.`),
    );
    p.stamp(x - 3, y - 3, [
      "...v...",
      "..vwv..",
      ".vwvvv.",
      "vvvvvvv",
      ".vvvvv.",
      "..vvv..",
      "...v...",
    ]);
  } else
    p.stamp(x - 3, y - 3, [
      "...T...",
      "..TfT..",
      ".TfffT.",
      "TfffffT",
      ".TfffT.",
      "..TfT..",
      "...T...",
    ]);
  if (pose.asking === i) {
    // the query arriving: sparks around the stone
    for (const [dx, dy] of [
      [-10, -6],
      [10, -7],
      [-10, 6],
      [10, 7],
      [0, -11],
    ])
      p.stamp(x + dx - 1, y + dy - 1, [".y.", "ygy", ".y."]);
  }
}

function dais(p: Painter) {
  p.ellipse(56, 88, 38, 6, STONE, { rim: "T" });
  // carved rim lines
  for (let x = 24; x <= 88; x += 8) p.stamp(x, 88, ["T", "T"]);
}

function orb(p: Pose, pp: Painter) {
  const x = ORB_POS[0] + p.bx;
  const y = ORB_POS[1] + p.by * 0.3;
  // a little stand, then the crystal
  pp.ellipse(x, y + 9, 7, 3, STONE, { rim: "T" });
  pp.ellipse(x, y, 9, 9, ORB, { rim: "N" });
  // swirl inside
  pp.stamp(Math.round(x) - 5, Math.round(y) + 1, [
    "N.....",
    ".NN...",
    "...NNN",
  ]);
  if (p.answer) {
    // the resolved address glowing in the core
    pp.stamp(Math.round(x) - 3, Math.round(y) - 3, [
      "..yyy..",
      ".yyggy.",
      "yygggyy",
      "ygggggy",
      "yygggyy",
      ".yyggy.",
      "..yyy..",
    ]);
    for (const [dx, dy] of [
      [-11, -4],
      [6, -11],
      [-9, 8],
    ])
      pp.stamp(Math.round(x + dx) - 1, Math.round(y + dy) - 1, [
        ".y.",
        "ygy",
        ".y.",
      ]);
  }
  pp.stamp(Math.round(x) - 5, Math.round(y) - 6, [
    "..ww",
    ".wQ.",
    "wQ..",
    "Q...",
  ]);
}

function forelegs(p: Painter, pose: Pose) {
  const bx = pose.bx;
  const by = pose.by;
  // forelegs, straight down to the dais, with big furry paws
  for (const [lx, w] of [
    [57, 5.4],
    [69, 5.8],
  ] as const) {
    p.tube(
      [
        [lx + bx, 64 + by],
        [lx + 1 + bx * 0.5, 82 + by * 0.5],
      ],
      [w, w - 0.6],
      FUR,
      { rim: "D" },
    );
    p.ellipse(lx + 2 + bx * 0.5, 84 + by * 0.5, 6.5, 3.6, FUR, {
      rim: "D",
      bias: 0.1,
    });
    for (const t of [-1, 2, 5]) p.set(lx + t + bx * 0.5, 86 + by * 0.5, "D");
  }
}

function lynx(p: Painter, pose: Pose, back: boolean) {
  const bx = pose.bx;
  const by = pose.by;
  const hx = 60 + bx;
  const hy = 34 + by + pose.hy;
  // seen from behind, the forelegs are hidden by the body except the paws
  if (back) forelegs(p, pose);
  // bobtail with a black tip, tucked by the haunch
  p.tube(
    [
      [36 + bx, 78 + by],
      [29 + bx, 74 + by],
      [27 + bx, 69 + by],
    ],
    [3.6, 3.4, 3.2],
    FUR,
    { rim: "D" },
  );
  p.ellipse(27 + bx, 68 + by, 3, 2.6, "Dk", { bias: 0.1 });
  // haunch and body
  p.ellipse(46 + bx, 74 + by, 16 + pose.breath, 13, FUR, { rim: "D" });
  p.ellipse(58 + bx, 62 + by, 13 + pose.breath, 19 + pose.breath, FUR, {
    rim: "D",
  });
  if (!back)
    p.ellipse(63 + bx, 63 + by, 7 + pose.breath, 14, PALE, {
      clip: true,
      bias: 0.1,
    });
  else {
    // a darker spine stripe down the back
    p.ellipse(52 + bx, 62 + by, 4, 18, "CD", { clip: true });
  }
  // spots on the flank
  for (const [sx, sy] of [
    [40, 70],
    [46, 66],
    [36, 76],
    [44, 78],
    [52, 72],
    [50, 54],
    [48, 61],
  ])
    p.stamp(sx + bx, sy + by, ["D.D", ".C."]);

  if (!back) forelegs(p, pose);

  // ears: tall triangles with long black tufts
  for (const [ex, side] of [
    [52, -1],
    [70, 1],
  ] as const) {
    const lean = pose.earsBack * -1.5;
    const tip: [number, number] = [
      ex + side * 2 + lean + bx,
      hy - 19 + pose.earsBack * 3,
    ];
    const tri: [number, number][] = [
      [ex - 5 + bx, hy - 7],
      tip,
      [ex + 5 + bx, hy - 7],
    ];
    p.polygon(tri, "C");
    if (!back)
      p.polygon(
        [
          [ex - 2.5 + bx, hy - 8],
          [tip[0], tip[1] + 5],
          [ex + 2.5 + bx, hy - 8],
        ],
        "K",
        { clip: true },
      );
    else
      p.polygon(
        [
          [ex - 1 + bx, hy - 8],
          [tip[0], tip[1] + 4],
          [ex + 1 + bx, hy - 8],
        ],
        "D",
        { clip: true },
      );
    // tuft
    for (let t = 1; t <= 3; t++)
      p.set(
        tip[0] + (pose.earsBack ? -t * 0.6 : side * t * 0.2),
        tip[1] - t,
        "k",
      );
    p.set(tip[0], tip[1], "k");
  }

  // head
  p.ellipse(hx, hy, 15.5, 13, FUR, { rim: "D" });
  // cheek ruff: pale fringes sweeping down and out on both sides
  for (const side of [-1, 1]) {
    // three pointed tufts per cheek, fanning down and out
    for (const [ox, oy, tx, ty] of [
      [9, 4, 18, 10],
      [8, 7, 15, 16],
      [5, 9, 9, 18],
    ])
      p.tube(
        [
          [hx + side * ox, hy + oy],
          [hx + side * tx, hy + ty],
        ],
        [4, 0.9],
        PALE,
        { rim: "L", bias: 0.05 },
      );
  }
  if (back) {
    // back of the head: a dark stripe between the ears
    p.ellipse(hx, hy - 4, 4, 7, "CD", { clip: true });
    return;
  }
  // a seer's gem on the brow, then forehead stripes
  p.stamp(hx + 1, hy - 9, [".e.", "eQe", ".e."]);
  for (const dx of [-3, 5])
    for (let i = 0; i < 3; i++) p.set(hx + dx, hy - 10 + i, "D");
  // muzzle, turned a little towards the right
  p.ellipse(hx + 3, hy + 5, 7, 5, PALE, { bias: 0.2 });
  const nx = Math.round(hx + 3);
  const ny = Math.round(hy + 2);
  p.stamp(nx - 1, ny, ["ppp", ".p."]);
  p.stamp(
    nx - 2,
    ny + 3,
    pose.mouthOpen ? ["kk.kk", "kpppk", ".kkk."] : ["k.k.k", ".k.k."],
  );
  for (const w of [-1, 1])
    for (let i = 2; i < 6; i++) p.set(nx + w * (3 + i), ny + 3 + (i >> 1), "L");
  // eyes: glowing violet with slit pupils
  for (const e of [-1, 1]) {
    const ex = Math.round(hx + 3 + e * 6);
    const ey = Math.round(hy - 2);
    if (pose.eyes === "shut") p.stamp(ex - 2, ey, ["k...k", ".kkk."]);
    else if (pose.eyes === "ko") p.stamp(ex - 1, ey - 1, ["k.k", ".k.", "k.k"]);
    else {
      // almond eyes: violet irises with slit pupils and a glint
      p.stamp(ex - 3, ey - 2, [".kkkkk.", "kweekek", "keekeek", ".kkkkk."]);
      if (pose.eyes === "fierce")
        for (let i = 0; i <= 4; i++)
          p.set(
            ex + e * (2 - i),
            ey - 4 + (e < 0 ? (4 - i) >> 1 : i >> 1),
            "D",
          );
    }
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  dais(p);
  for (const i of [0, 1, 2] as const) stone(p, pose, i);
  lynx(p, pose, back);
  // seen from behind, the orb sits on the far side of the paws: draw it first-ish by clipping nothing
  orb(pose, p);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const all: [boolean, boolean, boolean] = [true, true, true];
  return {
    // an iterative lookup: ask the root, then the TLD, then the authoritative server, then the answer lands in the orb
    idle: [
      f({ lit: [true, false, false], asking: 0, sdy: [-1, 0, 1] }),
      f({
        lit: [false, true, false],
        asking: 1,
        sdy: [0, -1, 0],
        hy: -1,
        breath: 1,
      }),
      f({ lit: [false, false, true], asking: 2, sdy: [1, 0, -1] }),
      f({ answer: true, sdy: [0, 1, 0], hy: -1, breath: 1 }),
    ],
    attack: [
      f({
        lit: all,
        answer: true,
        by: -3,
        eyes: "fierce",
        mouthOpen: true,
        sdy: [-2, -2, -2],
      }),
      f({
        lit: all,
        answer: true,
        bx: 5,
        by: -1,
        eyes: "fierce",
        mouthOpen: true,
        sdx: [3, 3, 3],
      }),
    ],
    hurt: [
      f({
        bx: -4,
        by: -1,
        hy: 1,
        earsBack: 1,
        eyes: "shut",
        sdx: [-2, 1, -1],
        sdy: [2, -1, 1],
      }),
      f({ bx: -2, earsBack: 1, eyes: "shut", sdx: [-1, 0, 0], sdy: [1, 0, 0] }),
    ],
    faint: [
      f({
        by: 3,
        hy: 2,
        earsBack: 2,
        eyes: "ko",
        mouthOpen: true,
        sdx: [2, -1, 1],
        sdy: [8, 6, 4],
      }),
      f({
        by: 6,
        hy: 3,
        earsBack: 2,
        eyes: "ko",
        mouthOpen: true,
        sdx: [4, 2, 2],
        sdy: [14, 10, 6],
      }),
    ],
  };
}

export const ORACLYNX: CreatureArt = {
  id: "oraclynx",
  name: "Oraclynx",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "ROOT REFERRAL",
  blurb:
    "Warden of Resolvia. A seer lynx that answers any name: it asks the root stone, then the TLD stone, then the authoritative stone, and reads the address in its orb.",
};
