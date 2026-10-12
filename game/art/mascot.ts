import type { SpriteDef } from "@/lib/pixel";
import type { AnimSet } from "./creature";

/**
 * Bitling, the title-screen mascot: a round signal-sprite carrying a sealed
 * envelope (a packet) with two blinking antenna LEDs. Original design.
 * Lit from the upper left: A/a/b/c is the body's highlight→shadow ramp,
 * F/f/g the envelope's, R/r/d the LEDs'.
 */
export const BITLING_PALETTE = {
  o: "#1a1433",
  A: "#c8f4ff",
  a: "#7fd6f5",
  b: "#3fa3db",
  c: "#23649e",
  w: "#ffffff",
  F: "#fff6d6",
  f: "#f7d77a",
  g: "#d9a441",
  R: "#ffd1dc",
  r: "#ff4f7b",
  d: "#b82652",
  p: "#ff9bb8",
};

export const BITLING: SpriteDef = {
  palette: BITLING_PALETTE,
  rows: [
    "................................",
    "......oo................oo......",
    ".....oRro..............oRro.....",
    ".....ordo..............ordo.....",
    "......oo................oo......",
    "........o..............o........",
    "........o...ooooooo....o........",
    ".........oooaaaaaaaoooo.........",
    ".......ooaaaaaaaaaaaaaoo........",
    "......oaaaaaaaaaaaaaaabbo.......",
    ".....oaaaaaaaaaaaaaaaabbbo......",
    "....oaaaaaooooaaaaoooobbbbo.....",
    "....oaaaaaowooaaaaowoobbbbo.....",
    "...oaaaaaaooooaaaaoooobbbbbo....",
    "...oaaaaaaooooaaaaoooobbbbco....",
    "..oaaaaaaaaooaoaaoaoobbbbbcco...",
    "..oaaaaappaaaaaooabbbbppbccco...",
    "..oaaaaaaaaaaaaaabbbbbbbcccco...",
    "..oaaaaaagFFFFFFFfffffgccccco...",
    "..oaaaaaaFgFFFFFFffffggccccco...",
    "...oaaaaaFFgFFFFFfffgfgcccco....",
    "...obbbbbfffgffffffgffgcccco....",
    "....obbbbffffgffffgfffgccco.....",
    "....obbbbfffffgRrgffffgccco.....",
    ".....obbbffffffrrfffffgcco......",
    "......obcggggggddggggggco.......",
    ".......oocccccccccccccoo........",
    "........obbbcccccccobbbco.......",
    "........occccooooooocccco.......",
    ".........oooo.......oooo........",
    "................................",
    "................................",
  ],
};

/** Second idle frame: the antenna LEDs dim between blinks. */
export const BITLING_DIM: SpriteDef = {
  palette: { ...BITLING_PALETTE, R: "#b82652", r: "#8a1d40", d: "#5c1530" },
  rows: BITLING.rows,
};

/**
 * Glitchling, the demo battle's wild foe: Bitling's frame corrupted into a
 * magenta/violet palette with a green "error" envelope. A stand-in until the
 * real creature roster arrives (0.3).
 */
const GLITCHLING_PALETTE = {
  ...BITLING_PALETTE,
  A: "#f6c8ff",
  a: "#d27ff5",
  b: "#9a3fdb",
  c: "#5a239e",
  F: "#e3ffd6",
  f: "#8af77a",
  g: "#3fa64a",
  R: "#fff3a8",
  r: "#ffd23f",
  d: "#b8861f",
  p: "#ff7ad9",
};

export const GLITCHLING: SpriteDef = { palette: GLITCHLING_PALETTE, rows: BITLING.rows };
export const GLITCHLING_DIM: SpriteDef = {
  palette: { ...GLITCHLING_PALETTE, R: "#b8861f", r: "#7a5a14", d: "#4d390d" },
  rows: BITLING.rows,
};

/** Glitchling as a stage animation set (one drawing, so every animation reuses it). */
export const GLITCHLING_ANIMS: AnimSet = {
  idle: [GLITCHLING, GLITCHLING_DIM],
  attack: [GLITCHLING],
  hurt: [GLITCHLING_DIM],
  faint: [GLITCHLING_DIM],
};
