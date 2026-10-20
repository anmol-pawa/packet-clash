import type { Block } from "@/game/engine/encap";
import { TYPE_INFO, type PacketType } from "@/game/engine/types";
import type { SpriteDef } from "@/lib/pixel";
import { MICRO_H, microRows, microWidth } from "./microFont";

/**
 * Header chips: each block of an attack's PDU is drawn as a small shaded
 * pixel tab in its layer's colour with its name stamped on it (ETH, IP, TCP…).
 * Headers have a notch on the left (they're added in front), trailers on the
 * right, and payloads are cream envelopes with a fold line.
 */

export const CHIP_H = MICRO_H + 6;

function mix(hex: string, to: string, k: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** A 4-shade ramp (highlight, base, shadow, deep) from a layer colour. */
export function chipRamp(layer: PacketType): [string, string, string, string] {
  const c = TYPE_INFO[layer].color;
  return [mix(c, "#ffffff", 0.35), c, mix(c, "#000000", 0.25), mix(c, "#000000", 0.5)];
}

const cache = new Map<string, SpriteDef>();

export function chipSprite(block: Pick<Block, "label" | "layer" | "kind">): SpriteDef {
  const key = `${block.kind}:${block.layer}:${block.label}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const payload = block.kind === "payload";
  const [hi, base, sh, deep] = payload ? ["#fffbea", "#f3e2b3", "#d9b97a", "#a8824a"] : chipRamp(block.layer);
  const ink = payload ? "#3a2a18" : TYPE_INFO[block.layer].ink;
  const palette = { o: "#140f26", h: hi, b: base, s: sh, d: deep, i: ink };
  const tw = microWidth(block.label);
  const w = tw + 6;
  const text = microRows(block.label, "i", "b");
  const rows: string[] = [];
  for (let y = 0; y < CHIP_H; y++) {
    let r: string;
    if (y === 0 || y === CHIP_H - 1) r = "." + "o".repeat(w - 2) + ".";
    else if (y === 1) r = "o" + "h".repeat(w - 2) + "o";
    else if (y === CHIP_H - 2) r = "o" + "d".repeat(w - 2) + "o";
    else if (y === CHIP_H - 3) r = "o" + "s".repeat(w - 2) + "o";
    else if (y - 2 < MICRO_H) r = "oh" + "b" + text[y - 2] + "b" + "so";
    else r = "oh" + "b".repeat(w - 4) + "so";
    rows.push(r);
  }
  const set = (y: number, x: number, c: string) => (rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1));
  // the notch: a header's leading edge, a trailer's trailing edge
  const mid = Math.floor(CHIP_H / 2);
  if (block.kind === "header") [mid - 1, mid, mid + 1].forEach((y, i) => set(y, 0, i === 1 ? "." : "o"));
  if (block.kind === "trailer") [mid - 1, mid, mid + 1].forEach((y, i) => set(y, w - 1, i === 1 ? "." : "o"));
  // the payload's envelope fold: a shadow V across the top
  if (payload) {
    set(1, 1, "s");
    set(1, w - 2, "s");
  }
  const def = { palette, rows };
  cache.set(key, def);
  return def;
}

/** A tiny bit glyph (0 or 1) that trails a packet in flight on the wire. */
export function bitSprite(bit: 0 | 1): SpriteDef {
  return chipSprite({ label: String(bit), layer: "PHYSICAL", kind: "payload" });
}

/** A PDU-name tag ("SEGMENT", "FRAME"…) shown over the packet as it changes. */
export function tagSprite(text: string, layer: PacketType): SpriteDef {
  const key = `tag:${layer}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = microWidth(text) + 4;
  const ink = TYPE_INFO[layer].color;
  const rows = ["." + "o".repeat(w - 2) + ".", ...microRows(text, "i", "k").map((r) => "ok" + r + "ko"), "." + "o".repeat(w - 2) + "."];
  rows.splice(1, 0, "o" + "k".repeat(w - 2) + "o");
  rows.splice(rows.length - 1, 0, "o" + "k".repeat(w - 2) + "o");
  const def = { palette: { o: "#140f26", k: "#221a3d", i: mix(ink, "#ffffff", 0.3) }, rows };
  cache.set(key, def);
  return def;
}
