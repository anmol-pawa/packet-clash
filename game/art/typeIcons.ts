import { TYPE_INFO, TYPES, type PacketType } from "@/game/engine/types";
import type { SpriteDef } from "@/lib/pixel";

/**
 * Type icons: 11×11 pixel emblems for the type chips and the type chart. Each
 * is a rounded, outlined tile in the type's colour (lit along the top and left
 * edges, shaded along the bottom and right) with a 7×7 engraved emblem and its
 * drop shadow.
 */

export const TYPE_ICON_SIZE = 11;

// 7×7 emblems ("#" = emblem).
export const TYPE_EMBLEMS: Record<PacketType, string[]> = {
  // A lightning bolt: a signal on the wire.
  PHYSICAL: ["....##.", "...##..", "..##...", ".#####.", "...##..", "..##...", ".##...."],
  // Two chain links: a link joins two neighbours.
  LINK: [".###...", "#...#..", "#..###.", "#.#.#.#", ".###..#", "..#...#", "...###."],
  // Three routers with two links: a network of hops.
  NETWORK: ["..###..", "..###..", ".#...#.", "#.....#", "###.###", "###.###", "......."],
  // Two arrows, out and back: a two-way connection between ports.
  TRANSPORT: ["....#..", "######.", "....#..", ".......", "..#....", ".######", "..#...."],
  // An app window: a title bar over a line of text.
  APPLICATION: ["#######", "#.....#", "#######", "#.....#", "#.###.#", "#.....#", "#######"],
  // A padlock.
  SECURITY: ["..###..", ".#...#.", ".#...#.", "#######", "###.###", "###.###", "#######"],
};

const mix = (hex: string, to: string, t: number) => {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};

/** The icon of one type. */
export function typeIcon(type: PacketType): SpriteDef {
  const N = TYPE_ICON_SIZE;
  const c = TYPE_INFO[type].color;
  const palette = {
    o: "#1a1433",
    // tile ramp: lit edge, face, shaded edge
    a: mix(c, "#ffffff", 0.45),
    b: c,
    c: mix(c, "#000000", 0.35),
    // the emblem and its shadow
    w: mix(c, "#ffffff", 0.88),
    s: mix(c, "#000000", 0.6),
  };
  const emblem = TYPE_EMBLEMS[type];
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < 7 && j < 7 && emblem[j][i] === "#";
  const rows: string[] = [];
  for (let y = 0; y < N; y++) {
    let row = "";
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, N - 1 - x) + Math.min(y, N - 1 - y);
      let ch = ".";
      // rounded corners: the outline skips the corner pixel
      if (edge >= 1) ch = "o";
      if (x >= 1 && y >= 1 && x <= N - 2 && y <= N - 2 && edge >= 3) {
        ch = x === N - 2 || y === N - 2 ? "c" : x === 1 || y === 1 ? "a" : "b";
        if (on(x - 2, y - 2)) ch = "w";
        else if (on(x - 3, y - 3)) ch = "s";
      }
      row += ch;
    }
    rows.push(row);
  }
  return { palette, rows };
}

export const TYPE_ICONS: Record<PacketType, SpriteDef> = Object.fromEntries(TYPES.map((t) => [t, typeIcon(t)])) as Record<PacketType, SpriteDef>;
