import { Painter } from "@/lib/paint";
import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet, CreatureArt } from "../creature";
import { evaluateAcl, parseAclLine, type AclAction, type AclPacket } from "@/lib/net/acl";
import { parseIp } from "@/lib/net/ipv4";

/**
 * Aclaw, the gym 13 boss of Shield Haven: a rose-armoured gatekeeper crab.
 * Its left claw wears a red X (deny), its right claw a green tick (permit).
 * The shell is a four-line access list, read top to bottom: three written
 * lines and the implicit `deny ip any any` at the bottom. Its idle loop sends
 * a probe packet down the list; the first line that matches lights up (first
 * match wins) and the matching claw glows. A packet that matches nothing falls
 * through to the dashed implicit-deny line.
 *
 * On the attack every lamp and both claws flash; hurt and faint go dark.
 * Original design.
 *
 * 96×96 like every boss, built with the shaded-primitive painter. Drawn
 * facing right; the stage mirrors foes so in battle it faces the player.
 */
const PALETTE = {
  o: "#1a0b1c",
  // rose armour, highlight → shadow
  L: "#f6a8c4",
  M: "#d8708f",
  N: "#9c4468",
  O: "#5a2444",
  // pale shield plate, highlight → shadow
  U: "#fff0e8",
  V: "#e8c0c8",
  W: "#a98096",
  // lamps: permit green (lit, dim, edge), deny red (lit, dim, edge)
  g: "#5cf08a",
  G: "#1f5a3a",
  H: "#1f8f4e",
  r: "#ff5c5c",
  R: "#5a1f2a",
  Q: "#a02430",
  y: "#f4fff6",
  // dark plates (hurt, faint)
  f: "#3a2a44",
  t: "#6a5878",
  // eyes
  w: "#ffffff",
  b: "#0b0d10",
};

const SKIN = "LMNO";
const PALE = "UVW";

type Pt = [number, number];

/** The shell's access list: three written lines, then the implicit deny. */
export const ACL_LINES: readonly string[] = ["permit tcp 10.1.1.0 0.0.0.255 any eq 443", "deny icmp any any", "permit udp any any eq 53"];
const ACL = ACL_LINES.map(parseAclLine);

/** Probe packets the idle loop sends, one per frame. */
export const PROBES: readonly AclPacket[] = [
  { protocol: "tcp", src: parseIp("10.1.1.7"), dst: parseIp("203.0.113.9"), dstPort: 443 },
  { protocol: "icmp", src: parseIp("10.1.1.7"), dst: parseIp("203.0.113.9") },
  { protocol: "udp", src: parseIp("172.16.4.2"), dst: parseIp("8.8.8.8"), dstPort: 53 },
  { protocol: "tcp", src: parseIp("172.16.4.2"), dst: parseIp("203.0.113.9"), dstPort: 22 },
];

/** Index of the shell lamp a probe lights: the first matching line, or the implicit deny (the last lamp). */
export const IMPLICIT_LINE = ACL_LINES.length;

export interface ProbeResult {
  line: number;
  action: AclAction;
}

export const probeResult = (i: number): ProbeResult => {
  const v = evaluateAcl(ACL, PROBES[i]);
  return { line: v.line ?? IMPLICIT_LINE, action: v.action };
};

/** Lamp bars: x, y of the top-left of each 21×3 bar, one per line plus the implicit deny. */
export const BAR_X = 36;
export const BAR_Y: readonly number[] = [51, 56, 61, 66];
export const BAR_W = 21;

const ACTIONS: readonly AclAction[] = [...ACL.map((e) => e.action), "deny"];

/** One 21×3 lamp bar: lit, dim or dark. The implicit-deny bar is dashed. */
export function lampBar(line: number, state: "lit" | "dim" | "dark"): string[] {
  const permit = ACTIONS[line] === "permit";
  const ch = state === "dark" ? "f" : state === "lit" ? (permit ? "g" : "r") : permit ? "G" : "R";
  const dashed = line === IMPLICIT_LINE;
  const row = [...Array(BAR_W).keys()].map((x) => (dashed && x % 4 === 3 ? "." : ch)).join("");
  return [row, row, row];
}

