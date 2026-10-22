import { TYPE_INFO, type PacketType } from "@/game/engine/types";
import { crc, hammingCoverage, hammingEncode } from "@/lib/net/errors";
import { acceptsAsPath, afterLinkChange, asPaths, bellmanFordRounds, dijkstraSteps, type Graph } from "@/lib/net/routing";
import { fragment, longestPrefixMatch, splitSubnets, vlsmAllocate, type Route } from "@/lib/net/addressing";
import { DHCP_DORA, dhcpTimers, pageLoadRtts, type HttpMode } from "@/lib/net/application";
import { cwndSeries, goBackNTransmissions, handshake, selectiveRepeatTransmissions, type TcpState } from "@/lib/net/transport";
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
  /** A dark panel with an outline, for figures that are mostly text. */
  panel() {
    this.rect(0, 0, this.w, this.h, OUTLINE);
    this.rect(1, 1, this.w - 2, this.h - 2, "#1c1640");
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

/**
 * Kurose & Ross Fig. 5.3, the graph the Dijkstra and Bellman-Ford cards work
 * on, relabelled A–F (u→A, v→B, w→C, x→D, y→E, z→F) because the 3×5 font
 * draws V/W like U/H.
 */
export const ROUTE_DEMO: Graph = {
  nodes: ["A", "B", "C", "D", "E", "F"],
  edges: [["A", "B", 2], ["A", "D", 1], ["A", "C", 5], ["B", "D", 2], ["B", "C", 3], ["C", "D", 3], ["C", "E", 1], ["D", "E", 1], ["E", "F", 2], ["C", "F", 5]],
};

const cost = (v: number) => (v === Infinity ? "INF" : String(v));
const CHANGED = "#2a3f7a";

/** The Dijkstra card: the textbook table of D(v) and p(v), one row per step, from A. */
export function dijkstraFigure(): SpriteDef {
  const steps = dijkstraSteps(ROUTE_DEMO, "A");
  const cols = ROUTE_DEMO.nodes.filter((n) => n !== "A");
  const lx = 2;
  const cw = 20;
  const x0 = lx + 28;
  const rowH = 9;
  const w = x0 + cols.length * cw + 2;
  const h = 20 + steps.length * rowH + 2;
  const c = new Canvas(w, h);
  c.panel();
  c.text(lx, 2, "N PRIME", DIM);
  cols.forEach((n, i) => {
    c.brick(x0 + i * cw + cw / 2 - 6, 1, 13, 10, ramp("NETWORK"));
    c.ctext(x0 + i * cw + cw / 2, 3, n, TYPE_INFO.NETWORK.ink);
  });
  c.hline(lx, 12, w - 4, "#5a5196");
  steps.forEach((st, r) => {
    const y = 15 + r * rowH;
    const last = st.settled[st.settled.length - 1];
    c.text(lx, y, st.settled.join(""), r === steps.length - 1 ? "#ffd257" : INK);
    cols.forEach((n, i) => {
      const cx = x0 + i * cw + cw / 2;
      if (st.settled.includes(n)) {
        if (n === last) {
          c.rect(cx - 9, y - 2, 18, 8, "#5a4a14");
          c.ctext(cx, y, cost(st.dist[n]), "#ffd257");
        }
        return;
      }
      const before = r ? steps[r - 1] : null;
      const changed = !before || before.dist[n] !== st.dist[n];
      if (changed && st.dist[n] < Infinity) c.rect(cx - 9, y - 2, 18, 8, CHANGED);
      c.ctext(cx, y, st.dist[n] === Infinity ? "INF" : cost(st.dist[n]) + (st.prev[n] ?? ""), changed ? INK : DIM);
    });
  });
  return c.sprite();
}

/** The Bellman-Ford card: round h holds the cheapest cost to F using at most h links. */
export const BF_DEST = "F";

export function bellmanFordFigure(): SpriteDef {
  const rounds = bellmanFordRounds(ROUTE_DEMO, BF_DEST);
  const nodes = ROUTE_DEMO.nodes;
  const lx = 2;
  const cw = 20;
  const x0 = lx + 14;
  const rowH = 10;
  const w = x0 + nodes.length * cw + 2;
  const h = 24 + rounds.length * rowH;
  const c = new Canvas(w, h);
  c.panel();
  c.text(lx, 2, "COST TO " + BF_DEST + " IN AT MOST H LINKS", DIM);
  c.text(lx, 11, "H", DIM);
  nodes.forEach((n, i) => {
    c.brick(x0 + i * cw + cw / 2 - 6, 9, 13, 10, ramp(n === BF_DEST ? "APPLICATION" : "NETWORK"));
    c.ctext(x0 + i * cw + cw / 2, 11, n, TYPE_INFO[n === BF_DEST ? "APPLICATION" : "NETWORK"].ink);
  });
  c.hline(lx, 21, w - 4, "#5a5196");
  rounds.forEach((rd, r) => {
    const y = 25 + r * rowH;
    c.text(lx + 1, y, String(r), INK);
    nodes.forEach((n, i) => {
      const cx = x0 + i * cw + cw / 2;
      const changed = r > 0 && rd[n] !== rounds[r - 1][n];
      if (changed) c.rect(cx - 9, y - 2, 18, 8, CHANGED);
      c.ctext(cx, y, cost(rd[n]), changed ? INK : rd[n] === Infinity ? "#5a5196" : DIM);
    });
  });
  return c.sprite();
}

/** The count-to-infinity card: A-B-C in a line, then the A-B link fails. */
export const CTI_GRAPH: Graph = { nodes: ["A", "B", "C"], edges: [["A", "B", 1], ["B", "C", 1]] };

export function countToInfinityFigure(): SpriteDef {
  const plain = afterLinkChange(CTI_GRAPH, "A", "A", "B", Infinity).history;
  const poison = afterLinkChange(CTI_GRAPH, "A", "A", "B", Infinity, { poison: true }).history;
  const unit = 3;
  const panelW = 74;
  const rowH = 15;
  const rows = 7;
  const w = panelW * 2 + 4;
  const h = 24 + rows * rowH + 2;
  const c = new Canvas(w, h);
  c.panel();
  const B = "#4f8fe8";
  const C = "#f0a03a";
  const panel = (x: number, title: string, hist: typeof plain, extra: string) => {
    c.text(x + 2, 2, title, INK);
    c.text(x + 2, 10, "B", B);
    c.text(x + 10, 10, "C", C);
    c.text(x + 18, 10, "TO A", DIM);
    c.hline(x + 2, 17, panelW - 4, "#5a5196");
    hist.slice(0, rows - 1).forEach((st, r) => {
      const y = 21 + r * rowH;
      c.text(x + 2, y + 1, "R" + r, DIM);
      ([[st.dist.B, B, 0], [st.dist.C, C, 7]] as const).forEach(([v, col, dy]) => {
        const bw = Math.min(v, 16) * unit;
        c.rect(x + 12, y + dy - 1, bw + 2, 5, OUTLINE);
        c.rect(x + 13, y + dy, bw, 3, col);
        c.hline(x + 13, y + dy, bw, lighten(col, 0.4));
        c.text(x + 14 + bw + 2, y + dy - 1, cost(v), v >= 16 ? "#e0564c" : INK);
      });
    });
    c.text(x + 2, 21 + (rows - 1) * rowH, extra, DIM);
  };
  panel(0, "NO POISON", plain, "... UP TO 16");
  c.vline(panelW + 1, 2, h - 4, "#3b3370");
  panel(panelW + 4, "POISONED REVERSE", poison, "STOPS AT R2");
  return c.sprite();
}

/** The BGP card: the AS_PATH grows by one AS per hop, and a path that loops back is rejected. */
export const BGP_CHAIN = [1, 2, 3, 4];

export function bgpFigure(): SpriteDef {
  const paths = asPaths(BGP_CHAIN);
  const bw = 26;
  const gap = 10;
  const w = BGP_CHAIN.length * bw + (BGP_CHAIN.length - 1) * gap + 8;
  const h = 70;
  const c = new Canvas(w, h);
  c.text(4, 2, "PREFIX ORIGINATES IN AS1", DIM);
  BGP_CHAIN.forEach((asn, i) => {
    const x = 4 + i * (bw + gap);
    c.brick(x, 12, bw, 14, ramp(i === 0 ? "APPLICATION" : "TRANSPORT"));
    c.ctext(x + bw / 2, 16, "AS" + asn, INK);
    if (i < BGP_CHAIN.length - 1) {
      c.hline(x + bw, 18, gap, "#ffd257");
      c.set(x + bw + gap - 2, 17, "#ffd257");
      c.set(x + bw + gap - 2, 19, "#ffd257");
    }
    c.ctext(x + bw / 2, 30, "PATH", DIM);
    c.ctext(x + bw / 2, 37, i === 0 ? "ORIGIN" : paths[i - 1].join(" "), INK);
  });
  // the last AS advertises to AS1 again: AS1 sees itself in the path and drops it
  const last = BGP_CHAIN.length - 1;
  const xa = 4 + bw / 2;
  const xb = 4 + last * (bw + gap) + bw / 2;
  const looped = paths[last];
  c.vline(xb, 44, 8, "#e0564c");
  c.hline(xa, 52, xb - xa + 1, "#e0564c", 2);
  c.vline(xa, 44, 8, "#e0564c");
  const mid = Math.floor((xa + xb) / 2);
  c.ctext(mid, 55, "AS4 TELLS AS1 " + looped.join(" "), INK);
  const ok = acceptsAsPath(BGP_CHAIN[0], looped);
  c.ctext(mid, 63, ok ? "ACCEPTED" : "REJECTED", ok ? "#4fc26a" : "#e0564c");
  return c.sprite();
}

/** The handshake card: the client opens with ISN 100, the server answers with ISN 300. */
export const HANDSHAKE_DEMO = { clientIsn: 100, serverIsn: 300 };

export interface FlowEvent {
  from: "client" | "server";
  /** Text lines drawn above the arrow. */
  lines: string[];
  /** The sender's new state, if this segment changes it. */
  send?: TcpState;
  /** The receiver's new state, if this segment changes it. */
  recv?: TcpState;
  /** Handshake segments are gold, teardown ones orange. */
  phase: "open" | "close";
}

const hs = handshake(HANDSHAKE_DEMO.clientIsn, HANDSHAKE_DEMO.serverIsn);
const segLines = (i: number): string[] => [hs[i].flags.replace("+", " "), `SEQ ${hs[i].seq}`, ...(hs[i].ack === null ? [] : [`ACK ${hs[i].ack}`])];

/** Setup then teardown, one event per segment, with the state each side moves to. */
export const TCP_FLOW: readonly FlowEvent[] = [
  { from: "client", lines: segLines(0), send: "SYN_SENT", recv: "SYN_RCVD", phase: "open" },
  { from: "server", lines: segLines(1), recv: "ESTABLISHED", phase: "open" },
  { from: "client", lines: segLines(2), recv: "ESTABLISHED", phase: "open" },
  { from: "client", lines: ["FIN"], send: "FIN_WAIT_1", recv: "CLOSE_WAIT", phase: "close" },
  { from: "server", lines: ["ACK"], recv: "FIN_WAIT_2", phase: "close" },
  { from: "server", lines: ["FIN"], send: "LAST_ACK", recv: "TIME_WAIT", phase: "close" },
  { from: "client", lines: ["ACK"], recv: "CLOSED", phase: "close" },
];

/** The states one side walks through, top to bottom, including the start and the final CLOSED after TIME_WAIT. */
export function stateTrail(side: "client" | "server"): TcpState[] {
  const trail: TcpState[] = [side === "client" ? "CLOSED" : "LISTEN"];
  for (const e of TCP_FLOW) {
    const mine = e.from === side;
    const next = mine ? e.send : e.recv;
    if (next && next !== trail[trail.length - 1]) trail.push(next);
  }
  if (side === "client") trail.push("CLOSED"); // after 2 MSL in TIME_WAIT
  return trail;
}

const TIMELINE = "#3b3370";
const GOLD = "#ffd257";
const ORANGE = "#f0a03a";

/** The TCP card: the three-way handshake, then the four-segment teardown, with each side's states. */
export function tcpFlowFigure(): SpriteDef {
  const w = 160;
  const cx = 48;
  const sx = 112;
  const slot = (e: FlowEvent) => e.lines.length * 6 + 11;
  const gap = 18;
  const total = 20 + TCP_FLOW.reduce((a, e) => a + slot(e), 0) + gap + 18;
  const c = new Canvas(w, total);
  c.brick(cx - 16, 1, 32, 13, ramp("APPLICATION"));
  c.ctext(cx, 5, "CLIENT", INK);
  c.brick(sx - 16, 1, 32, 13, ramp("TRANSPORT"));
  c.ctext(sx, 5, "SERVER", INK);
  c.vline(cx, 15, total - 15, TIMELINE);
  c.vline(sx, 15, total - 15, TIMELINE);
  const stateColor = (s: TcpState) => (s === "ESTABLISHED" ? "#4fc26a" : s === "CLOSED" ? DIM : s === "TIME_WAIT" ? ORANGE : INK);
  const label = (side: "client" | "server", y: number, s: TcpState) => {
    const t = s.replace(/_/g, " ");
    c.text(side === "client" ? cx - 4 - microWidth(t) : sx + 5, y - 2, t, stateColor(s));
  };
  label("client", 19, "CLOSED");
  label("server", 19, "LISTEN");
  let y = 22;
  TCP_FLOW.forEach((e, i) => {
    if (i === 3) {
      c.hline(cx + 3, y + 3, sx - cx - 6, DIM, 2);
      c.ctext((cx + sx) / 2, y + 6, "DATA", DIM);
      y += gap;
    }
    const col = e.phase === "open" ? GOLD : ORANGE;
    e.lines.forEach((ln, k) => c.ctext((cx + sx) / 2, y + k * 6, ln, k === 0 ? INK : DIM));
    const ys = y + e.lines.length * 6 + 2;
    const yr = ys + 5;
    const [x0, x1] = e.from === "client" ? [cx + 1, sx - 1] : [sx - 1, cx + 1];
    const dir = x1 > x0 ? 1 : -1;
    for (let x = x0; x !== x1 + dir; x += dir) c.set(x, Math.round(ys + ((yr - ys) * (x - x0)) / (x1 - x0)), col);
    for (let k = 1; k <= 3; k++) {
      c.set(x1 - dir * k, yr - k, col);
      c.set(x1 - dir * k, yr + k, col);
    }
    const sender: "client" | "server" = e.from;
    const receiver = sender === "client" ? "server" : "client";
    if (e.send) label(sender, ys, e.send);
    if (e.recv) label(receiver, yr, e.recv);
    y += slot(e);
  });
  c.ctext((cx + sx) / 2, y + 2, "2 MSL", DIM);
  label("client", y + 5, "CLOSED");
  return c.sprite();
}

/** The window card: 8 packets, a window of 4, packet 2 lost once. */
export const WINDOW_DEMO = { packets: 8, window: 4, lost: 2 };

export type SendKind = "sent" | "lost" | "resent" | "discarded" | "buffered";
export interface Send {
  pkt: number;
  kind: SendKind;
}

/**
 * Transmissions in order. The window has slid to `lost`..`lost + w − 1` when
 * the loss happens, so everything up to `lost + w − 1` has been sent. Go-Back-N
 * discards the packets after the hole and resends all of them; Selective
 * Repeat buffers them and resends only the hole.
 */
export function windowSends(proto: "gbn" | "sr", { packets: n, window: w, lost }: typeof WINDOW_DEMO = WINDOW_DEMO): Send[] {
  const end = Math.min(n, lost + w);
  const out: Send[] = [];
  for (let p = 0; p < end; p++) out.push({ pkt: p, kind: p < lost ? "sent" : p === lost ? "lost" : proto === "gbn" ? "discarded" : "buffered" });
  for (let p = lost; p < (proto === "gbn" ? end : lost + 1); p++) out.push({ pkt: p, kind: "resent" });
  for (let p = end; p < n; p++) out.push({ pkt: p, kind: "sent" });
  return out;
}

export function windowFigure(): SpriteDef {
  const bw = 11;
  const rows = [["GO BACK N", "gbn", goBackNTransmissions(WINDOW_DEMO.packets, WINDOW_DEMO.window, WINDOW_DEMO.lost)], ["SELECTIVE REPEAT", "sr", selectiveRepeatTransmissions(WINDOW_DEMO.packets)]] as const;
  const maxLen = Math.max(...rows.map(([, p]) => windowSends(p).length));
  const w = maxLen * bw + 8;
  const rowH = 36;
  const c = new Canvas(w, rows.length * rowH + 30);
  c.panel();
  const kindColor: Record<SendKind, string> = { sent: "#4f8fe8", lost: "#e0564c", resent: "#f0a03a", discarded: "#5a5196", buffered: "#4fc26a" };
  rows.forEach(([title, proto, count], r) => {
    const y0 = 3 + r * rowH;
    c.text(4, y0, title, INK);
    const sends = windowSends(proto);
    c.text(w - 4 - microWidth(`${count} SENDS`), y0, `${count} SENDS`, GOLD);
    // the window as it stands when the loss happens
    const wx = 4 + WINDOW_DEMO.lost * bw;
    c.hline(wx, y0 + 9, WINDOW_DEMO.window * bw - 1, DIM);
    c.vline(wx, y0 + 9, 3, DIM);
    c.vline(wx + WINDOW_DEMO.window * bw - 2, y0 + 9, 3, DIM);
    sends.forEach((s, i) => {
      const x = 4 + i * bw;
      c.brick(x, y0 + 13, bw - 1, 12, [lighten(kindColor[s.kind], 0.35), kindColor[s.kind], darken(kindColor[s.kind], 0.25), darken(kindColor[s.kind], 0.5)]);
      c.ctext(x + (bw - 1) / 2, y0 + 16, String(s.pkt), s.kind === "discarded" ? DIM : INK);
      if (s.kind === "lost") {
        for (let k = 0; k < 7; k++) {
          c.set(x + 1 + k, y0 + 27 + (k % 2), "#e0564c");
        }
      }
    });
  });
  let lx = 4;
  (["sent", "lost", "resent", "discarded", "buffered"] as const).forEach((k, i) => {
    const ly = rows.length * rowH + 8 + (i < 3 ? 0 : 8);
    if (i === 3) lx = 4;
    c.rect(lx, ly, 4, 4, kindColor[k]);
    c.text(lx + 6, ly - 1, k.toUpperCase(), DIM);
    lx += 6 + microWidth(k) + 5;
  });
  return c.sprite();
}

/** The congestion-control card: Reno from 1 MSS with ssthresh 8, a triple duplicate ACK at RTT 8 and a timeout at RTT 13. */
export const CWND_DEMO = { rounds: 18, ssthresh: 8, losses: { 8: "dup3", 13: "timeout" } as const };

export function cwndFigure(): SpriteDef {
  const { cwnd, ssthresh } = cwndSeries(CWND_DEMO);
  const unit = 4;
  const pitch = 8;
  const x0 = 12;
  const plotH = 14 * unit;
  const top = 14;
  const w = x0 + CWND_DEMO.rounds * pitch + 4;
  const c = new Canvas(w, top + plotH + 24);
  c.panel();
  const base = top + plotH;
  c.text(3, 3, "CWND IN MSS", INK);
  const ss = "#4f8fe8";
  const ca = "#f0a03a";
  cwnd.forEach((v, t) => {
    const col = v < ssthresh[t] ? ss : ca;
    const x = x0 + t * pitch;
    c.brick(x, base - v * unit - 1, pitch - 1, v * unit + 1, [lighten(col, 0.35), col, darken(col, 0.25), darken(col, 0.5)]);
  });
  // ssthresh, dashed, as it stands in each round
  ssthresh.forEach((v, t) => c.hline(x0 + t * pitch - 1, base - v * unit - 1, pitch + 1, "#ffffff", 2));
  c.hline(x0 - 2, base, w - x0, DIM);
  c.vline(x0 - 2, top - 2, plotH + 3, DIM);
  [1, 8, 13].forEach((v) => c.text(x0 - 5 - microWidth(String(v)), base - v * unit - 4, String(v), DIM));
  const mark = (t: number, text: string) => {
    const x = x0 + t * pitch + Math.floor((pitch - 1) / 2);
    c.ctext(Math.min(x, w - 2 - Math.floor(microWidth(text) / 2)), base - cwnd[t] * unit - 9, text, "#e0564c");
  };
  mark(8, "3 DUP");
  mark(13, "TIMEOUT");
  const ly = base + 6;
  c.text(x0, ly, "RTT", DIM);
  c.rect(x0 + 18, ly, 4, 4, ss);
  c.text(x0 + 24, ly - 1, "SLOW START", DIM);
  c.rect(x0 + 70, ly, 4, 4, ca);
  c.text(x0 + 76, ly - 1, "AVOID", DIM);
  c.hline(x0 + 100, ly + 2, 8, "#ffffff", 2);
  c.text(x0 + 110, ly - 1, "SSTHRESH", DIM);
  return c.sprite();
}

/** The DNS card: the iterative lookup, one numbered arrow per message (K&R Fig. 2.19 without caches). */
export interface DnsMsg {
  from: number;
  to: number;
  label: string;
}
export const DNS_COLUMNS = ["HOST", "LOCAL", "ROOT", "TLD", "AUTH"] as const;
export const DNS_FLOW: readonly DnsMsg[] = [
  { from: 0, to: 1, label: "QUERY" },
  { from: 1, to: 2, label: "QUERY" },
  { from: 2, to: 1, label: "TLD NS" },
  { from: 1, to: 3, label: "QUERY" },
  { from: 3, to: 1, label: "AUTH NS" },
  { from: 1, to: 4, label: "QUERY" },
  { from: 4, to: 1, label: "ANSWER" },
  { from: 1, to: 0, label: "ANSWER" },
];

export function dnsFigure(): SpriteDef {
  const pitch = 32;
  const x0 = 16;
  const rowH = 12;
  const top = 18;
  const c = new Canvas(160, top + DNS_FLOW.length * rowH + 6);
  c.panel();
  const types: PacketType[] = ["APPLICATION", "TRANSPORT", "NETWORK", "LINK", "PHYSICAL"];
  DNS_COLUMNS.forEach((name, i) => {
    const x = x0 + i * pitch;
    c.vline(x, 14, c.h - 14, TIMELINE);
    c.brick(x - 14, 1, 29, 13, ramp(types[i]));
    c.ctext(x, 5, name, INK);
  });
  const reply = "#4f8fe8";
  DNS_FLOW.forEach((m, i) => {
    const y = top + i * rowH + 7;
    const xa = x0 + m.from * pitch;
    const xb = x0 + m.to * pitch;
    const dir = xb > xa ? 1 : -1;
    const col = m.label === "QUERY" ? GOLD : reply;
    for (let x = xa + dir * 7; x !== xb - dir; x += dir) c.set(x, y, col);
    for (let k = 1; k <= 3; k++) {
      c.set(xb - dir * (k + 1), y - k, col);
      c.set(xb - dir * (k + 1), y + k, col);
    }
    c.set(xb - dir, y, col);
    c.rect(xa + dir * 2 - (dir < 0 ? 4 : 0), y - 3, 5, 7, OUTLINE);
    c.ctext(xa + dir * 4, y - 2, String(i + 1), INK);
    c.ctext((xa + xb) / 2 + dir * 3, y - 7, m.label, m.label === "QUERY" ? INK : DIM);
  });
  return c.sprite();
}

/** The HTTP card: fetching a page and 4 embedded objects, in round trips. */
export const HTTP_DEMO = { objects: 4 };
export const HTTP_ROWS: { mode: HttpMode; label: string }[] = [
  { mode: "non-persistent", label: "HTTP/1.0 NEW CONNECTION EACH" },
  { mode: "persistent", label: "HTTP/1.1 PERSISTENT" },
  { mode: "pipelined", label: "PIPELINED OR HTTP/2 MULTIPLEX" },
];

/** One cell per RTT: "h" is a TCP handshake, "r" a request and response. */
export function httpCells(mode: HttpMode, objects: number): ("h" | "r")[] {
  const cells: ("h" | "r")[] = [];
  if (mode === "non-persistent") for (let i = 0; i <= objects; i++) cells.push("h", "r");
  else if (mode === "persistent") cells.push("h", "r", ...Array<"r">(objects).fill("r"));
  else cells.push("h", "r", "r");
  return cells;
}

export function httpFigure(): SpriteDef {
  const unit = 13;
  const x0 = 4;
  const rows = HTTP_ROWS.length;
  const max = pageLoadRtts("non-persistent", HTTP_DEMO.objects);
  const c = new Canvas(x0 + max * unit + 6, 8 + rows * 24 + 22);
  c.panel();
  const hs = "#4f8fe8";
  const rq = "#4fc26a";
  const shade = (col: string): readonly string[] => [lighten(col, 0.35), col, darken(col, 0.25), darken(col, 0.5)];
  HTTP_ROWS.forEach(({ mode, label }, r) => {
    const y = 6 + r * 24;
    c.text(x0, y, label, INK);
    httpCells(mode, HTTP_DEMO.objects).forEach((k, i) => c.brick(x0 + i * unit, y + 7, unit - 1, 11, shade(k === "h" ? hs : rq)));
  });
  const ay = 8 + rows * 24 - 2;
  c.hline(x0, ay, max * unit, DIM);
  for (let t = 0; t <= max; t += 2) {
    c.vline(x0 + t * unit - (t ? 1 : 0), ay, 2, DIM);
    c.ctext(x0 + t * unit - (t ? 1 : 0), ay + 3, String(t), DIM);
  }
  const ly = ay + 11;
  c.rect(x0, ly, 4, 4, hs);
  c.text(x0 + 6, ly - 1, "HANDSHAKE", DIM);
  c.rect(x0 + 58, ly, 4, 4, rq);
  c.text(x0 + 64, ly - 1, "REQUEST", DIM);
  c.text(x0 + max * unit - 10, ly - 1, "RTTS", DIM);
  return c.sprite();
}

/** The DHCP card: DORA, then the lease timers. */
export const DHCP_DEMO = { ip: "192.168.1.50", leaseHours: 8 };
export const DORA_LINES: Record<(typeof DHCP_DORA)[number], string[]> = {
  Discover: ["DISCOVER", "FROM 0.0.0.0", "TO 255.255.255.255"],
  Offer: ["OFFER", `IP ${DHCP_DEMO.ip}`, `LEASE ${DHCP_DEMO.leaseHours} H`],
  Request: ["REQUEST", `WANT ${DHCP_DEMO.ip}`, "TO 255.255.255.255"],
  Acknowledge: ["ACK", `IP ${DHCP_DEMO.ip}`, `LEASE ${DHCP_DEMO.leaseHours} H`],
};

export function doraFigure(): SpriteDef {
  const cx = 34;
  const sx = 126;
  const slot = 26;
  const top = 18;
  const barY = top + DHCP_DORA.length * slot + 14;
  const c = new Canvas(160, barY + 28);
  c.panel();
  c.brick(cx - 16, 1, 32, 13, ramp("APPLICATION"));
  c.ctext(cx, 5, "CLIENT", INK);
  c.brick(sx - 16, 1, 32, 13, ramp("TRANSPORT"));
  c.ctext(sx, 5, "SERVER", INK);
  c.vline(cx, 14, barY - 20 - 14 + 6, TIMELINE);
  c.vline(sx, 14, barY - 20 - 14 + 6, TIMELINE);
  DHCP_DORA.forEach((name, i) => {
    const lines = DORA_LINES[name];
    const fromClient = i % 2 === 0;
    const y = top + i * slot;
    lines.forEach((ln, k) => c.ctext((cx + sx) / 2, y + k * 6, ln, k === 0 ? INK : DIM));
    const ys = y + 19;
    const [x0, x1] = fromClient ? [cx + 1, sx - 1] : [sx - 1, cx + 1];
    const dir = x1 > x0 ? 1 : -1;
    const col = fromClient ? GOLD : "#4f8fe8";
    for (let x = x0; x !== x1 + dir; x += dir) c.set(x, ys, col);
    for (let k = 1; k <= 3; k++) {
      c.set(x1 - dir * k, ys - k, col);
      c.set(x1 - dir * k, ys + k, col);
    }
    c.ctext(fromClient ? 10 : 150, y + 5, ["D", "O", "R", "A"][i], GOLD);
  });
  // the lease: bound until T1, renewing until T2, rebinding until it expires
  const lease = DHCP_DEMO.leaseHours * 3600;
  const { t1, t2 } = dhcpTimers(lease);
  const bx = 8;
  const bw = 144;
  const at = (t: number) => bx + Math.round((t / lease) * bw);
  const seg = (a: number, b: number, col: string) => c.brick(at(a), barY, at(b) - at(a), 9, [lighten(col, 0.35), col, darken(col, 0.25), darken(col, 0.5)]);
  c.text(bx, barY - 7, "LEASE", DIM);
  seg(0, t1, "#4fc26a");
  seg(t1, t2, "#4f8fe8");
  seg(t2, lease, "#f0a03a");
  c.ctext((at(0) + at(t1)) / 2, barY + 2, "BOUND", INK);
  c.ctext((at(t1) + at(t2)) / 2, barY + 2, "RENEW", INK);
  c.ctext(at(t1), barY + 12, `T1 ${t1 / 3600} H`, DIM);
  c.ctext(at(t2), barY + 18, `T2 ${t2 / 3600} H`, DIM);
  return c.sprite();
}
