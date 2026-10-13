import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Cidrab, the gym 3 boss of Octet Harbor: a broad harbour crab that splits
 * address space. Eight bit-lamps along the rim of its shell show the last
 * octet of a subnet mask. In its idle loop it borrows one more host bit for
 * the network every frame, so the lamps light from the left as /25, /26, /27
 * and /28 (255.255.255.128, .192, .224, .240), always as a contiguous run of
 * ones, the way a real mask must be. Its great right claw carries an etched
 * "/" (the slash of CIDR notation) and barnacles crust its shell. Original
 * design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter so each
 * animation frame is the same drawing re-posed.
 */
const PALETTE = {
  o: "#140c1c",
  // shell, highlight → shadow
  A: "#ffc2b4",
  B: "#f2687c",
  C: "#b8325e",
  D: "#6a1c45",
  // underside, joints and claw tips
  J: "#fff3dc",
  K: "#f2cfa0",
  L: "#c39463",
  // barnacles
  G: "#e2dccb",
  H: "#8f8878",
  // bit-lamps: lit, glint, dark
  e: "#8ff6ff",
  g: "#f2ffff",
  f: "#2b5d78",
  // eyes and mouth
  k: "#0b0c16",
  w: "#ffffff",
  Y: "#ffd257",
  R: "#ff5a6e",
  S: "#7a1f36",
};

const SHELL = "ABCD";
const UNDER = "JKL";

/** The eight lamps' x positions (sharing housing walls, a gap between the nibbles) on the shell rim (bit 7 → bit 0, left → right as seen). */
const LAMPS = [32, 36, 40, 44, 49, 53, 57, 61];

type Eyes = "open" | "fierce" | "shut" | "ko";
type Mouth = "shut" | "open" | "grit";

interface Pose {
  /** Whole-body offset (lean and sink). */
  bx: number;
  by: number;
  /** Shell swell for breathing. */
  breath: number;
  /** How many lamps are lit from the left (a contiguous mask), −1 for all dark. */
  bits: number;
  /** Big claw: lift in px and how far the pincer is open (0 shut … 1 wide). */
  big: number;
  bigOpen: number;
  /** Small claw lift and opening. */
  small: number;
  smallOpen: number;
  /** Eye-stalk lean (x) and droop (y). */
  sx: number;
  sy: number;
  /** Legs splay outwards by this many px (faint). */
  splay: number;
  eyes: Eyes;
  mouth: Mouth;
}

const REST: Pose = { bx: 0, by: 0, breath: 0, bits: 1, big: 0, bigOpen: 0.6, small: 0, smallOpen: 0.5, sx: 0, sy: 0, splay: 0, eyes: "open", mouth: "shut" };

const EYES: Record<Eyes, string[]> = {
  open: [".kk.", "kwYk", "kkYk", ".kk."],
  fierce: ["kkk.", "kwYk", "kkYk", ".kk."],
  shut: ["....", "k..k", ".kk.", "...."],
  ko: ["k..k", ".kk.", ".kk.", "k..k"],
};

/** A walking leg: hip on the shell, knee out, foot on the ground. */
function leg(p: Painter, hip: [number, number], knee: [number, number], foot: [number, number], far: boolean) {
  p.tube([hip, knee, foot], [far ? 3 : 3.6, far ? 2.6 : 3, 1.3], SHELL, { rim: "D", bias: far ? -0.3 : 0 });
  // a pale joint at the knee
  p.set(knee[0], knee[1] - 1, "K");
}

function legs(p: Pose, pp: Painter, far: boolean, X: (x: number) => number) {
  const y0 = 64 + p.by;
  const s = p.splay;
  // three legs a side, the far ones tucked behind and shorter
  const sets: [number, number, number][] = far
    ? [
        [32, 20, 18],
        [64, 76, 78],
      ]
    : [
        [27, 9, 6],
        [33, 17, 15],
        [63, 79, 81],
        [69, 87, 90],
      ];
  sets.forEach(([hx, kx, fx], i) => {
    const side = hx < 48 ? -1 : 1;
    const ky = y0 - 6 + (i % 2) * 4 + (far ? -2 : 0);
    const fy = far ? 86 : 89 - (i % 2) * 2;
    // splayed feet stay inside the frame
    const foot = Math.max(4, Math.min(92, fx + side * s));
    leg(pp, [X(hx), y0 + (i % 2) * 2], [X(Math.max(6, Math.min(90, kx + side * s * 0.5))), ky + s * 0.3], [X(foot), Math.min(fy + s * 0.2, 91)], far);
  });
}