const GLYPH = {
  permit: ["....y", "...y.", "y.y..", ".y...", "..y.."],
  deny: ["y...y", ".y.y.", "..y..", ".y.y.", "y...y"],
};

/** A 9×7 claw badge: a green tick or red X, lit, dim or dark. */
export function clawBadge(kind: "permit" | "deny", state: "lit" | "dim" | "dark"): string[] {
  const [edge, fill, ink] =
    state === "dark" ? ["f", "f", "t"] : state === "lit" ? (kind === "permit" ? ["H", "g", "y"] : ["Q", "r", "y"]) : kind === "permit" ? ["f", "G", "g"] : ["f", "R", "r"];
  const rows = [edge.repeat(9)];
  for (const g of GLYPH[kind]) rows.push(edge + fill + g.replace(/y/g, ink).replace(/\./g, fill) + fill + edge);
  rows.push(edge.repeat(9));
  return rows;
}

type Eyes = "open" | "fierce" | "shut" | "ko";

interface Pose {
  bx: number;
  by: number;
  /** Claws lift (negative = up). */
  cy: number;
  /** How far the pincers open (0 = shut). */
  open: number;
  /** Which probe is on the list: 0..3, or -1 = dark. */
  probe: number;
  surge: boolean;
  breath: number;
  eyes: Eyes;
  crouch: number;
}

const REST: Pose = { bx: 0, by: 0, cy: 0, open: 1, probe: 0, surge: false, breath: 0, eyes: "open", crouch: 0 };

const r = Math.round;

function legs(p: Painter, pose: Pose) {
  const { bx, by, crouch } = pose;
  const set: Pt[][] = [
    [[30, 66], [20, 80], [14, 90]],
    [[37, 70], [31, 84], [26, 90]],
    [[55, 70], [61, 84], [66, 90]],
    [[63, 66], [73, 80], [80, 90]],
  ];
  for (const leg of set) {
    const pts: Pt[] = leg.map(([x, y], j) => [x + bx * (1 - j * 0.3), Math.min(90, y + by * (1 - j * 0.35) + (j ? crouch * 0.3 : 0))] as Pt);
    p.tube(pts, [4, 3, 2], SKIN, { rim: "O" });
  }
}

function shell(p: Painter, pose: Pose) {
  const { bx, by, breath } = pose;
  const cx = 46 + bx;
  const cy = 56 + by;
  p.ellipse(cx, cy, 29 + breath, 20 + breath * 0.5, SKIN, { rim: "O" });
  // armour ridge across the top of the shell
  p.ellipse(cx - 2, cy - 12, 16, 4, SKIN, { clip: true, bias: 0.3 });
  // the pale shield plate that carries the list
  p.ellipse(cx, cy + 2, 20, 13.5, PALE, { rim: "O" });
}

function claw(p: Painter, pose: Pose, side: "permit" | "deny") {
  const { bx, by, cy, open } = pose;
  const dir = side === "permit" ? 1 : -1;
  const sx = 46 + dir * 20 + bx;
  const sy = 50 + by;
  const hx = 46 + dir * 31 + bx * 1.3;
  const hy = 36 + by + cy;
  p.tube([[sx, sy], [hx - dir * 3, hy + 8]], [5, 5], SKIN, { rim: "O" });
  p.ellipse(hx, hy, 9, 9, SKIN, { rim: "O" });
  // notch the head into two pincers, wedge opening upward
  const tipY = r(hy + 1);
  const tipX = r(hx + dir * 1);
  for (let y = tipY - 12; y <= tipY; y++) {
    const half = Math.max(0, Math.floor(((tipY - y) * (0.3 + 0.2 * open)) + (y < tipY ? 0 : 0)));
    for (let x = tipX - half; x <= tipX + half; x++) if (y < tipY) p.set(x, y, null);
  }
}

function badges(p: Painter, pose: Pose) {
  const { bx, by, cy } = pose;
  const res = pose.probe >= 0 ? probeResult(pose.probe) : null;
  for (const side of ["permit", "deny"] as const) {
    const dir = side === "permit" ? 1 : -1;
    const state = pose.probe < 0 && !pose.surge ? "dark" : pose.surge || res?.action === side ? "lit" : "dim";
    const hx = r(46 + dir * 31 + bx * 1.3);
    const hy = r(36 + by + cy);
    p.stamp(hx - 4 + dir, hy + 1, clawBadge(side, state));
  }
}

