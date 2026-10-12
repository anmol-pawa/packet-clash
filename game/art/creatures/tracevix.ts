import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Tracevix, Pingkit's evolved form: a tall, sitting fox with long antenna
 * ears, a cream ruff streaked with gold fibre, a jack amulet and two
 * fibre-optic tails. The Wi-Fi mark has grown into a row of three "hop"
 * lights across the forehead (a traceroute). Original design.
 *
 * Same painter approach as Pingkit, so its frames are re-posed drawings.
 */
const PALETTE = {
  o: "#120e2a",
  // body ramp, highlight → shadow (deeper and bluer than Pingkit)
  A: "#c8f4ff",
  B: "#58c2e6",
  C: "#2a86c0",
  D: "#22549a",
  E: "#1a3270",
  // cream ruff + muzzle
  F: "#fffaf0",
  G: "#f1d9ad",
  H: "#c9a275",
  // inner ear
  I: "#6b55b8",
  J: "#33276e",
  // eyes
  k: "#0e0a22",
  w: "#ffffff",
  i: "#d9455f",
  j: "#ff9aa8",
  // fibre glow
  M: "#fffbd1",
  N: "#ffe45c",
  P: "#ffab2e",
  Q: "#f2681f",
  // amulet
  T: "#ffe9a3",
  U: "#d6a23d",
  V: "#8a5a1e",
  p: "#ff9fbf",
  // mouth
  R: "#ff5c7a",
  S: "#c22e57",
};

const BODY = "ABCDE";
const CREAM = "FGH";
const EAR_IN = "IJ";
const GLOW = "MNPQ";

type Eyes = "open" | "fierce" | "shut" | "ko";
type Mouth = "calm" | "open" | "frown";

interface Pose {
  hx: number;
  hy: number;
  ear: number;
  droop: number;
  tail: number;
  glow: number;
  squash: number;
  eyes: Eyes;
  mouth: Mouth;
}

const REST: Pose = { hx: 0, hy: 0, ear: 0, droop: 0, tail: 0, glow: 0, squash: 0, eyes: "open", mouth: "calm" };

// Left eye (the right one is mirrored, with the highlight kept upper left).
const EYES: Record<Eyes, string[]> = {
  open: ["kkk..", "kwiik", ".kjik", "..kk."],
  fierce: ["kk...", "kkkkk", ".kwik", "..kk."],
  shut: [".....", "kkkk.", "..kkk", "....."],
  ko: ["k...k", ".k.k.", "..k..", ".k.k."],
};

const MOUTH: Record<Mouth, string[]> = {
  calm: ["k...k", ".kkk."],
  open: [".kkkk.", "kRRRRk", ".kSSk."],
  frown: [".kkk.", "k...k"],
};

function tails(p: Painter, pose: Pose, back: boolean) {
  const s = pose.tail;
  const dy = back ? 3 : 0;
  // the main tail sweeps up on the right, the second one fans out lower
  const main: [number, number][] = [
    [40, 55 + dy],
    [50, 50 + dy],
    [55 + s * 0.5, 38 + dy],
    [53 + s, 24 + dy],
  ];
  const second: [number, number][] = [
    [24, 56 + dy],
    [13, 52 + dy],
    [7 - s * 0.3, 42 + dy],
    [9 - s * 0.6, 31 + dy],
  ];
  for (const [pts, r] of [
    [second, [3.5, 4.8, 4.6, 3.6]],
    [main, [4, 6, 6, 4.2]],
  ] as const) {
    p.tube(pts as [number, number][], r as unknown as number[], BODY, { rim: "E" });
    const [x2, y2] = pts[2];
    const [x3, y3] = pts[3];
    const tx = x2 + (x3 - x2) * 0.4;
    const ty = y2 + (y3 - y2) * 0.4;
    p.tube(
      [
        [tx, ty],
        [x3, y3],
      ],
      [r[2] * 0.9, r[3]],
      GLOW,
      { rim: "Q", bias: 0.15 + pose.glow * 0.12 },
    );
  }
  // fibre strands at the main tip
  const [x3, y3] = main[3];
  const tipX = Math.round(x3);
  const tipY = Math.round(y3 - 4);
  const bright = pose.glow > 0 ? "M" : "N";
  p.set(tipX - 2, tipY - 1, bright);
  p.set(tipX, tipY - 2, "M");
  p.set(tipX + 2, tipY - 1, bright);
  if (pose.glow > 0) {
    p.set(tipX - 3, tipY - 3, "N");
    p.set(tipX + 3, tipY - 3, "N");
    p.set(tipX, tipY - 4, "N");
  }
  if (pose.glow > 1) {
    p.set(tipX - 1, tipY - 6, "P");
    p.set(tipX + 2, tipY - 6, "P");
  }
}

