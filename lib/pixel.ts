/**
 * Pixel art is stored as a palette plus rows of characters, one character per
 * pixel ("." is transparent). Keeping sprites as text makes them easy to
 * review in diffs and to render at any integer scale with crisp edges.
 */
export type Palette = Record<string, string>;

export interface SpriteDef {
  palette: Palette;
  rows: string[];
}

export interface PixelGrid {
  width: number;
  height: number;
  /** Row-major colours ("#rrggbb"), null where transparent. */
  pixels: (string | null)[];
}

export const TRANSPARENT = ".";

/** Validates a sprite and expands it to a grid of colours. */
export function parseSprite(def: SpriteDef): PixelGrid {
  const height = def.rows.length;
  if (height === 0) throw new Error("sprite has no rows");
  const width = def.rows[0].length;
  const pixels: (string | null)[] = [];
  def.rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} is ${row.length} wide, expected ${width}`);
    for (const ch of row) {
      if (ch === TRANSPARENT) pixels.push(null);
      else if (def.palette[ch]) pixels.push(def.palette[ch]);
      else throw new Error(`row ${y}: "${ch}" is not in the palette`);
    }
  });
  return { width, height, pixels };
}

/** Mirrors a sprite left-to-right (e.g. to face the other way). */
export function flipX(def: SpriteDef): SpriteDef {
  return { palette: def.palette, rows: def.rows.map((r) => [...r].reverse().join("")) };
}

/** "#rrggbb" → [r, g, b] */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Expands a grid to RGBA bytes at an integer scale (nearest neighbour). */
export function toRgba(grid: PixelGrid, scale = 1, background: string | null = null): { width: number; height: number; data: Uint8Array } {
  const width = grid.width * scale;
  const height = grid.height * scale;
  const data = new Uint8Array(width * height * 4);
  const bg = background ? hexToRgb(background) : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = grid.pixels[Math.floor(y / scale) * grid.width + Math.floor(x / scale)];
      const i = (y * width + x) * 4;
      const rgb = c ? hexToRgb(c) : bg;
      if (!rgb) continue;
      data.set([rgb[0], rgb[1], rgb[2], 255], i);
    }
  }
  return { width, height, data };
}