function lamps(p: Painter, pose: Pose, back: boolean) {
  const { bx, by } = pose;
  const res = pose.probe >= 0 ? probeResult(pose.probe) : null;
  BAR_Y.forEach((y, line) => {
    const state = pose.probe < 0 && !pose.surge ? "dark" : pose.surge || res?.line === line ? "lit" : "dim";
    p.stamp(BAR_X + bx, y + by, lampBar(line, state));
    if (state === "lit" && !pose.surge) {
      // arrow marks the matching line
      p.stamp(BAR_X - 4 + bx, y + by, ["y..", "yy.", "y.."]);
      p.stamp(BAR_X + BAR_W + 2 + bx, y + by, ["..y", ".yy", "..y"]);
    }
  });
  if (back) return;
}

function face(p: Painter, pose: Pose, back: boolean) {
  const { bx, by } = pose;
  if (back) return;
  // eyes on stalks, leaning right
  for (const [sx, ex] of [[52, 54], [60, 63]] as const) {
    const top = 28 + by;
    p.tube([[sx + bx, 42 + by], [ex + bx, top + 3]], [2.5, 2], SKIN, { rim: "O" });
    const ey = top;
    const x0 = r(ex + bx) - 3;
    if (pose.eyes === "shut") p.stamp(x0, ey + 1, ["bbbbbb"]);
    else if (pose.eyes === "ko") p.stamp(x0, ey - 2, ["b...b", ".b.b.", "..b..", ".b.b.", "b...b"]);
    else {
      p.stamp(x0, ey - 3, [".wwww.", "wwwwww", "wwwbbw", "wwwbbw", "wwwwww", ".wwww."]);
      if (pose.eyes === "fierce") p.stamp(x0 - 1, ey - 5, ["OOOOOOO"]);
    }
  }
}

function draw(pose: Pose, back: boolean): SpriteDef {
  const p = new Painter(96, 96);
  legs(p, pose);
  claw(p, pose, "deny");
  shell(p, pose);
  claw(p, pose, "permit");
  face(p, pose, back);
  lamps(p, pose, back);
  badges(p, pose);
  p.outline("o");
  return p.sprite(PALETTE);
}

function anims(back: boolean): AnimSet {
  const f = (o: Partial<Pose>) => draw({ ...REST, ...o }, back);
  const bob = [
    { cy: 0, open: 1, breath: 0 },
    { cy: -1, open: 2, breath: 1 },
    { cy: 0, open: 1, breath: 1 },
    { cy: 1, open: 0, breath: 0 },
  ];
  return {
    // a probe packet walks down the list: permit, deny, permit, implicit deny
    idle: [0, 1, 2, 3].map((probe, i) => f({ ...bob[i], probe })),
    attack: [
      f({ bx: -2, cy: -6, open: 3, eyes: "fierce", surge: true }),
      f({ bx: 5, cy: 2, open: 0, eyes: "fierce", surge: true }),
    ],
    hurt: [
      f({ bx: -3, cy: 2, open: 0, eyes: "shut", probe: -1 }),
      f({ bx: -1, cy: 1, open: 0, eyes: "shut", probe: -1 }),
    ],
    faint: [
      f({ by: 3, cy: 8, open: 0, eyes: "ko", probe: -1, crouch: 3 }),
      f({ by: 6, cy: 16, open: 0, eyes: "ko", probe: -1, crouch: 6 }),
    ],
  };
}

export const ACLAW: CreatureArt = {
  id: "aclaw",
  name: "Aclaw",
  size: 96,
  front: anims(false),
  back: anims(true),
  idleFps: 3,
  signature: "IMPLICIT DENY",
  blurb:
    "Keeper of Shield Haven. Its shell is an access list read top to bottom: the first matching line decides, and a packet that matches nothing hits the implicit deny at the bottom. The right claw permits, the left claw denies.",
};
