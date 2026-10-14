import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";

/**
 * Framadillo, a Link-type starter: an amber armadillo pup whose banded shell is
 * an Ethernet frame. Its six bands are the frame's fields in the order they go
 * out on the wire (preamble, destination MAC, source MAC, EtherType, payload,
 * FCS), from the head back, each with a lamp on the ridge. Its tail ends in an
 * RJ45 plug. Original design.
 *
 * Idle: the frame is serialised onto the wire, so the lamps light front to
 * back, a field group per frame, and the FCS lamp turns green (the CRC
 * matches). Attack: every field lit at once. Hurt: the FCS lamp goes red (the
 * CRC check failed and the frame is dropped).
 *
 * Drawn facing right: the stage mirrors foes so they face the player.
 */
const PALETTE = {
  o: "#1c1226",
  // shell ramp, highlight → shadow
  A: "#fff0c4",
  B: "#ffc977",
  C: "#f0953f",
  D: "#c2622a",
  E: "#7e3a1e",
  // skin
  F: "#f6d6cc",
  G: "#d9a59b",
  H: "#a96d6f",
  I: "#6c3f52",
  // cream belly
  J: "#fff8ea",
  K: "#ecd7b4",
  L: "#c3a47c",
  // eyes and nose
  k: "#140c22",
  w: "#ffffff",
  i: "#2f7fd0",
  // field lamps: off, lit glint, lit, lit shade
  x: "#56707a",
  m: "#fbfff2",
  e: "#7ff3ff",
  f: "#25b5d8",
  // FCS verdict
  g: "#7dff6a",
  r: "#ff3b4a",
  // RJ45 plug: clear housing and gold contacts
  P: "#dff6ff",
  Q: "#8fbad2",
  U: "#ffd23f",
  p: "#ff9db0",
};

const SHELL = "ABCDE";
const SHELL_DARK = "BCDE";
const SKIN = "FGHI";
const CREAM = "JKL";

/** The frame's fields, in transmission order (band 0 is next to the head). */
export const FIELDS = ["preamble", "destination MAC", "source MAC", "EtherType", "payload", "FCS"] as const;
const BANDS = FIELDS.length;
const FCS = BANDS - 1;

/** Which bands light on each idle frame: the frame goes out field by field. */
export const IDLE_FIELDS: number[][] = [[0, 1], [2, 3], [4], [5]];

type Eyes = "open" | "fierce" | "shut" | "ko";
type Lamps = "idle0" | "idle1" | "idle2" | "idle3" | "all" | "bad" | "off";

interface Pose {
  /** Whole-body offset (bob, sink). */
  dy: number;
  /** Head offset relative to the body. */
  hx: number;
  hy: number;
  /** Ear tilt (+ = back) and droop (0–1). */
  ear: number;
  droop: number;
  /** Tail swing in px. */
  tail: number;
  /** Front-leg lift in px (attack stomp). */
  step: number;
  eyes: Eyes;
  open: boolean;
  lamps: Lamps;
}

const REST: Pose = { dy: 0, hx: 0, hy: 0, ear: 0, droop: 0, tail: 0, step: 0, eyes: "open", open: false, lamps: "idle0" };

// The shell dome: centre and radii (front view; the back view is taller).
const DOME = { cx: 28, cy: 39, rx: 20, ry: 15 };
const BACK_DOME = { cx: 28, cy: 38, rx: 21.5, ry: 17 };
/** The banded part of the dome: from its tail edge to `HEAD_GAP` px short of its head edge (a plain collar plate there). */
const HEAD_GAP = 7;
const bandRange = (d: typeof DOME): [number, number] => [d.cx - d.rx + 0.5, d.cx + d.rx - HEAD_GAP];

/** Where band `b` sits along the shell (left edge, right edge) at the dome's widest row. */
function bandSpan(b: number, x0: number, x1: number): [number, number] {
  // band 0 is at the head end (right)
  const w = (x1 - x0) / BANDS;
  return [x1 - (b + 1) * w, x1 - b * w];
}

