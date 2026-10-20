import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import { DIGIT_COLS, DIGIT_GLYPHS, DIGIT_METRICS, DIGIT_ROWS, glyphRects, pixelDistance } from "@/game/art/digitFont";
import { buildDigitFont } from "../scripts/gen-digit-font.mjs";

const DIGITS = "0123456789".split("");

describe("Packet Digits", () => {
  it("has a 5×7 grid for every digit", () => {
    expect(Object.keys(DIGIT_GLYPHS).sort()).toEqual(DIGITS);
    for (const d of DIGITS) {
      expect(DIGIT_GLYPHS[d]).toHaveLength(DIGIT_ROWS);
      for (const row of DIGIT_GLYPHS[d]) expect(row).toMatch(new RegExp(`^[#.]{${DIGIT_COLS}}$`));
    }
  });

  it("keeps every pair of digits apart, and look-alikes of 8 far apart", () => {
    for (const a of DIGITS) for (const b of DIGITS) if (a < b) expect(pixelDistance(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(4);
    // the pairs that Pixelify's numerals blur together at small sizes
    for (const d of ["0", "3", "5", "6", "9"]) expect(pixelDistance(d, "8"), `${d} vs 8`).toBeGreaterThanOrEqual(5);
    // a 5 is open on the left where an 8 is closed
    expect(DIGIT_GLYPHS["5"][4][0]).toBe(".");
    expect(DIGIT_GLYPHS["8"][4][0]).toBe("#");
  });

  it("draws each lit pixel exactly once, inside the numeral box", () => {
    const { left, pixel, baseline } = DIGIT_METRICS;
    for (const d of DIGITS) {
      const lit = DIGIT_GLYPHS[d].join("").split("").filter((c) => c === "#").length;
      const rects = glyphRects(d);
      const area = rects.reduce((s, r) => s + (r.x1 - r.x0) / pixel, 0);
      expect(area).toBe(lit);
      for (const r of rects) {
        expect(r.x0).toBeGreaterThanOrEqual(left);
        expect(r.x1).toBeLessThanOrEqual(left + DIGIT_COLS * pixel);
        expect(r.y0).toBeGreaterThanOrEqual(baseline);
        expect(r.y1).toBeLessThanOrEqual(baseline + DIGIT_ROWS * pixel);
      }
    }
  });

  it("matches the committed font file (run `npm run font` after editing)", () => {
    const committed = readFileSync(new URL("../app/fonts/packet-digits.ttf", import.meta.url));
    const font = opentype.parse(committed.buffer.slice(committed.byteOffset, committed.byteOffset + committed.byteLength));
    const built = buildDigitFont();
    expect(font.names.fontFamily.en).toBe("Packet Digits");
    expect(font.unitsPerEm).toBe(DIGIT_METRICS.unitsPerEm);
    for (const d of DIGITS) {
      const g = font.charToGlyph(d);
      expect(g.advanceWidth, d).toBe(DIGIT_METRICS.advance);
      expect(g.path.toPathData(0), d).toBe(built.glyphs.get(DIGITS.indexOf(d) + 1).path.toPathData(0));
    }
    // digits only: anything else falls through to Pixelify
    expect(font.charToGlyph("A").index).toBe(0);
    expect(Object.keys(font.tables.cmap.glyphIndexMap).map(Number).sort((a, b) => a - b)).toEqual(DIGITS.map((d) => d.charCodeAt(0)));
  });
});
