import { TYPE_INFO, type PacketType } from "@/game/engine/types";
import { crc, hammingCoverage, hammingEncode } from "@/lib/net/errors";
import { fragment, longestPrefixMatch, splitSubnets, vlsmAllocate, type Route } from "@/lib/net/addressing";
import { blockSize, formatIp, parseCidr, parseIp } from "@/lib/net/ipv4";
import { simulateSwitch, type Frame } from "@/lib/net/switching";
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

/** The CRC card's worked division (Kurose & Ross): 101110 ÷ 1001 leaves 011. */
export const CRC_DEMO = { data: "101110", gen: "1001" };

/**
 * Modulo-2 long division, row by row: the message with r zeros appended, then
 * each XOR (the generator lined up under the leading 1) and what it leaves.
 * The last r bits of the last row are the remainder, boxed in gold.
 */
export function crcFigure(): SpriteDef {
  const { data, gen } = CRC_DEMO;
  const res = crc(data, gen);
  const r = gen.length - 1;
  const n = data.length + r;
  const cw = 8;
  const rh = 8;
  const lx = 24;
  const link = ramp("LINK");
  const w = lx + n * cw + 3;
  const h = 12 + (1 + res.steps.length * 2) * rh + 4;
  const c = new Canvas(w, h);
  c.ctext(Math.floor(w / 2), 1, "MOD 2 DIVISION", INK);
  const digit = (col: number, row: number, ch: string, color: string) => c.text(lx + col * cw + 2, 10 + row * rh + 1, ch, color);
  c.text(1, 11, "MSG", DIM);
  [...data + "0".repeat(r)].forEach((ch, i) => digit(i, 0, ch, i < data.length ? INK : "#ffb3c1"));
  let row = 1;
  for (const st of res.steps) {
    c.text(1, 10 + row * rh + 1, "XOR", DIM);
    [...gen].forEach((ch, j) => {
      const x = lx + (st.at + j) * cw;
      c.rect(x, 10 + row * rh, cw - 1, rh - 1, OUTLINE);
      c.rect(x + 1, 11 + row * rh, cw - 3, rh - 3, link[3]);
      digit(st.at + j, row, ch, "#ffe2c0");
    });
    row++;
    [...st.after].forEach((ch, j) => digit(st.at + j, row, ch, ch === "1" ? INK : "#6a62a0"));
    row++;
  }
  // the remainder: the last r bits of the last row
  const ry = 10 + (row - 1) * rh;
  const rx = lx + (n - r) * cw - 1;
  c.rect(rx, ry, r * cw + 1, rh, "#ffd257");
  c.rect(rx + 1, ry + 1, r * cw - 1, rh - 2, "#2a2350");
  [...res.remainder].forEach((ch, j) => digit(n - r + j, row - 1, ch, "#ffd257"));
  c.text(1, 10 + (row - 1) * rh + 1, "REM", "#ffd257");
  return c.sprite();
}

/** The Hamming card's code: 1011 → 0110011, check bits at positions 1, 2 and 4. */
export const HAMMING_DEMO = { data: "1011", code: hammingEncode("1011") };

/**
 * A Hamming(7,4) codeword with its positions numbered, then one row per
 * check bit with a dot under every position it covers (the positions whose
 * number has that bit set).
 */
export function hammingFigure(): SpriteDef {
  const code = HAMMING_DEMO.code;
  const n = code.length;
  const cw = 15;
  const lx = 22;
  const w = lx + n * cw + 3;
  const h = 10 + 13 + 3 * 9 + 4;
  const c = new Canvas(w, h);
  const chk = ramp("TRANSPORT");
  const dat = ramp("APPLICATION");
  const checks = [1, 2, 4];
  c.text(1, 14, "BITS", DIM);
  for (let pos = 1; pos <= n; pos++) {
    const x = lx + (pos - 1) * cw;
    c.ctext(x + 7, 2, String(pos), checks.includes(pos) ? chk[0] : DIM);
    const isChk = checks.includes(pos);
    c.brick(x, 9, cw - 1, 13, isChk ? chk : dat);
    c.ctext(x + 7, 13, code[pos - 1], isChk ? TYPE_INFO.TRANSPORT.ink : TYPE_INFO.APPLICATION.ink);
  }
  checks.forEach((p, k) => {
    const y = 26 + k * 9;
    c.text(1, y + 1, `P${p}`, chk[0]);
    c.hline(lx, y + 3, n * cw - 1, "#3b3175");
    for (const pos of hammingCoverage(p, n)) {
      const x = lx + (pos - 1) * cw + 7;
      const self = pos === p;
      c.rect(x - 2, y + 1, 5, 5, OUTLINE);
      c.rect(x - 1, y + 2, 3, 3, self ? chk[1] : dat[1]);
      c.set(x - 1, y + 2, self ? chk[0] : dat[0]);
    }
  });
  return c.sprite();
}