/** Top-left of each band's 3×3 lamp, per view, at rest (dy = 0). */
export const LAMP_POS: { front: [number, number][]; back: [number, number][] } = {
  front: lampPositions(DOME),
  back: lampPositions(BACK_DOME),
};

function lampPositions(d: typeof DOME): [number, number][] {
  const out: [number, number][] = [];
  const [x0, x1] = bandRange(d);
  for (let b = 0; b < BANDS; b++) {
    const [l, r] = bandSpan(b, x0, x1);
    const mid = (l + r) / 2;
    const u = (mid - d.cx) / d.rx;
    const top = d.cy - d.ry * Math.sqrt(Math.max(0, 1 - u * u));
    out.push([Math.round(mid - 1.5), Math.round(top + 2)]);
  }
  return out;
}

function lampState(lamps: Lamps, b: number): "off" | "on" | "ok" | "bad" {
  if (lamps === "off") return "off";
  if (lamps === "bad") return b === FCS ? "bad" : "off";
  if (lamps === "all") return b === FCS ? "ok" : "on";
  const lit = IDLE_FIELDS[Number(lamps.slice(4))];
  if (!lit.includes(b)) return "off";
  return b === FCS ? "ok" : "on";
}

function shell(p: Painter, pose: Pose, back: boolean) {
  const d = back ? BACK_DOME : DOME;
  const cy = d.cy + pose.dy;
  // skirt: a darker rim under the dome
  p.ellipse(d.cx, cy + 6, d.rx + 1.5, 8, "CDE", { bias: -0.1 });
  p.ellipse(d.cx, cy, d.rx, d.ry, SHELL, { rim: "E" });
  // scalloped skirt edge
  for (let x = Math.round(d.cx - d.rx); x <= d.cx + d.rx; x += 3) {
    const u = (x - d.cx) / (d.rx + 1.5);
    if (Math.abs(u) >= 1) continue;
    const y = Math.round(cy + 6 + 8 * Math.sqrt(1 - u * u)) - 1;
    if (p.get(x, y)) p.set(x, y, "E");
  }

  // bands: alternate shades, dark seams between them
  const [x0, x1] = bandRange(d);
  const top = cy - d.ry;
  const darker: Record<string, string> = { A: "B", B: "C", C: "D", D: "E", E: "E" };
  for (let y = Math.floor(top); y <= cy + d.ry; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x + 0.5 - d.cx) / d.rx;
      const v = (y + 0.5 - cy) / d.ry;
      if (u * u + v * v > 0.9) continue;
      const ch = p.get(x, y);
      if (!ch || !"ABCD".includes(ch)) continue;
      // bands curve with the dome: seams pull toward the middle near the top
      const t = Math.min(1, Math.max(0, (y - top) / (d.ry * 1.4)));
      const squeeze = 0.78 + 0.22 * t;
      const xs = d.cx + (x + 0.5 - d.cx) / squeeze;
      const pos = (x1 - xs) / ((x1 - x0) / BANDS);
      const b = Math.floor(pos);
      const frac = pos - b;
      if (b < 0 || b >= BANDS) continue;
      if (frac < 0.13 && b > 0) p.set(x, y, "E");
      else if (b % 2 === 1) p.set(x, y, darker[ch]);
    }
  // a glossy highlight at the top of each light band
  for (let b = 0; b < BANDS; b += 2) {
    const [l, r] = bandSpan(b, x0, x1);
    const mid = Math.round((l + r) / 2);
    const u = (mid - d.cx) / d.rx;
    const yTop = Math.round(cy - d.ry * Math.sqrt(Math.max(0, 1 - u * u)));
    for (const [dx, dy] of [[0, 7], [0, 8], [1, 9]]) if (p.get(mid + dx, yTop + dy) && "BC".includes(p.get(mid + dx, yTop + dy)!)) p.set(mid + dx, yTop + dy, "A");
  }

  // field lamps on the ridge
  const pos = back ? LAMP_POS.back : LAMP_POS.front;
  pos.forEach(([lx, ly], b) => {
    const s = lampState(pose.lamps, b);
    const y = ly + pose.dy;
    const rows = s === "on" ? ["fef", "eme", "fef"] : s === "ok" ? ["DgD", "gmg", "DgD"] : s === "bad" ? ["DrD", "rrr", "DrD"] : [".E.", "ExE", ".E."];
    p.stamp(lx, y, rows);
  });
}

