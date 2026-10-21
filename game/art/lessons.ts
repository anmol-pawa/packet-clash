import { TYPE_INFO, type PacketType } from "@/game/engine/types";
import type { SpriteDef } from "@/lib/pixel";
import { chipRamp } from "./headers";
import { MICRO_H, microRows, microWidth } from "./microFont";

/**
 * Figures for the gym lesson cards, drawn in code as pixel art: the OSI and
 * TCP/IP stacks side by side, a TDM circuit next to packet switching on the
 * same link, and a router showing where each of the four delays happens.
 * The encapsulation card reuses the battle's header chips instead.
 */

const OUTLINE = "#140f26";
const INK = "#f4f1ff";
const DIM = "#8f86c4";

/** A colour grid that turns into a palette + rows sprite. */
class Canvas {
  px: (string | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  hline(x: number, y: number, w: number, c: string, dash = 0) {
    for (let i = 0; i < w; i++) if (!dash || Math.floor(i / dash) % 2 === 0) this.set(x + i, y, c);
  }
  vline(x: number, y: number, h: number, c: string) {
    for (let j = 0; j < h; j++) this.set(x, y + j, c);
  }
  text(x: number, y: number, s: string, c: string) {
    microRows(s, "#").forEach((r, j) => [...r].forEach((ch, i) => ch === "#" && this.set(x + i, y + j, c)));
  }
  /** Text centred on column `cx`. */
  ctext(cx: number, y: number, s: string, c: string) {
    this.text(cx - Math.floor(microWidth(s) / 2), y, s, c);
  }
  /**
   * A shaded brick: outline, highlight top row and left column, base,
   * shadow and deep rows at the bottom.
   */
  brick(x: number, y: number, w: number, h: number, [hi, base, sh, deep]: readonly string[]) {
    this.rect(x, y, w, h, OUTLINE);
    this.rect(x + 1, y + 1, w - 2, h - 2, base);
    this.hline(x + 1, y + 1, w - 2, hi);
    this.vline(x + 1, y + 1, h - 3, hi);
    this.hline(x + 1, y + h - 3, w - 2, sh);
    this.hline(x + 1, y + h - 2, w - 2, deep);
    this.vline(x + w - 2, y + 2, h - 4, sh);
  }
  sprite(): SpriteDef {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const palette: Record<string, string> = {};
    const key = new Map<string, string>();
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let r = "";
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (!c) {
          r += ".";
          continue;
        }
        let k = key.get(c);
        if (!k) {
          k = chars[key.size];
          if (!k) throw new Error("lesson figure uses too many colours");
          key.set(c, k);
          palette[k] = c;
        }
        r += k;
      }
      rows.push(r);
    }
    return { palette, rows };
  }
}

function lighten(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - k) + 255 * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

