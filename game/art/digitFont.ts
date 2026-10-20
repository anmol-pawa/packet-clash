// "Packet Digits": an original 5×7 pixel numeral face that replaces only the
// digits 0–9 in body text (via unicode-range), because Pixelify Sans's rounded
// 5 reads as 8 at small sizes ("1.536 Mbps" looked like "1.836").
// The shapes are built so look-alike pairs differ in many pixels: 5 and 3 have
// flat tops and an open left side, 8 has a pinched waist, 0 is slashed.
// Run `npm run font` after editing to regenerate app/fonts/packet-digits.ttf.

export const DIGIT_COLS = 5;
export const DIGIT_ROWS = 7;

export const DIGIT_GLYPHS: Record<string, readonly string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "#.#..", "..#..", "..#..", "..#..", "#####"],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "....#", "...#.", "..##.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
};

/** Font units, matched to Pixelify Sans so digits sit on the same grid. */
export const DIGIT_METRICS = {
  unitsPerEm: 1000,
  ascender: 920,
  descender: -280,
  /** Pixelify's numerals are 5 pixels wide on a 586-unit advance. */
  advance: 586,
  left: 60,
  /** One pixel; 7 of them span Pixelify's numeral height (-12 → 632). */
  pixel: 92,
  baseline: -12,
} as const;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/**
 * A glyph's pixels as font-unit rectangles, one per horizontal run (y up).
 * Each run overlaps the rows above and below by one unit so the nonzero-filled
 * union has no hairline seams.
 */
export function glyphRects(digit: string): Rect[] {
  const rows = DIGIT_GLYPHS[digit];
  const { pixel: p, left, baseline } = DIGIT_METRICS;
  const rects: Rect[] = [];
  rows.forEach((row, r) => {
    const top = baseline + (DIGIT_ROWS - r) * p;
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "#") continue;
      let end = c;
      while (row[end + 1] === "#") end++;
      rects.push({ x0: left + c * p, x1: left + (end + 1) * p, y0: top - p - (r < DIGIT_ROWS - 1 ? 1 : 0), y1: top + (r > 0 ? 1 : 0) });
      c = end;
    }
  });
  return rects;
}

/** How many pixels two digits differ in. */
export function pixelDistance(a: string, b: string): number {
  let d = 0;
  DIGIT_GLYPHS[a].forEach((row, r) => {
    for (let c = 0; c < DIGIT_COLS; c++) if (row[c] !== DIGIT_GLYPHS[b][r][c]) d++;
  });
  return d;
}
