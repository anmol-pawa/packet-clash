import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Pingkit, the starter: a teal kit fox whose fluffy tail ends in a glowing
 * bundle of optical fibre. It wears a red collar with a little gold jack tag
 * and has a Wi-Fi-arc marking on its forehead. Original design.
 *
 * Built with the shaded-primitive painter, so every animation frame is the
 * same drawing in a different pose.
 */
const PALETTE = {
  o: "#161230",
  // body ramp, highlight → shadow
  A: "#e6fdff",
  B: "#8fe6f2",
  C: "#3fb2cf",
  D: "#2a7aa6",
  E: "#1f4f7d",
  // cream fur
  F: "#fffaf0",
  G: "#f4dfb6",
  H: "#cfae82",
  // inner ear
  I: "#5a5aa8",
  J: "#2e2c66",
  // eyes
  k: "#120e26",
  w: "#ffffff",
  i: "#5b3fc4",
  j: "#9d86ff",
  // fibre glow
  M: "#fffbd1",
  N: "#ffe45c",
  P: "#ffab2e",
  Q: "#f2681f",
  // collar + tag
  R: "#ff5c7a",
  S: "#c22e57",
  T: "#ffe9a3",
  U: "#d6a23d",
  p: "#ff9fbf",
};

const BODY = "ABCDE";
const CREAM = "FGH";
const EAR_IN = "IJ";
const GLOW = "MNPQ";
const COLLAR = "RS";

type Eyes = "open" | "fierce" | "shut" | "ko";
type Mouth = "smile" | "open" | "frown";

interface Pose {
  /** Head offset. */
  hx: number;
  hy: number;
  /** Extra ear spread (radians) and droop (0–1). */
  ear: number;
  droop: number;
  /** Tail sway in px and fibre glow (−1 dim … 2 bright). */
  tail: number;
  glow: number;
  /** Body squash in px (breathing). */
  squash: number;
  eyes: Eyes;
  mouth: Mouth;
}

const REST: Pose = { hx: 0, hy: 0, ear: 0, droop: 0, tail: 0, glow: 0, squash: 0, eyes: "open", mouth: "smile" };

const EYES: Record<Eyes, string[]> = {
  open: [".kk.", "kwik", "kjik", "kjjk", ".kk."],
  fierce: ["kk..", "kkkk", "kwik", "kjjk", ".kk."],
  shut: ["....", "kk..", "..kk", "kk..", "...."],
  ko: ["....", "k..k", ".kk.", ".kk.", "k..k"],
};

const MOUTH: Record<Mouth, string[]> = {
  smile: ["k.k.k", ".k.k."],
  open: [".kkk.", "kRRRk", ".kSk."],
  frown: [".kkk.", "k...k"],
};

function tail(p: Painter, pose: Pose, back: boolean) {
  const s = pose.tail;
  const pts: [number, number][] = back
    ? [
        [38, 57],
        [49, 51],
        [54 + s * 0.5, 40],
        [52 + s, 29],
      ]
    : [
        [40, 54],
        [50, 48],
        [55 + s * 0.5, 37],
        [53 + s, 25],
      ];
  p.tube(pts, [4, 6, 6, 4], BODY, { rim: "E" });
  // glowing fibre tip: the last stretch of the tail
  const [x2, y2] = pts[2];
  const [x3, y3] = pts[3];
  const tx = x2 + (x3 - x2) * 0.45;
  const ty = y2 + (y3 - y2) * 0.45;
  p.tube(
    [
      [tx, ty],
      [x3, y3],
    ],
    [5.2, 4.2],
    GLOW,
    { rim: "Q", bias: 0.15 + pose.glow * 0.12 },
  );
  // fibre strands sprouting from the tip
  const tipY = Math.round(y3 - 4);
  const tipX = Math.round(x3);
  const bright = pose.glow > 0 ? "M" : "N";
  p.set(tipX - 2, tipY - 1, bright);
  p.set(tipX, tipY - 2, "M");
  p.set(tipX + 2, tipY - 1, bright);
  if (pose.glow > 0) {
    p.set(tipX, tipY - 3, "N");
    p.set(tipX - 3, tipY - 2, "N");
    p.set(tipX + 3, tipY - 2, "N");
  }
  if (pose.glow > 1) {
    p.set(tipX - 1, tipY - 4, "P");
    p.set(tipX + 2, tipY - 4, "P");
  }
}