/**
 * CSMA/CD on a shared cable: A and B both hear silence and start, the signals
 * collide, both jam, then binary exponential backoff. B draws 0 slots and
 * retries at once while A draws 1 slot and finds the cable busy.
 */
export function csmaFigure(): SpriteDef {
  const u = 3;
  const lx = 22;
  const w = lx + 44 * u + 2;
  const h = 58;
  const c = new Canvas(w, h);
  const SEND = "#4f8fe8";
  const JAM = "#e0564c";
  const WAIT = "#5a5196";
  const seg = (t0: number, t1: number, y: number, col: string, dotted = false) => {
    c.rect(lx + t0 * u - 1, y - 1, (t1 - t0) * u + 2, 11, OUTLINE);
    if (dotted) {
      c.rect(lx + t0 * u, y, (t1 - t0) * u, 9, "#2a2350");
      for (let j = 0; j < 9; j++) for (let k = 0; k < (t1 - t0) * u; k++) if ((j + k) % 2 === 0 && (j === 0 || j === 8 || k === 0 || k === (t1 - t0) * u - 1)) c.set(lx + t0 * u + k, y + j, col);
    } else {
      c.rect(lx + t0 * u, y, (t1 - t0) * u, 9, col);
      c.hline(lx + t0 * u, y, (t1 - t0) * u, lighten(col, 0.35));
      c.hline(lx + t0 * u, y + 8, (t1 - t0) * u, darken(col, 0.3));
    }
  };
  c.text(1, 14, "A", INK);
  c.text(1, 30, "B", INK);
  // A hears silence and sends; B starts a moment later, before A's signal reaches it
  seg(0, 4, 10, WAIT, true);
  seg(4, 12, 10, SEND);
  seg(12, 16, 10, JAM);
  seg(16, 26, 10, WAIT, true);
  seg(26, 30, 10, WAIT, true);
  seg(8, 12, 26, SEND);
  seg(12, 16, 26, JAM);
  seg(16, 38, 26, SEND);
  // the collision: a spark across both rows
  const cx = lx + 12 * u;
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, -2], [2, 2], [-2, 2], [2, -2], [-3, 0], [3, 0], [0, -3], [0, 3]]) c.set(cx + dx, 23 + dy, dy === 0 && dx === 0 ? INK : "#ffd257");
  c.vline(cx, 19, 14, "#ffd257");
  // legend
  const key = (x: number, col: string, label: string, dotted = false) => {
    c.rect(x, 43, 6, 6, OUTLINE);
    c.rect(x + 1, 44, 4, 4, dotted ? "#2a2350" : col);
    if (dotted) for (const [dx, dy] of [[1, 44], [3, 44], [2, 45], [4, 45]]) c.set(x + dx, dy, col);
    c.text(x + 8, 43, label, INK);
  };
  key(lx, SEND, "SEND");
  key(lx + 38, JAM, "JAM");
  key(lx + 70, WAIT, "WAIT", true);
  c.text(lx, 52, "A BACKS OFF 1 SLOT B 0", DIM);
  return c.sprite();
}

/** The MAC-learning card's frames: (host letter → port) as the switch sees them. */
export const MAC_DEMO: { hosts: { name: string; port: number }[]; frames: Frame[] } = {
  hosts: [
    { name: "A", port: 1 },
    { name: "B", port: 2 },
    { name: "C", port: 3 },
    { name: "D", port: 4 },
  ],
  frames: [
    { src: "A", dst: "B", inPort: 1 },
    { src: "B", dst: "A", inPort: 2 },
  ],
};

/** A 4-port switch with hosts A to D and the table it has learned after the demo frames. */
export function macLearningFigure(): SpriteDef {
  const w = 150;
  const h = 62;
  const c = new Canvas(w, h);
  const net = ramp("LINK");
  const host = ramp("APPLICATION");
  const steps = simulateSwitch(4, MAC_DEMO.frames);
  const table = steps[steps.length - 1].table;
  const sx = 6;
  c.brick(sx, 10, 62, 16, net);
  c.ctext(sx + 31, 15, "SWITCH", TYPE_INFO.LINK.ink);
  MAC_DEMO.hosts.forEach((hst, i) => {
    const x = sx + 2 + i * 15;
    c.vline(x + 5, 26, 14, "#c49a5a");
    c.ctext(x + 5, 29, String(hst.port), "#ffd257");
    c.brick(x, 40, 11, 12, host);
    c.ctext(x + 5, 43, hst.name, TYPE_INFO.APPLICATION.ink);
  });
  // the learned table
  const tx = 86;
  c.rect(tx, 8, 60, 46, OUTLINE);
  c.rect(tx + 1, 9, 58, 44, "#2a2350");
  c.ctext(tx + 30, 12, "MAC TABLE", INK);
  c.text(tx + 6, 21, "MAC", DIM);
  c.text(tx + 34, 21, "PORT", DIM);
  c.hline(tx + 3, 27, 54, "#5a5196");
  Object.entries(table).forEach(([mac, port], i) => {
    c.text(tx + 8, 31 + i * 8, mac, host[0]);
    c.text(tx + 40, 31 + i * 8, String(port), "#ffd257");
  });
  c.text(tx + 8, 31 + Object.keys(table).length * 8, "C", "#5a5196");
  c.text(tx + 20, 31 + Object.keys(table).length * 8, "NOT YET", "#5a5196");
  return c.sprite();
}

