import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";
import { ETHERNET } from "./framadillo";

/**
 * Trunkadillo, Framadillo's evolved form: a heavy bronze armadillo with a
 * steel-plated helmet and horn, spiked ridge plates and a trunk-port plug on
 * its tail. Its shell has grown a seventh band: the 802.1Q VLAN tag, slotted
 * in between the source MAC and the EtherType, exactly where a switch inserts
 * it when a frame leaves on a trunk link. Original design.
 *
 * Idle: the tagged frame goes out field by field, the tag lamp glowing violet
 * (the VLAN), then the FCS lamp turns green. Attack: every field lit. Hurt:
 * only a red FCS (the CRC failed, the frame is dropped).
 *
 * Drawn facing right: the stage mirrors foes so they face the player.
 */
const PALETTE = {
  o: "#170e1f",
  // bronze shell, highlight → shadow (deeper than Framadillo's amber)
  A: "#ffe6b0",
  B: "#f2b45a",
  C: "#d27a2f",
  D: "#9c4a22",
  E: "#5e2616",
  // skin
  F: "#ebc7bf",
  G: "#c69091",
  H: "#8f5a68",
  I: "#563248",
  // steel plates: helmet, horn, ridge spikes, plug housing
  S: "#eef4ff",
  T: "#a6bbd6",
  V: "#61739a",
  W: "#353c60",
  // eyes and nose (U doubles as the gold iris and the plug's contacts)
  k: "#120a1c",
  w: "#ffffff",
  U: "#ffd23f",
  // field lamps: off, lit glint, lit, lit shade
  x: "#56707a",
  m: "#fbfff2",
  e: "#7ff3ff",
  f: "#25b5d8",
  // VLAN tag lamp
  v: "#c88bff",
  // FCS verdict
  g: "#7dff6a",
  r: "#ff3b4a",
};

const SHELL = "ABCDE";
const SHELL_DARK = "BCDE";
const SKIN = "FGHI";
const STEEL = "STVW";

/** The 802.1Q-tagged frame's fields, in transmission order (band 0 is next to the head). */
export const TAGGED_FIELDS = ["preamble", "destination MAC", "source MAC", "802.1Q tag", "EtherType", "payload", "FCS"] as const;
const BANDS = TAGGED_FIELDS.length;
const TAG = TAGGED_FIELDS.indexOf("802.1Q tag");
const FCS = BANDS - 1;

/** Which bands light on each idle frame: the tagged frame goes out field by field. */
export const TAGGED_IDLE: number[][] = [[0, 1], [2, 3], [4, 5], [6]];

type Eyes = "open" | "fierce" | "shut" | "ko";
type Lamps = "idle0" | "idle1" | "idle2" | "idle3" | "all" | "bad" | "off";

interface Pose {
  dy: number;
  hx: number;
  hy: number;
  /** Ear tilt (+ = back) and droop (0–1). */
  ear: number;
  droop: number;
  tail: number;
  /** Front-leg lift in px (attack stomp). */
  step: number;
  eyes: Eyes;
  open: boolean;
  lamps: Lamps;
}

const REST: Pose = { dy: 0, hx: 0, hy: 0, ear: 0, droop: 0, tail: 0, step: 0, eyes: "open", open: false, lamps: "idle0" };

const DOME = { cx: 26, cy: 37, rx: 22, ry: 16 };
const BACK_DOME = { cx: 27, cy: 36, rx: 23, ry: 18 };
const HEAD_GAP = 6;
const bandRange = (d: typeof DOME): [number, number] => [d.cx - d.rx + 0.5, d.cx + d.rx - HEAD_GAP];

function bandSpan(b: number, x0: number, x1: number): [number, number] {
  const w = (x1 - x0) / BANDS;
  return [x1 - (b + 1) * w, x1 - b * w];
}

const domeTop = (d: typeof DOME, x: number) => {
  const u = (x - d.cx) / d.rx;
  return d.cy - d.ry * Math.sqrt(Math.max(0, 1 - u * u));
};

function lampPositions(d: typeof DOME): [number, number][] {
  const [x0, x1] = bandRange(d);
  return Array.from({ length: BANDS }, (_, b) => {
    const [l, r] = bandSpan(b, x0, x1);
    const mid = (l + r) / 2;
    return [Math.round(mid - 1.5), Math.round(domeTop(d, mid) + 3)] as [number, number];
  });
}