function legs(p: Painter, pose: Pose, far: boolean) {
  const y = 56 + pose.dy * 0.5;
  if (far) {
    p.ellipse(15, y - 1, 4, 4.5, SKIN, { bias: -0.35 });
    p.ellipse(39, y - 1 - pose.step * 0.5, 4, 4.5, SKIN, { bias: -0.35 });
    return;
  }
  p.ellipse(19, y, 4.5, 5, SKIN, { rim: "I" });
  p.ellipse(44, y - pose.step, 4.5, 5, SKIN, { rim: "I" });
  // claws
  p.stamp(17, Math.round(y + 3), ["I.I.I", "LoLoL"]);
  p.stamp(42, Math.round(y + 3 - pose.step), ["I.I.I", "LoLoL"]);
}

function tail(p: Painter, pose: Pose) {
  const y = pose.dy;
  const s = pose.tail;
  p.tube(
    [
      [12, 47 + y],
      [7 - s * 0.3, 51 + y + s * 0.3],
      [4.5 - s * 0.5, 54 + y + s],
    ],
    [3, 2, 1.4],
    SKIN,
    { rim: "I" },
  );
  // RJ45 plug on the tail tip, latch up, gold contacts at the end
  const px = Math.round(1.5 - s * 0.5);
  const py = Math.round(54 + y + s);
  p.stamp(px, py, ["QPPPQ", "PPQPP", "QUQUQ", ".UUU."]);
}