/** The subnetting card: 192.168.1.0/24 borrows 2 host bits and becomes four /26 subnets. */
export const SUBNET_DEMO = { block: "192.168.1.0/24", borrow: 2 };

export function subnetFigure(): SpriteDef {
  const cell = 4;
  const w = 32 * cell + 3 * 3 + 12;
  const h = 62;
  const c = new Canvas(w, h);
  const base = parseCidr(SUBNET_DEMO.block);
  const newPrefix = base.prefix + SUBNET_DEMO.borrow;
  const NET = "#4f8fe8";
  const BORROW = "#ffd257";
  const HOST = "#5a5196";
  const x0 = 6;
  // 32 address bits: network, the borrowed bits, what stays host
  for (let i = 0; i < 32; i++) {
    const x = x0 + i * cell + Math.floor(i / 8) * 3;
    const col = i < base.prefix ? NET : i < newPrefix ? BORROW : HOST;
    c.rect(x, 12, cell, 8, OUTLINE);
    c.rect(x, 13, cell - 1, 6, col);
    c.hline(x, 13, cell - 1, lighten(col, 0.35));
    c.hline(x, 18, cell - 1, darken(col, 0.3));
  }
  c.text(x0, 3, "/" + base.prefix + " BECOMES /" + newPrefix, INK);
  const key = (x: number, col: string, label: string) => {
    c.rect(x, 24, 6, 6, OUTLINE);
    c.rect(x + 1, 25, 4, 4, col);
    c.text(x + 8, 25, label, INK);
  };
  key(x0, NET, "NET");
  key(x0 + 32, BORROW, "BORROWED " + SUBNET_DEMO.borrow);
  key(x0 + 92, HOST, "HOST");
  // the subnets the borrowed bits select
  const subs = splitSubnets(base, newPrefix);
  const bw = Math.floor((w - 12) / subs.length);
  subs.forEach((s, i) => {
    const x = 6 + i * bw;
    c.brick(x, 36, bw - 2, 20, ramp("NETWORK"));
    c.ctext(x + Math.floor((bw - 2) / 2), 40, "." + (s.network & 255) + "/" + s.prefix, TYPE_INFO.NETWORK.ink);
    c.ctext(x + Math.floor((bw - 2) / 2), 47, String(blockSize(s.prefix)), TYPE_INFO.NETWORK.ink);
  });
  return c.sprite();
}

/** The VLSM card: a /24 handed out largest requirement first. */
export const VLSM_DEMO = { block: "192.168.1.0/24", lans: [{ name: "LAN A", hosts: 100 }, { name: "LAN B", hosts: 50 }, { name: "LAN C", hosts: 20 }, { name: "LINK", hosts: 2 }] };

export function vlsmFigure(): SpriteDef {
  const block = parseCidr(VLSM_DEMO.block);
  const alloc = vlsmAllocate(block, VLSM_DEMO.lans.map((l) => l.hosts));
  if (!alloc) throw new Error("VLSM demo must fit");
  const lx = 20;
  const bar = 128; // 256 addresses at half a pixel each
  const w = lx + bar + 8;
  const rowH = 12;
  const h = 14 + alloc.length * rowH + 10;
  const c = new Canvas(w, h);
  const cols = ["#e0564c", "#4f8fe8", "#4fc26a", "#f0c34a"];
  c.rect(lx - 1, 9, bar + 2, alloc.length * rowH + 2, OUTLINE);
  c.rect(lx, 10, bar, alloc.length * rowH, "#2a2350");
  [0, 64, 128, 192, 256].forEach((a) => {
    const x = lx + a / 2 - (a === 256 ? 1 : 0);
    c.vline(x, 10, alloc.length * rowH, "#3b3370");
    c.text(Math.max(0, x - 5), 1, String(a), DIM);
  });
  alloc.forEach((a, i) => {
    const y = 12 + i * rowH;
    const x = lx + (a.subnet.network - block.network) / 2;
    const bw = Math.max(3, blockSize(a.subnet.prefix) / 2);
    c.text(1, y + 2, VLSM_DEMO.lans[i].name.replace("LAN ", ""), INK);
    c.rect(x - 1, y - 1, bw + 2, 10, OUTLINE);
    c.rect(x, y, bw, 8, cols[i]);
    c.hline(x, y, bw, lighten(cols[i], 0.35));
    c.hline(x, y + 7, bw, darken(cols[i], 0.3));
    const label = "/" + a.subnet.prefix;
    const lxp = x + bw + 4 + microWidth(label) <= w ? x + bw + 3 : x - 3 - microWidth(label);
    c.text(lxp, y + 2, label, INK);
  });
  c.text(lx, h - 7, "LAST BYTE OF THE ADDRESS", DIM);
  return c.sprite();
}