/** Top-left of each band's 3×3 lamp, per view, at rest (dy = 0). */
export const LAMP_POS: { front: [number, number][]; back: [number, number][] } = {
  front: lampPositions(DOME),
  back: lampPositions(BACK_DOME),
};

function lampState(lamps: Lamps, b: number): "off" | "on" | "tag" | "ok" | "bad" {
  if (lamps === "off") return "off";
  if (lamps === "bad") return b === FCS ? "bad" : "off";
  const lit = lamps === "all" || TAGGED_IDLE[Number(lamps.slice(4))].includes(b);
  if (!lit) return "off";
  return b === FCS ? "ok" : b === TAG ? "tag" : "on";
}

function shell(p: Painter, pose: Pose, back: boolean) {
  const d = back ? BACK_DOME : DOME;
  const cy = d.cy + pose.dy;
  const [x0, x1] = bandRange(d);

  // ridge spikes on the seams, behind the dome so only their tips show
  for (let b = 1; b < BANDS; b++) {
    const x = x1 - b * ((x1 - x0) / BANDS);
    const t = domeTop(d, x) + pose.dy;
    const lean = (x - d.cx) / d.rx;
    p.polygon(
      [
        [x - 2.5, t + 3],
        [x + 2.5, t + 3],
        [x + lean * 2.5, t - 4.5],
      ],
      "T",
    );
    p.polygon(
      [
        [x - 2.5, t + 3],
        [x - 0.3, t + 3],
        [x + lean * 2.5 - 0.2, t - 4.5],
      ],
      "S",
      { clip: true },
    );
    p.set(x + 1.5, t + 1, "V");
  }

  // skirt: a heavy darker rim under the dome
  p.ellipse(d.cx, cy + 7, d.rx + 1.5, 8, "CDE", { bias: -0.1 });
  p.ellipse(d.cx, cy, d.rx, d.ry, SHELL, { rim: "E" });
  // steel studs along the skirt edge
  for (let x = Math.round(d.cx - d.rx) + 2; x <= d.cx + d.rx - 2; x += 4) {
    const u = (x - d.cx) / (d.rx + 1.5);
    const y = Math.round(cy + 7 + 8 * Math.sqrt(Math.max(0, 1 - u * u))) - 2;
    if (p.get(x, y)) p.stamp(x, y, ["TV"]);
  }

  // bands: alternate shades with dark seams that curve with the dome
  const top = cy - d.ry;
  const darker: Record<string, string> = { A: "B", B: "C", C: "D", D: "E", E: "E" };
  for (let y = Math.floor(top); y <= cy + d.ry; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x + 0.5 - d.cx) / d.rx;
      const v = (y + 0.5 - cy) / d.ry;
      if (u * u + v * v > 0.9) continue;
      const ch = p.get(x, y);
      if (!ch || !"ABCD".includes(ch)) continue;
      const t = Math.min(1, Math.max(0, (y - top) / (d.ry * 1.4)));
      const xs = d.cx + (x + 0.5 - d.cx) / (0.78 + 0.22 * t);
      const pos = (x1 - xs) / ((x1 - x0) / BANDS);
      const b = Math.floor(pos);
      if (b < 0 || b >= BANDS) continue;
      if (pos - b < 0.16 && b > 0) p.set(x, y, "E");
      else if (b === TAG) p.set(x, y, ch === "A" || ch === "B" ? "T" : ch === "C" ? "V" : "W");
      else if (b % 2 === 1) p.set(x, y, darker[ch]);
    }

  // field lamps on the ridge
  (back ? LAMP_POS.back : LAMP_POS.front).forEach(([lx, ly], b) => {
    const s = lampState(pose.lamps, b);
    const rows = { on: ["fef", "eme", "fef"], tag: ["WvW", "vmv", "WvW"], ok: ["DgD", "gmg", "DgD"], bad: ["DrD", "rrr", "DrD"], off: [".E.", "ExE", ".E."] }[s];
    p.stamp(lx, ly + pose.dy, rows);
  });
}