function darken(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

const ramp = (t: PacketType, k = 0): string[] => chipRamp(t).map((c) => (k ? lighten(c, k) : c));

/** The seven OSI layers, top down, each with the 5-layer (TCP/IP) layer it maps to. */
export const OSI_LAYERS: { name: string; label: string; tcpip: PacketType }[] = [
  { name: "Application", label: "APP", tcpip: "APPLICATION" },
  { name: "Presentation", label: "PRES", tcpip: "APPLICATION" },
  { name: "Session", label: "SESS", tcpip: "APPLICATION" },
  { name: "Transport", label: "TRANS", tcpip: "TRANSPORT" },
  { name: "Network", label: "NET", tcpip: "NETWORK" },
  { name: "Data link", label: "LINK", tcpip: "LINK" },
  { name: "Physical", label: "PHYS", tcpip: "PHYSICAL" },
];

/** The 5-layer Internet stack, top down. */
export const TCPIP_LAYERS: PacketType[] = ["APPLICATION", "TRANSPORT", "NETWORK", "LINK", "PHYSICAL"];

const BRICK = 11; // brick pitch: bricks share their outline rows

/** OSI's 7 layers beside the Internet's 5, with the top three OSI layers folded into one application brick. */
export function layerStackFigure(): SpriteDef {
  const colW = 30;
  const gap = 16;
  const top = 9;
  const w = 2 * colW + gap + 2;
  const h = top + OSI_LAYERS.length * BRICK + 2;
  const c = new Canvas(w, h);
  const ox = 1;
  const tx = ox + colW + gap;
  c.ctext(ox + colW / 2, 1, "OSI", INK);
  c.ctext(tx + colW / 2, 1, "TCP IP", INK);
  // OSI: shades of the 5-layer colour, lighter for presentation and session
  OSI_LAYERS.forEach((l, i) => {
    const y = top + i * BRICK;
    c.brick(ox, y, colW, BRICK + 1, ramp(l.tcpip, i === 1 ? 0.18 : i === 2 ? 0.32 : 0));
    c.ctext(ox + colW / 2, y + 3, l.label, TYPE_INFO[l.tcpip].ink);
  });
  // TCP/IP: application spans OSI's top three rows
  let row = 0;
  for (const t of TCPIP_LAYERS) {
    const span = OSI_LAYERS.filter((l) => l.tcpip === t).length;
    const y = top + row * BRICK;
    const bh = span * BRICK + 1;
    c.brick(tx, y, colW, bh, ramp(t));
    c.ctext(tx + colW / 2, y + Math.floor((bh - MICRO_H) / 2), TYPE_INFO[t].label, TYPE_INFO[t].ink);
    // dashed guides from each OSI boundary to the matching TCP/IP brick
    for (let s = 0; s < span; s++) c.hline(ox + colW + 1, top + (row + s) * BRICK + 5, gap - 2, s === 0 || span === 1 ? DIM : "#4a4280", 2);
    row += span;
  }
  return c.sprite();
}

/** Who owns each TDM slot (and each packet) in the switching figure. */
export const USERS = ["#e0564c", "#4f8fe8", "#4fc26a", "#f0c34a"];
/** In this burst only users 0 and 2 have data: 3 chunks each. */
export const BURST = [3, 0, 3, 0];
export const SLOTS_PER_FRAME = USERS.length;
export const TDM_FRAMES = Math.max(...BURST);

/**
 * Circuit vs packet switching on the same link over the same time. TDM gives
 * each of 4 users a fixed slot in every frame, so the two idle users' slots
 * go out empty. Packet switching sends the same 6 chunks back to back, on
 * demand, and the link is free afterwards.
 */
export function switchingFigure(): SpriteDef {
  const cell = 7;
  const lx = 30;
  const slots = TDM_FRAMES * SLOTS_PER_FRAME;
  const w = lx + slots * cell + 3;
  const h = 48;
  const c = new Canvas(w, h);
  const strip = (y: number, owners: (number | null)[], frames: boolean) => {
    c.rect(lx - 1, y - 1, slots * cell + 3, cell + 3, OUTLINE);
    c.rect(lx, y, slots * cell + 1, cell + 1, "#2a2350");
    owners.forEach((u, i) => {
      const x = lx + i * cell + 1;
      if (u === null) {
        // an empty slot: a dim dotted box
        for (let j = 0; j < cell - 1; j++) for (let k = 0; k < cell - 1; k++) if ((j === 0 || k === 0 || j === cell - 2 || k === cell - 2) && (j + k) % 2 === 0) c.set(x + k, y + 1 + j, "#5a5196");
      } else {
        c.rect(x, y + 1, cell - 1, cell - 1, USERS[u]);
        c.hline(x, y + 1, cell - 1, lighten(USERS[u], 0.35));
        c.hline(x, y + cell - 1, cell - 1, darken(USERS[u], 0.3));
      }
    });
    if (frames) for (let f = 1; f < TDM_FRAMES; f++) c.vline(lx + f * SLOTS_PER_FRAME * cell, y - 3, cell + 6, INK);
  };
  c.text(1, 6, "TDM", INK);
  const tdm: (number | null)[] = [];
  for (let f = 0; f < TDM_FRAMES; f++) for (let u = 0; u < SLOTS_PER_FRAME; u++) tdm.push(f < BURST[u] ? u : null);
  strip(5, tdm, true);
  c.text(1, 27, "PKT", INK);
  const pkt: (number | null)[] = packetOrder();
  while (pkt.length < slots) pkt.push(null);
  strip(26, pkt, false);
  // a clock arrow along the bottom: time runs left to right
  c.hline(lx, 43, slots * cell - 2, DIM);
  [-1, 0, 1].forEach((d) => c.set(lx + slots * cell - 3, 43 + d, DIM));
  c.set(lx + slots * cell - 4, 41, DIM);
  c.set(lx + slots * cell - 4, 45, DIM);
  c.text(1, 41, "TIME", DIM);
  return c.sprite();
}

/** The order packet switching sends the burst in: round robin over users with data left. */
export function packetOrder(): number[] {
  const left = [...BURST];
  const out: number[] = [];
  while (left.some((n) => n > 0)) left.forEach((n, u) => n > 0 && (out.push(u), left[u]--));
  return out;
}

/**
 * One hop, A → router → B, with the four delays marked under the part of the
 * trip they belong to: processing in the router, the queue at its output
 * port, transmission onto the link, and propagation along it.
 */
export function delaysFigure(): SpriteDef {
  const w = 150;
  const h = 56;
  const c = new Canvas(w, h);
  const net = ramp("NETWORK");
  const link = ramp("LINK");
  // the router: a shaded box with a crossed-arrows emblem
  const rx = 6;
  const ry = 8;
  c.brick(rx, ry, 30, 22, net);
  // the classic router emblem: two crossing arrows
  for (let i = 0; i < 9; i++) {
    c.set(rx + 10 + i, ry + 6 + i, INK);
    c.set(rx + 10 + i, ry + 14 - i, INK);
  }
  for (const [x, y] of [[18, 14], [17, 14], [18, 13], [18, 6], [17, 6], [18, 7]]) c.set(rx + x, ry + y, INK);
  c.ctext(rx + 15, 1, "ROUTER", INK);
  // output queue: three packets waiting in a buffer
  const qx = rx + 32;
  c.rect(qx, ry + 6, 26, 11, OUTLINE);
  c.rect(qx + 1, ry + 7, 24, 9, "#2a2350");
  for (let i = 0; i < 3; i++) c.brick(qx + 2 + i * 8, ry + 8, 7, 7, link);
  // transmission: a packet half pushed onto the wire, its bits spilling out
  const wx = qx + 28;
  const wy = ry + 11;
  c.rect(wx, wy - 1, w - wx - 14, 3, OUTLINE);
  c.hline(wx, wy, w - wx - 14, "#c49a5a");
  c.brick(wx, wy - 4, 9, 9, link);
  for (let i = 0; i < 4; i++) c.rect(wx + 11 + i * 3, wy - 1 + (i % 2 ? 0 : -1), 2, 2, i % 2 ? "#ffd257" : INK);
  // one bit far along the wire, and host B at the end
  c.rect(wx + 56, wy - 1, 2, 2, "#ffd257");
  const bx = w - 14;
  c.brick(bx, ry + 4, 13, 16, ramp("APPLICATION"));
  c.ctext(bx + 6, ry + 9, "B", INK);
  // brackets with labels under each part
  const bracket = (x0: number, x1: number, label: string, col: string) => {
    const y = 36;
    c.hline(x0, y, x1 - x0 + 1, col);
    c.vline(x0, y - 2, 2, col);
    c.vline(x1, y - 2, 2, col);
    c.ctext(Math.floor((x0 + x1) / 2), y + 3, label, col);
  };
  bracket(rx + 2, rx + 27, "PROC", "#9fc4ff");
  bracket(qx + 1, qx + 24, "QUEUE", "#ffb3c1");
  bracket(wx, wx + 22, "TRANS", "#ffd257");
  bracket(wx + 25, bx - 2, "PROP", "#8ee07a");
  c.ctext(Math.floor(w / 2), h - 6, "NODAL DELAY", INK);
  return c.sprite();
}
