// Builds app/fonts/packet-digits.ttf from the pixel grids in
// game/art/digitFont.ts. Run with `npm run font` after changing the grids.
import { writeFileSync } from "node:fs";
import opentype from "opentype.js";
import { DIGIT_GLYPHS, DIGIT_METRICS, glyphRects } from "../game/art/digitFont.ts";

const { unitsPerEm, ascender, descender, advance } = DIGIT_METRICS;

export function buildDigitFont() {
  const glyphs = [new opentype.Glyph({ name: ".notdef", advanceWidth: advance, path: new opentype.Path() })];
  for (const d of Object.keys(DIGIT_GLYPHS).sort()) {
    const path = new opentype.Path();
    // clockwise in y-up font units, the TrueType outer-contour direction
    for (const r of glyphRects(d)) {
      path.moveTo(r.x0, r.y0);
      path.lineTo(r.x0, r.y1);
      path.lineTo(r.x1, r.y1);
      path.lineTo(r.x1, r.y0);
      path.close();
    }
    glyphs.push(new opentype.Glyph({ name: `digit${d}`, unicode: d.charCodeAt(0), advanceWidth: advance, path }));
  }
  const font = new opentype.Font({
    familyName: "Packet Digits",
    styleName: "Regular",
    unitsPerEm,
    ascender,
    descender,
    glyphs,
    // a fixed creation date (opentype.js always stamps "modified" with now)
    createdTimestamp: 1,
  });
  return font;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const font = buildDigitFont();
  writeFileSync(new URL("../app/fonts/packet-digits.ttf", import.meta.url), Buffer.from(font.toArrayBuffer()));
  console.log("wrote app/fonts/packet-digits.ttf");
}