function legs(p: Painter, pose: Pose, far: boolean) {
  const y = 55.5 + pose.dy * 0.5;
  if (far) {
    p.ellipse(13, y - 1.5, 4.5, 5, SKIN, { bias: -0.35 });
    p.ellipse(37, y - 1.5 - pose.step * 0.5, 4.5, 5, SKIN, { bias: -0.35 });
    return;
  }
  for (const [lx, lift] of [
    [18, 0],
    [42, pose.step],
  ]) {
    p.ellipse(lx, y - lift, 5.5, 5.5, SKIN, { rim: "I" });
    // steel greave on the upper leg
    p.ellipse(lx, y - lift - 3, 5, 2.2, STEEL, { clip: true, bias: 0.2 });
    p.stamp(lx - 3, Math.round(y - lift + 3), ["S.S.S", "WoWoW"]);
  }
}

function tail(p: Painter, pose: Pose) {
  const y = pose.dy;
  const s = pose.tail;
  p.tube(
    [
      [9, 46 + y],
      [5 - s * 0.3, 50 + y + s * 0.3],
      [3.5 - s * 0.5, 54 + y + s],
    ],
    [3.6, 2.6, 1.8],
    SKIN,
    { rim: "I" },
  );
  // armour rings on the tail
  p.stamp(Math.round(6 - s * 0.3), Math.round(48 + y), ["TT", "VV"]);
  // trunk-port plug on the tail tip: steel housing, latch up, gold contacts
  const px = Math.round(1.5 - s * 0.5);
  const py = Math.round(54 + y + s);
  p.stamp(px, py, ["VSSSV", "STVTS", "VUVUV", ".UUU."]);
}

function head(p: Painter, pose: Pose, back: boolean, part: "ear" | "base" | "face" = "base") {
  const hx = 50 + pose.hx;
  const hy = 35 + pose.hy + pose.dy;

  // short armoured ear swept back
  const ang = 0.3 + pose.ear * 0.6 + pose.droop * 0.8;
  const len = 8 - pose.droop * 2;
  const ex = hx - 5;
  const ey = hy - 3;
  const tx = ex - Math.sin(ang) * len;
  const ty = ey - Math.cos(ang) * len;
  const earPts: [number, number][] = [
    [ex, ey],
    [(ex + tx) / 2, (ey + ty) / 2],
    [tx, ty],
  ];
  // horn on the helmet, curving forward
  const horn = (): void => {
    p.tube(
      [
        [hx + 3, hy - 6],
        [hx + 5, hy - 12],
        [hx + 9, hy - 15 + pose.droop * 4],
      ],
      [2.8, 1.8, 0.7],
      STEEL,
      { rim: "W" },
    );
  };

  if (back) {
    p.tube(
      [
        [hx + 4, hy + 2],
        [hx + 9, hy + 6],
      ],
      [3.6, 2],
      SKIN,
      { rim: "I" },
    );
    p.ellipse(hx + 1, hy, 9, 8.5, SKIN, { rim: "I" });
    p.ellipse(hx, hy - 4, 8, 4.5, STEEL, { clip: true, bias: 0.1 });
    p.tube(earPts, [3, 2.6, 1], SKIN, { rim: "I" });
    horn();
    if (pose.eyes === "ko" || pose.eyes === "shut") p.stamp(hx + 7, hy - 5, ["w.", ".w"]);
    return;
  }

  if (part === "ear") {
    // behind the shell's front edge, so it never covers the ridge lamps
    p.tube(earPts, [3, 2.6, 1], SKIN, { rim: "I" });
    p.tube(
      [
        [ex - 0.2, ey - 1],
        [(ex + tx) / 2, (ey + ty) / 2 + 0.5],
        [tx, ty + 1.5],
      ],
      [1.8, 1.4, 0.4],
      "H",
      { clip: true },
    );
    return;
  }
  if (part === "base") {
    p.ellipse(hx, hy, 9, 8.5, SKIN, { rim: "I" });
    p.tube(
      [
        [hx + 4, hy + 3],
        [hx + 9.5, hy + 6 + (pose.open ? 1 : 0)],
      ],
      [4.8, 2.4],
      SKIN,
      { rim: "I" },
    );
    // steel helmet over the brow, bronze plate behind it
    p.ellipse(hx - 4, hy - 3, 5, 5, SHELL_DARK, { clip: true, bias: 0.1 });
    p.ellipse(hx + 0.5, hy - 6, 7.5, 3.4, STEEL, { clip: true, bias: 0.2 });
    p.stamp(Math.round(hx - 5), Math.round(hy - 3), ["W.W.W"]);
    horn();
    return;
  }
  p.stamp(Math.round(hx + 10), Math.round(hy + 5 + (pose.open ? 1 : 0)), ["kk", "k."]);
  if (pose.open) p.stamp(Math.round(hx + 3), Math.round(hy + 7), ["kkkkkk", ".kGGGk", "..kkk."]);
  else p.stamp(Math.round(hx + 4), Math.round(hy + 7), ["kkk..", "...kk"]);
  const EYE: Record<Eyes, string[]> = {
    open: [".kkk.", "kwwUk", "kwUkk", "kUUkk", ".kkk."],
    fierce: ["kkkkk", "kkwUk", "kwUkk", "kUUkk", ".kkk."],
    shut: [".....", ".....", "kkkkk", ".kkk.", "....."],
    ko: ["k...k", ".k.k.", "..k..", ".k.k.", "k...k"],
  };
  p.stamp(Math.round(hx + 1), Math.round(hy - 2), EYE[pose.eyes]);
  // war-paint stripe under the eye
  p.stamp(Math.round(hx - 3), Math.round(hy + 3), ["HHH"]);
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(64, 64);
  legs(p, pose, true);
  tail(p, pose);
  head(p, pose, back, "ear");
  shell(p, pose, back);
  p.ellipse(30, 54 + pose.dy, 11, 2.6, "FGH", { rim: "I" });
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
    idle: [f({ lamps: "idle0" }), f({ dy: 1, tail: 1, lamps: "idle1" }), f({ dy: 1, hy: 1, ear: 0.1, tail: 1, lamps: "idle2" }), f({ lamps: "idle3" })],
    attack: [f({ hx: -2, hy: 1, ear: 0.1, eyes: "fierce", tail: -2, lamps: "all" }), f({ hx: 1, hy: 2, step: 2, ear: 0.15, eyes: "fierce", open: true, tail: 2, lamps: "all" })],
    hurt: [f({ hx: -3, hy: -1, ear: 0.5, droop: 0.2, eyes: "shut", lamps: "bad" }), f({ hx: -1, ear: 0.3, eyes: "shut", lamps: "bad" })],
    faint: [f({ dy: 2, hy: 2, droop: 0.6, eyes: "ko", lamps: "off" }), f({ dy: 4, hy: 3, droop: 1, eyes: "ko", lamps: "off", tail: -2 })],
  };
}