/** The longest-prefix card: four routes match 10.1.2.7, the /24 wins. */
export const LPM_DEMO: { routes: Route[]; dest: string } = {
  dest: "10.1.2.7",
  routes: [
    { prefix: parseCidr("0.0.0.0/0"), nextHop: "R4" },
    { prefix: parseCidr("10.0.0.0/8"), nextHop: "R1" },
    { prefix: parseCidr("10.1.0.0/16"), nextHop: "R2" },
    { prefix: parseCidr("10.1.2.0/24"), nextHop: "R3" },
    { prefix: parseCidr("10.2.0.0/16"), nextHop: "R5" },
  ],
};

export function lpmFigure(): SpriteDef {
  const w = 150;
  const rowH = 10;
  const h = 14 + LPM_DEMO.routes.length * rowH + 4;
  const c = new Canvas(w, h);
  const ip = parseIp(LPM_DEMO.dest);
  const win = longestPrefixMatch(LPM_DEMO.routes, ip);
  c.text(2, 2, "DEST " + LPM_DEMO.dest, INK);
  const bx = 70; // the bit bar: 32 bits at 2 px each, with the matching prefix filled
  c.rect(bx - 1, 8, 66, 1, "#3b3370");
  LPM_DEMO.routes.forEach((r, i) => {
    const y = 12 + i * rowH;
    const hit = longestPrefixMatch([r], ip) !== undefined;
    const best = r === win;
    const col = best ? "#ffd257" : hit ? "#4f8fe8" : "#3b3370";
    if (best) c.rect(0, y - 2, w, rowH, "#2a2350");
    c.text(2, y, formatIp(r.prefix.network) + "/" + r.prefix.prefix, hit ? INK : DIM);
    c.rect(bx - 1, y - 1, 66, 7, OUTLINE);
    c.rect(bx, y, 64, 5, "#17122f");
    c.rect(bx, y, r.prefix.prefix * 2, 5, col);
    if (r.prefix.prefix) c.hline(bx, y, r.prefix.prefix * 2, lighten(col, 0.4));
    c.text(bx + 69, y, r.nextHop, best ? "#ffd257" : hit ? INK : DIM);
  });
  return c.sprite();
}

/** The fragmentation card: a 4000-byte datagram over a 1500-byte MTU. */
export const FRAG_DEMO = { total: 4000, mtu: 1500 };

export function fragFigure(): SpriteDef {
  const frags = fragment(FRAG_DEMO.total, FRAG_DEMO.mtu);
  const per = 40; // bytes per pixel
  const lx = 2;
  const w = 150;
  const rowH = 14;
  const h = 14 + (frags.length + 1) * rowH;
  const c = new Canvas(w, h);
  const HDR = "#e0564c";
  const DATA = "#4f8fe8";
  const bar = (x: number, y: number, bytes: number, col: string, hw = 0) => {
    const bw = Math.max(2, Math.round(bytes / per));
    c.rect(x - 1, y - 1, bw + hw + 2, 10, OUTLINE);
    if (hw) {
      c.rect(x, y, hw, 8, HDR);
      c.hline(x, y, hw, lighten(HDR, 0.35));
    }
    c.rect(x + hw, y, bw, 8, col);
    c.hline(x + hw, y, bw, lighten(col, 0.35));
    c.hline(x + hw, y + 7, bw, darken(col, 0.3));
    return bw + hw;
  };
  c.text(lx, 1, "ONE DATAGRAM", DIM);
  const full = bar(lx + 1, 8, FRAG_DEMO.total - 20, DATA, 4);
  c.text(lx + full + 5, 10, String(FRAG_DEMO.total) + " B", INK);
  c.text(lx, 22, "THREE FRAGMENTS", DIM);
  frags.forEach((f, i) => {
    const y = 30 + i * rowH - 2;
    const used = bar(lx + 1, y, f.totalLength - 20, DATA, 4);
    c.text(lx + used + 5, y + 2, "OFF " + f.offset + " MF " + (f.more ? 1 : 0), f.more ? INK : "#ffd257");
  });
  return c.sprite();
}
