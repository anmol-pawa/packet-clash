// Renders the app icons (favicon, Apple touch icon, PWA icons) from the
// Bitling sprite so every icon is original, in-repo pixel art.
// Run with `npm run icons` after changing game/art/mascot.ts.
import { writeFileSync } from "node:fs";
import { BITLING } from "../game/art/mascot.ts";
import { parseSprite, toRgba } from "../lib/pixel.ts";
import { encodePng } from "./png.mjs";

const BG = "#2b2350";
const sprite = parseSprite(BITLING);

/** Centres the sprite at an integer scale on a square of `size` px. */
function icon(size, scale, background = BG) {
  const art = toRgba(sprite, scale);
  const data = new Uint8Array(size * size * 4);
  const bg = background ? [parseInt(background.slice(1, 3), 16), parseInt(background.slice(3, 5), 16), parseInt(background.slice(5, 7), 16), 255] : null;
  const off = Math.floor((size - art.width) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const ax = x - off;
      const ay = y - off;
      const j = (ay * art.width + ax) * 4;
      if (ax >= 0 && ay >= 0 && ax < art.width && ay < art.height && art.data[j + 3]) data.set(art.data.subarray(j, j + 4), i);
      else if (bg) data.set(bg, i);
    }
  }
  return encodePng({ width: size, height: size, data });
}

writeFileSync("public/icon-192.png", icon(192, 5));
writeFileSync("public/icon-512.png", icon(512, 12)); // 384 px art keeps the maskable safe zone
writeFileSync("app/apple-icon.png", icon(180, 5));
writeFileSync("app/icon.png", icon(64, 2));
console.log("icons written");