/** A claw on its arm: shoulder → elbow → palm, with two fingers that open into a V. */
function claw(p: Painter, pose: Pose, big: boolean, X: (x: number) => number, back: boolean) {
  const lift = big ? pose.big : pose.small;
  const open = big ? pose.bigOpen : pose.smallOpen;
  const r = big ? 1.18 : 0.64;
  const sh: [number, number] = big ? [23, 61] : [73, 61];
  const el: [number, number] = big ? [15, 54 - lift * 0.4] : [80, 54 - lift * 0.4];
  const pc: [number, number] = big ? [17, 38 - lift] : [80, 42 - lift];
  const by = pose.by;
  p.tube(
    [
      [X(sh[0]) + pose.bx, sh[1] + by],
      [X(el[0]) + pose.bx, el[1] + by],
      [X(pc[0]) + pose.bx, pc[1] + 6 * r + by],
    ],
    [4.2 * r, 3.6 * r, 4 * r],
    SHELL,
    { rim: "D", bias: back ? -0.1 : 0 },
  );
  const cx = X(pc[0]) + pose.bx;
  const cy = pc[1] + by;
  // the two fingers: the outer one fixed, the inner one swings shut
  const spread = (3 + open * 7) * r;
  const dir = X(1) - X(0);
  const outer: [number, number] = [cx - spread * 0.55 * dir, cy - 14 * r];
  const inner: [number, number] = [cx + spread * 0.75 * dir, cy - 13 * r + (1 - open) * 2];
  p.tube(
    [
      [cx - 3 * r * dir, cy - 2],
      [outer[0], outer[1]],
    ],
    [4.6 * r, 1.3],
    SHELL,
    { rim: "D" },
  );
  p.tube(
    [
      [cx + 3 * r * dir, cy - 1],
      [inner[0], inner[1]],
    ],
    [3.8 * r, 1.2],
    SHELL,
    { rim: "D", bias: -0.05 },
  );
  // the palm over the finger roots
  p.ellipse(cx, cy + 1, 9 * r, 7.5 * r, SHELL, { rim: "D", rot: -0.25 * dir });
  // dark claw tips with a pale cutting edge
  for (const [tx, ty] of [outer, inner]) {
    p.set(tx, ty, "D");
    p.set(tx, ty + 1, "C");
  }
  // serrations on the inner edge of the fixed finger
  if (big) for (let k = 0; k < 3; k++) p.set(Math.round(cx + dir * (1 - k * 0.6)), Math.round(cy - 5 - k * 3), "J");
  // the CIDR slash etched on the big claw's palm (front only)
  if (big && !back) p.stamp(Math.round(cx - 2), Math.round(cy - 1), ["....J", "...JD", "..JD.", ".JD..", "JD..."]);
}

function stalks(p: Painter, pose: Pose, back: boolean) {
  const y0 = 46 + pose.by;
  for (const [x, lean] of [
    [41, -1],
    [55, 1],
  ] as const) {
    const bx = x + pose.bx;
    const top: [number, number] = [bx + lean * 2 + pose.sx, 30 + pose.by + pose.sy];
    p.tube([[bx, y0], top], [2.4, 1.8], UNDER, { rim: "L" });
    p.ellipse(top[0], top[1] - 2, 4.6, 4.6, back ? SHELL : "JKL", { rim: "D" });
    if (!back) p.stamp(Math.round(top[0] - 2), Math.round(top[1] - 4), EYES[pose.eyes]);
    else p.ellipse(top[0] + 0.5, top[1] - 1, 2.6, 2.6, "CD", { clip: true });
  }
  if (!back && pose.eyes === "fierce") {
    // angry brow ridges above the eyes
    p.stamp(Math.round(41 + pose.bx - 2 + pose.sx - 2), Math.round(30 + pose.by + pose.sy - 8), ["DD...", "..D.."]);
    p.stamp(Math.round(55 + pose.bx + pose.sx), Math.round(30 + pose.by + pose.sy - 8), ["..DD.", ".D..."]);
  }
}

