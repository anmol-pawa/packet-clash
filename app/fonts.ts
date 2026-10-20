import { Pixelify_Sans, Press_Start_2P } from "next/font/google";
import localFont from "next/font/local";

/** Chunky 8×8 pixel face for titles, buttons and HP boxes. */
export const pressStart = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-press" });
/** Readable pixel face for body text, questions and explanations. */
export const pixelify = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixelify" });
/**
 * Our own 5×7 numerals (game/art/digitFont.ts), stacked in front of Pixelify for
 * 0–9 only, so a 5 never reads as an 8 in numeric problems.
 */
export const digits = localFont({
  src: "./fonts/packet-digits.ttf",
  variable: "--font-digits",
  display: "block",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0030-0039" }],
});