export const TRUNKADILLO: CreatureArt = {
  id: "trunkadillo",
  name: "Trunkadillo",
  size: 64,
  front: anims(false),
  back: anims(true),
  idleFps: 4,
  blurb: "Guards the trunk between switches. It slips a violet VLAN tag into every frame's shell so the far side knows which network it belongs to.",
};

/** The 802.1Q tag: a 2-byte TPID (0x8100) and a 2-byte TCI. */
export const DOT1Q = { tagBytes: 4, tpid: 0x8100, maxFrame: 1522 } as const;

/**
 * An 802.1Q tag's 16-bit TCI: priority (PCP, 3 bits), drop eligible (DEI,
 * 1 bit) and VLAN ID (12 bits). VIDs 0 and 4095 are reserved, so a VLAN is
 * 1–4094.
 */
export function vlanTci(pcp: number, dei: 0 | 1, vid: number): number {
  if (!Number.isInteger(pcp) || pcp < 0 || pcp > 7) throw new RangeError("PCP must be 0–7");
  if (!Number.isInteger(vid) || vid < 1 || vid > 4094) throw new RangeError("VLAN ID must be 1–4094");
  return (pcp << 13) | (dei << 12) | vid;
}

/**
 * A tagged Ethernet frame carrying `payload` bytes. The tag adds 4 bytes to
 * the header but the 64-byte minimum frame stays, so only 42 bytes of payload
 * are needed; the largest tagged frame is 1522 bytes.
 */
export function taggedFrame(payload: number) {
  if (!Number.isInteger(payload) || payload < 0 || payload > ETHERNET.maxPayload) throw new RangeError(`payload must be 0–${ETHERNET.maxPayload} bytes`);
  const header = ETHERNET.header + DOT1Q.tagBytes;
  const minPayload = 64 - header - ETHERNET.fcs;
  const pad = Math.max(0, minPayload - payload);
  const frame = header + payload + pad + ETHERNET.fcs;
  return { pad, frame, wire: frame + ETHERNET.preamble + ETHERNET.gap };
}