function shell(p: Painter, pose: Pose, back: boolean) {
  const cx = 48 + pose.bx;
  const cy = 58 + pose.by;
  const rx = 29 + pose.breath;
  const ry = 15 + pose.breath;
  // the carapace: broad and flat, with spiky rim points at the sides
  p.ellipse(cx, cy, rx, ry, SHELL, { rim: "D" });
  for (const side of [-1, 1]) {
    p.polygon(
      [
        [cx + side * (rx - 4), cy - 6],
        [cx + side * (rx + 4), cy - 3],
        [cx + side * (rx - 2), cy + 1],
      ],
      "C",
    );
  }
  // a raised central ridge catches the light
  p.ellipse(cx - 2, cy - 6, rx * 0.55, ry * 0.42, SHELL, { clip: true, bias: 0.25 });
  if (!back) {
    // pale underside showing below the rim, with mouthparts
    p.ellipse(cx, cy + 9, 17, 5.5, UNDER, { clip: true, bias: 0.1 });
    const m = pose.mouth;
    if (m === "open") {
      p.ellipse(cx, cy + 6, 6, 3.4, "RS", { rim: "S" });
      p.stamp(Math.round(cx - 5), Math.round(cy + 3), ["J........J", ".J......J."]);
    } else if (m === "grit") p.stamp(Math.round(cx - 5), Math.round(cy + 5), ["kkkkkkkkkkk", ".J.J.J.J.J."]);
    else p.stamp(Math.round(cx - 4), Math.round(cy + 5), ["k.......k", ".kkkkkkk."]);
  } else {
    // seen from behind: plate seams across the back of the shell
    for (const dx of [-14, 0, 14]) p.stamp(Math.round(cx + dx), Math.round(cy + 2), ["C", "C", "D"]);
  }
  // barnacles crusting the shell
  const bar: [number, number][] = back
    ? [
        [cx + 14, cy - 8],
        [cx - 18, cy - 4],
      ]
    : [
        [cx + 19, cy - 10],
        [cx + 24, cy - 5],
      ];
  for (const [x, y] of bar) {
    p.ellipse(x, y, 2.6, 2.2, "GH", { rim: "H" });
    p.set(x, y - 1, "H");
  }
  // the bit-lamps: the last octet of the mask, bit 7 on the left
  const ly = Math.round(cy - 3);
  LAMPS.forEach((lx, i) => {
    const x = Math.round((back ? 96 - lx - 2 : lx) + pose.bx);
    const on = pose.bits >= 8 || i < pose.bits;
    p.stamp(x - 1, ly - 1, ["DDDDD", "D...D", "D...D", "DDDDD"]);
    p.stamp(x, ly, on ? ["gee", "eee"] : ["fff", "fff"]);
  });
  // a notch between the network and host bits marks the mask boundary
  if (pose.bits > 0 && pose.bits < 8) {
    const a = back ? 96 - LAMPS[pose.bits - 1] - 2 : LAMPS[pose.bits - 1];
    const b = back ? 96 - LAMPS[pose.bits] - 2 : LAMPS[pose.bits];
    const nx = Math.round((a + b) / 2 + 1.5 + pose.bx);
    p.stamp(nx, ly - 4, ["J", "J", "K"]);
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  const X = (x: number) => (back ? 96 - x : x);
  if (back) {
    // from behind the claws and eyes are on the far side of the shell
    claw(p, pose, true, X, true);
    claw(p, pose, false, X, true);
    stalks(p, pose, true);
    legs(pose, p, true, X);
    shell(p, pose, true);
    legs(pose, p, false, X);
  } else {
    legs(pose, p, true, X);
    stalks(p, pose, false);
    shell(p, pose, false);
    legs(pose, p, false, X);
    claw(p, pose, false, X, false);
    claw(p, pose, true, X, false);
  }
  p.outline("o");
  // drawn with the big claw on the left; foes face right in their art because
  // the stage mirrors them (facing −1), so in battle the big claw leads
  if (!back) p.mirror();
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  return {
    // borrow one more host bit each frame: /25 → /26 → /27 → /28
    idle: [
      f({ bits: 1 }),
      f({ bits: 2, breath: 1, big: 1, bigOpen: 0.75 }),
      f({ bits: 3, breath: 1, big: 2, bigOpen: 0.9, small: 1, sy: 1 }),
      f({ bits: 4, big: 1, bigOpen: 0.7, small: 1, smallOpen: 0.7 }),
    ],
    attack: [
      f({ bits: 8, bx: 2, big: 7, bigOpen: 1, small: 4, smallOpen: 1, eyes: "fierce", mouth: "open", sy: -1 }),
      f({ bits: 8, bx: -3, by: 1, big: 3, bigOpen: 0, small: 2, smallOpen: 0, eyes: "fierce", mouth: "grit", sx: -2 }),
    ],
    hurt: [
      f({ bits: -1, bx: 3, by: -1, big: -2, bigOpen: 0.2, small: -2, smallOpen: 0.2, eyes: "shut", mouth: "grit", sx: 3, sy: 2 }),
      f({ bits: -1, bx: 1, big: -1, bigOpen: 0.3, eyes: "shut", mouth: "grit", sx: 1, sy: 1 }),
    ],
    faint: [
      f({ bits: -1, by: 3, big: -6, bigOpen: 0.1, small: -6, smallOpen: 0.1, eyes: "ko", mouth: "open", sx: -3, sy: 6, splay: 3 }),
      f({ bits: -1, by: 6, big: -9, bigOpen: 0, small: -8, smallOpen: 0, eyes: "ko", mouth: "open", sx: -5, sy: 11, splay: 6 }),
    ],
  };
}

export const CIDRAB: CreatureArt = {
  id: "cidrab",
  name: "Cidrab",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "SUBNET SNIP",
  blurb: "Warden of Octet Harbor. Eight bit-lamps on its shell show its mask, and it snips address blocks in two with its slash-marked claw.",
};