function head(p: Painter, pose: Pose, back: boolean, part: "base" | "face" = "base") {
  const hx = 49 + pose.hx;
  const hy = 38 + pose.hy + pose.dy;

  // ear behind the head
  const ang = -0.45 + pose.ear + pose.droop * 1.2;
  const len = 16 - pose.droop * 4;
  const ex = hx - 2;
  const ey = hy - 5;
  const tx = ex + Math.sin(ang) * len * -1;
  const ty = ey - Math.cos(ang) * len;
  const earPts: [number, number][] = [
    [ex, ey],
    [(ex + tx) / 2 - 0.5, (ey + ty) / 2],
    [tx, ty],
  ];

  if (back) {
    // seen from behind: the head sits partly behind the shell's front edge
    p.tube(
      [
        [hx + 4, hy + 2],
        [hx + 10, hy + 6],
      ],
      [3.4, 1.8],
      SKIN,
      { rim: "I" },
    );
    p.ellipse(hx + 1, hy - 1, 9.5, 8.5, SKIN, { rim: "I" });
    p.ellipse(hx - 1, hy - 5, 7, 3.8, SHELL_DARK, { clip: true });
    p.tube(earPts, [3.2, 2.8, 1], SKIN, { rim: "I" });
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(hx + 7, hy - 6, ["w.", ".w"]);
    return;
  }

  if (part === "base") {
    // head, long snout, forehead plate
    p.ellipse(hx, hy, 9.5, 8.5, SKIN, { rim: "I" });
    p.tube(
      [
        [hx + 5, hy + 3],
        [hx + 11, hy + 7 + (pose.open ? 1 : 0)],
      ],
      [4.5, 2.2],
      SKIN,
      { rim: "I" },
    );
    p.ellipse(hx - 1, hy - 5.5, 7, 3.2, SHELL_DARK, { clip: true, bias: 0.15 });
    p.stamp(Math.round(hx - 4), Math.round(hy - 5), ["E.E.E"]);
    return;
  }
  p.tube(earPts, [3.2, 2.8, 1], SKIN, { rim: "I" });
  p.tube(
    [
      [ex - 0.2, ey - 1],
      [(ex + tx) / 2 - 0.3, (ey + ty) / 2 + 0.5],
      [tx, ty + 2],
    ],
    [2, 1.6, 0.4],
    "pH",
    { clip: true },
  );
  // nose
  p.stamp(Math.round(hx + 11), Math.round(hy + 6 + (pose.open ? 1 : 0)), ["kk", "k."]);
  // mouth
  if (pose.open) p.stamp(Math.round(hx + 4), Math.round(hy + 7), ["kkkkk", ".kppk", "..kk."]);
  else p.stamp(Math.round(hx + 5), Math.round(hy + 7), ["kk..", "..kk"]);
  // eye
  const EYE: Record<Eyes, string[]> = {
    open: [".kkk.", "kwwik", "kwiik", "kiiik", ".kkk."],
    fierce: ["kkkkk", "kkwik", "kwiik", "kiiik", ".kkk."],
    shut: [".....", ".....", "kkkkk", ".kkk.", "....."],
    ko: ["k...k", ".k.k.", "..k..", ".k.k.", "k...k"],
  };
  p.stamp(Math.round(hx + 1), Math.round(hy - 2), EYE[pose.eyes]);
  // brow line under the forehead plate
  if (pose.eyes === "fierce") p.stamp(Math.round(hx), Math.round(hy - 3), ["kkk"]);
  // cheek blush
  p.stamp(Math.round(hx - 4), Math.round(hy + 3), ["pp", "pp"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(64, 64);
  legs(p, pose, true);
  tail(p, pose);
  if (back) head(p, pose, true);
  shell(p, pose, back);
  // belly peeking under the skirt between the legs
  p.ellipse(31, 54 + pose.dy, 11, 2.6, CREAM, { rim: "L" });
  legs(p, pose, false);
  if (!back) {
    head(p, pose, false, "base");
    head(p, pose, false, "face");
  }
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  return {
    idle: [f({ lamps: "idle0" }), f({ dy: 1, hy: 0, tail: 1, lamps: "idle1" }), f({ dy: 1, hy: 1, ear: 0.1, tail: 1, lamps: "idle2" }), f({ tail: 0, lamps: "idle3" })],
    attack: [f({ hx: -2, hy: 1, ear: 0.4, eyes: "fierce", tail: -2, lamps: "all" }), f({ hx: 1, hy: 1, step: 2, ear: 0.6, eyes: "fierce", open: true, tail: 2, lamps: "all" })],
    hurt: [f({ hx: -3, hy: -1, ear: 0.5, droop: 0.2, eyes: "shut", lamps: "bad" }), f({ hx: -1, ear: 0.3, eyes: "shut", lamps: "bad" })],
    faint: [f({ dy: 2, hy: 2, droop: 0.6, eyes: "ko", lamps: "off" }), f({ dy: 4, hy: 3, droop: 1, eyes: "ko", lamps: "off", tail: -2 })],
  };
}

export const FRAMADILLO: CreatureArt = {
  id: "framadillo",
  name: "Framadillo",
  size: 64,
  front: anims(false),
  back: anims(true),
  idleFps: 4,
  blurb: "Rolls its shell bands onto the wire one field at a time. If the tail-end check doesn't match, it curls up and drops the whole frame.",
};

/** Header and trailer sizes of an Ethernet II frame, in bytes. */
export const ETHERNET = { preamble: 8, header: 14, fcs: 4, minPayload: 46, maxPayload: 1500, gap: 12 } as const;

/**
 * An Ethernet II frame carrying `payload` bytes: the padding added to reach
 * the 64-byte minimum, the frame size (header + payload + pad + FCS), and the
 * bytes the frame costs on the wire (plus preamble/SFD and the inter-frame gap).
 */
export function ethernetFrame(payload: number) {
  if (!Number.isInteger(payload) || payload < 0 || payload > ETHERNET.maxPayload) throw new RangeError(`payload must be 0–${ETHERNET.maxPayload} bytes`);
  const pad = Math.max(0, ETHERNET.minPayload - payload);
  const frame = ETHERNET.header + payload + pad + ETHERNET.fcs;
  const wire = frame + ETHERNET.preamble + ETHERNET.gap;
  return { pad, frame, wire, efficiency: payload / wire };
}