function ears(p: Painter, pose: Pose, headY: number, back: boolean) {
  for (const side of [-1, 1]) {
    const bx = 32 + pose.hx + side * 7;
    const by = headY - 5;
    const ang = 0.24 + pose.ear + pose.droop * 1.2;
    const len = 14 - pose.droop * 5;
    const tx = bx + side * Math.sin(ang) * len;
    const ty = by - Math.cos(ang) * len;
    const mx = (bx + tx) / 2 + side * 0.8;
    const my = (by + ty) / 2;
    p.tube(
      [
        [bx, by],
        [mx, my],
        [tx, ty],
      ],
      [5.6, 3.4, 0.8],
      BODY,
      { rim: "E" },
    );
    if (!back) {
      p.tube(
        [
          [bx + side * 0.4, by + 1],
          [mx, my + 1],
          [tx - side * 0.2, ty + 3],
        ],
        [3.4, 1.8, 0.5],
        EAR_IN,
        { clip: true },
      );
    }
    // antenna segments down the outer edge and an LED on the tip
    const ex = Math.round(bx + side * Math.sin(ang) * len * 0.45 + side * 3);
    const ey = Math.round(by - Math.cos(ang) * len * 0.45);
    p.set(ex, ey, "D");
    p.set(ex, ey + 1, "D");
    p.set(tx, ty - 1, pose.glow >= 0 ? "M" : "P");
    p.set(tx, ty, pose.glow >= 0 ? "N" : "Q");
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(64, 64);
  const headY = 21 + pose.hy;
  const hx = 32 + pose.hx;

  if (!back) tails(p, pose, false);

  // haunches, chest and front legs (sitting upright)
  p.ellipse(22, 55, 8, 6, BODY, { rim: "E" });
  p.ellipse(42, 55, 8, 6, BODY, { rim: "E" });
  p.ellipse(32, 44 + pose.squash * 0.5, 10.5, 13 - pose.squash * 0.5, BODY, { rim: "E" });
  if (!back) p.ellipse(32, 47, 6, 9, CREAM, { clip: true });
  for (const side of [-1, 1]) {
    p.tube(
      [
        [32 + side * 7, 45],
        [32 + side * 7, 58],
      ],
      [4, 3.4],
      BODY,
      { rim: "E" },
    );
    p.ellipse(32 + side * 7, 59.5, 4, 2.6, CREAM, { rim: "H" });
  }
  if (!back) {
    p.stamp(24, 60, ["H.H"]);
    p.stamp(38, 60, ["H.H"]);
  }

  ears(p, pose, headY, back);

  // the ruff: a cream collar of tufts under the head
  for (const i of [-2, 2, -1, 1, 0]) {
    const x = hx + i * 4.6;
    const y = headY + 13 + (2 - Math.abs(i)) * 1.3;
    p.ellipse(x, y, 4.2, 4.8, CREAM, { rim: "H" });
  }
  for (const i of [-1, 0, 1]) {
    const x = hx + i * 5;
    p.polygon(
      [
        [x - 2.5, headY + 18],
        [x + 2.5, headY + 18],
        [x + i, headY + 23 - Math.abs(i)],
      ],
      "G",
    );
  }
  // gold fibre streaks in the ruff
  p.stamp(hx - 9, headY + 13, ["N...", ".P..", "..P."]);
  p.stamp(hx + 6, headY + 13, ["...N", "..P.", ".P.."]);

  // cheek fluff, then head and muzzle
  for (const side of [-1, 1])
    p.tube(
      [
        [hx + side * 10, headY + 3],
        [hx + side * 16, headY + 7],
      ],
      [3.2, 0.8],
      BODY,
      { rim: "E" },
    );
  p.ellipse(hx, headY, 13.5, 11, BODY, { rim: "E" });

  if (back) {
    // back of the head: hop lights running down the nape, the amulet cord
    p.stamp(hx - 1, headY - 6, ["NN", "..", "NN", "..", "PP"]);
    p.stamp(hx - 7, headY + 10, ["VV.........VV"]);
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(hx - 13, headY - 4, ["w.", ".w"]);
  } else {
    p.ellipse(hx, headY + 6.5, 5.5, 5, CREAM, { rim: "H" });
    // forehead hop lights: three dots joined by a trace
    p.stamp(hx - 4, headY - 8, ["M...M...M", "NEEENEEEN"]);
    const eye = EYES[pose.eyes];
    p.stamp(hx - 9, headY - 1, eye);
    p.stamp(hx + 5, headY - 1, eye, { flip: true });
    if (pose.eyes === "open") p.stamp(hx + 6, headY, ["wi"]);
    if (pose.eyes === "fierce") p.stamp(hx + 6, headY + 1, ["wi"]);
    p.stamp(hx - 1, headY + 4, ["kk"]);
    p.stamp(hx - 2, headY + 6, MOUTH[pose.mouth]);
    p.stamp(hx - 11, headY + 4, ["pp"]);
    p.stamp(hx + 9, headY + 4, ["pp"]);
    // jack amulet on the ruff
    p.stamp(hx - 2, headY + 14, ["oTTo", "oTUo", "oUVo", ".oo."]);
  }

  if (back) tails(p, pose, true);

  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  return {
    idle: [f({}), f({ hy: 1, squash: 1, tail: 1, glow: 1 }), f({ hy: 1, squash: 1, glow: 2, ear: 0.06 }), f({ tail: -1, glow: 1 })],
    attack: [f({ hy: 2, squash: 1, ear: 0.28, eyes: "fierce", mouth: "frown", tail: -2, glow: 1 }), f({ hy: 1, ear: 0.12, eyes: "fierce", mouth: "open", tail: 2, glow: 2 })],
    hurt: [f({ hx: -2, ear: 0.45, droop: 0.2, eyes: "shut", mouth: "frown", glow: -1 }), f({ hx: -1, ear: 0.3, eyes: "shut", mouth: "frown", glow: 0 })],
    faint: [f({ hy: 3, squash: 1, droop: 0.6, eyes: "ko", mouth: "frown", glow: -1 }), f({ hy: 6, squash: 2, droop: 1, eyes: "ko", mouth: "frown", glow: -1, tail: -2 })],
  };
}

export const TRACEVIX: CreatureArt = {
  id: "tracevix",
  name: "Tracevix",
  size: 64,
  front: anims(false),
  back: anims(true),
  idleFps: 4,
  blurb: "Pingkit's evolved form. The three lights on its brow blink once for every hop a message takes to reach its goal.",
};
