import { flipX, type Palette, type SpriteDef } from "@/lib/pixel";
import type { Facing } from "@/game/world/travel";

/**
 * The player on the overworld: a packet courier in a blue cap with an
 * antenna, a red jacket and a gold messenger bag. 12×16, drawn to the map's
 * own pixel scale, with a 4-step walk cycle (stand, step, stand, other step)
 * for each direction; right is the mirrored left profile.
 */

const PALETTE: Palette = {
  o: "#1a1424", // outline
  L: "#9fe0ff", // cap light
  C: "#3fa7e0", // cap
  c: "#2468a8", // cap shadow / brim
  s: "#f8cfa6", // skin
  S: "#d8946e", // skin shadow
  H: "#6a3c26", // hair
  h: "#43241a", // hair shadow
  K: "#ff8a7a", // jacket light
  J: "#e0484f", // jacket
  j: "#a12c3e", // jacket shadow
  B: "#ffd257", // bag and strap
  b: "#b8862e", // bag shadow
  P: "#3d4688", // trousers
  p: "#272c5c", // trousers shadow
  F: "#f4f1ff", // trainers
  a: "#ff5a5a", // antenna light
};

const sprite = (rows: string[]): SpriteDef => ({ palette: PALETTE, rows });

// 12 columns: ".........." etc. Heads and bodies per direction, legs per step.
const FRONT_TOP = [
  "......a.....",
  "...ooooo....",
  "..oLLCCCoo..",
  ".oLCCCCCCco.",
  ".oCCCCCCcco.",
  "oocccccccccc",
  ".osssssssSo.",
  ".osossssoSo.",
  ".oSssssssSo.",
  "..oSSssSSo..",
  ".oKJBJJJJjo.",
  "oKJJJBJJJjjo",
  "osJJJJBJJjso",
];
const FRONT_LEGS = {
  stand: ["..oPPPPPpo..", "..oPPo.oPPo.", "..oFFo.oFFo."],
  stepA: ["..oPPPPPpo..", "..oPPo.oFFo.", "..oFFo..oo.."],
  stepB: ["..oPPPPPpo..", "..oFFo.oPPo.", "...oo..oFFo."],
};

const BACK_TOP = [
  "......a.....",
  "...ooooo....",
  "..oLLCCCoo..",
  ".oLCCCCCCco.",
  ".oCCCCCCcco.",
  ".occcccccco.",
  ".oHHHHHHHho.",
  ".oHHHHHHhho.",
  ".oHHHHHhhho.",
  "..ohhhhhho..",
  ".oKJJJJBJjo.",
  "oKJJJJBJJjjo",
  "osJJJBJJJjso",
];
const BACK_LEGS = {
  stand: [".obBPPPPPpo.", "..oPPo.oPPo.", "..oFFo.oFFo."],
  stepA: [".obBPPPPPpo.", "..oPPo.oFFo.", "..oFFo..oo.."],
  stepB: [".obBPPPPPpo.", "..oFFo.oPPo.", "...oo..oFFo."],
};

const SIDE_TOP = [
  ".......a....",
  "....ooooo...",
  "...oLCCCCo..",
  "..oLCCCCCco.",
  "..oCCCCCcco.",
  "oooccccccco.",
  "..osssHHHho.",
  "..osossHhho.",
  ".oSssssHHho.",
  "..ooSSSSho..",
  "...oKJJJjo..",
  "..oKJJJJjjo.",
  "..oJJsJJjBo.",
];
const SIDE_LEGS = {
  stand: ["...oPPPPbBo.", "...oPPPpo...", "..oFFFFFo..."],
  stepA: ["...oPPPPbBo.", "..oPPo.oPo..", ".oFFo.oFFo.."],
  stepB: ["...oPPPPbBo.", "...oPooPPo..", "..oFFooFFo.."],
};

type Legs = typeof FRONT_LEGS;
const cycle = (top: string[], legs: Legs) => [legs.stand, legs.stepA, legs.stand, legs.stepB].map((l) => sprite([...top, ...l]));

const LEFT = cycle(SIDE_TOP, SIDE_LEGS);

/** Walk cycles (4 frames each); frame 0 is the standing pose. */
export const COURIER: Record<Facing, SpriteDef[]> = {
  down: cycle(FRONT_TOP, FRONT_LEGS),
  up: cycle(BACK_TOP, BACK_LEGS),
  left: LEFT,
  right: LEFT.map(flipX),
};

export const COURIER_W = 12;
export const COURIER_H = 16;
/** The pixel under the courier's feet, relative to the sprite's top-left. */
export const COURIER_FEET: [number, number] = [6, 15];