function ears(p: Painter, pose: Pose, headY: number, back: boolean) {
  for (const side of [-1, 1]) {
    const bx = 32 + pose.hx + side * 8;
    const by = headY - 6;
    const ang = 0.32 + pose.ear + pose.droop * 1.1;
    const len = 18 - pose.droop * 5;
    const tx = bx + side * Math.sin(ang) * len;
    const ty = by - Math.cos(ang) * len;
    const mx = (bx + tx) / 2 + side * 0.5;
    const my = (by + ty) / 2;
    const pts: [number, number][] = [
      [bx, by],
      [mx, my],
      [tx, ty],
    ];
    p.tube(pts, [6, 3.6, 0.9], BODY, { rim: "E" });
    if (!back) {
      p.tube(
        [
          [bx + side * 0.5, by + 1],
          [mx, my + 1],
          [tx - side * 0.3, ty + 3],
        ],
        [3.6, 2, 0.5],
        EAR_IN,
        { clip: true },
      );
    }
    // signal LED at each ear tip
    p.set(tx, ty - 1, pose.glow >= 0 ? "N" : "P");
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(64, 64);
  const headY = 27 + pose.hy;
  const hx = 32 + pose.hx;

  if (!back) tail(p, pose, false);

  // hind legs + body
  p.ellipse(23, 57, 7, 5, BODY, { rim: "E" });
  p.ellipse(41, 57, 7, 5, BODY, { rim: "E" });
  p.ellipse(32, 47 + pose.squash * 0.5, 12.5, 12.5 - pose.squash * 0.5, BODY, { rim: "E" });
  if (!back) {
    p.ellipse(32, 51, 7, 8.5, CREAM, { clip: true });
    p.ellipse(27, 59.5, 3.6, 2.6, CREAM, { rim: "H" });
    p.ellipse(37, 59.5, 3.6, 2.6, CREAM, { rim: "H" });
    p.stamp(25, 60, ["H.H"]);
    p.stamp(35, 60, ["H.H"]);
  }

  ears(p, pose, headY, back);

  // cheek fluff, then head
  for (const side of [-1, 1])
    p.tube(
      [
        [hx + side * 11, headY + 4],
        [hx + side * 16.5, headY + 9],
      ],
      [3.4, 0.8],
      BODY,
      { rim: "E" },
    );
  p.ellipse(hx, headY, 14.5, 12, BODY, { rim: "E" });

  // collar with jack tag
  p.tube(
    [
      [hx - 10, headY + 11],
      [hx, headY + 13],
      [hx + 10, headY + 11],
    ],
    [2, 2, 2],
    COLLAR,
    { rim: "S" },
  );

  if (back) {
    // back of the head: the Wi-Fi marking wraps round and the collar clasp
    p.stamp(hx - 3, headY - 7, ["..DDD..", ".D...D.", "...D..."]);
    p.stamp(hx - 1, headY + 11, ["UU", "UU"]);
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(hx - 12, headY - 3, ["w.", ".w"]);
  } else {
    // muzzle + face
    p.ellipse(hx, headY + 5, 6.5, 4.5, CREAM, { clip: true });
    p.stamp(hx - 2, headY + 13, ["oTTo", "oTUo", ".oo."]);
    p.stamp(hx - 3, headY - 9, ["..NNN..", ".N...N.", "...N..."]);
    const eye = EYES[pose.eyes];
    p.stamp(hx - 9, headY - 2, eye);
    p.stamp(hx + 5, headY - 2, eye, { flip: pose.eyes !== "open" && pose.eyes !== "fierce" ? true : false });
    if (pose.eyes === "fierce") {
      // keep the highlight on the upper left for both eyes
      p.stamp(hx + 5, headY - 2, ["..kk", "kkkk"]);
    }
    p.stamp(hx - 1, headY + 3, ["kk"]);
    p.stamp(hx - 2, headY + 5, MOUTH[pose.mouth]);
    p.stamp(hx - 12, headY + 4, ["pp"]);
    p.stamp(hx + 10, headY + 4, ["pp"]);
  }

  if (back) tail(p, pose, true);

  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  return {
    idle: [
      f({}),
      f({ hy: 1, squash: 1, tail: 1, glow: 1 }),
      f({ hy: 1, squash: 1, tail: 0, glow: 2, ear: 0.08 }),
      f({ tail: -1, glow: 1 }),
    ],
    attack: [f({ hy: 2, squash: 1, ear: 0.3, eyes: "fierce", mouth: "frown", tail: -2, glow: 1 }), f({ hy: 1, ear: 0.15, eyes: "fierce", mouth: "open", tail: 2, glow: 2 })],
    hurt: [f({ hx: -2, ear: 0.45, droop: 0.2, eyes: "shut", mouth: "frown", glow: -1 }), f({ hx: -1, ear: 0.3, eyes: "shut", mouth: "frown", glow: 0 })],
    faint: [f({ hy: 3, squash: 1, droop: 0.6, eyes: "ko", mouth: "frown", glow: -1 }), f({ hy: 5, squash: 2, droop: 1, eyes: "ko", mouth: "frown", glow: -1, tail: -2 })],
  };
}

export const PINGKIT: CreatureArt = {
  id: "pingkit",
  name: "Pingkit",
  size: 64,
  front: anims(false),
  back: anims(true),
  idleFps: 4,
  blurb: "Echoes every call it hears. Its fibre-optic tail flashes brighter the faster the reply comes back.",
};
