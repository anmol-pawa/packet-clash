import type { SpriteDef } from "@/lib/pixel";
import type { CreatureArt } from "./creature";
import { ACKORN } from "./creatures/ackorn";
import { FRAMADILLO } from "./creatures/framadillo";
import { OAKWIND } from "./creatures/oakwind";
import { PINGKIT } from "./creatures/pingkit";
import { TRACEVIX } from "./creatures/tracevix";
import { TRUNKADILLO } from "./creatures/trunkadillo";

/** Who evolves into whom. */
export const EVOLUTIONS: { from: CreatureArt; to: CreatureArt }[] = [
  { from: PINGKIT, to: TRACEVIX },
  { from: FRAMADILLO, to: TRUNKADILLO },
  { from: ACKORN, to: OAKWIND },
];

export function evolutionOf(id: string): CreatureArt | undefined {
  return EVOLUTIONS.find((e) => e.from.id === id)?.to;
}

const WHITE = { w: "#ffffff" };

// 4×4 Bayer matrix (0–15): the order in which pixels switch during the dissolve.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** A sprite's filled pixels on a `size`×`size` canvas, anchored at bottom centre (how actors stand on the stage). */
function mask(def: SpriteDef, size: number): boolean[] {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const ox = Math.floor((size - w) / 2);
  const oy = size - h;
  const m = new Array<boolean>(size * size).fill(false);
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && (m[(y + oy) * size + x + ox] = true)));
  return m;
}

function toSprite(m: boolean[], size: number): SpriteDef {
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    let r = "";
    for (let x = 0; x < size; x++) r += m[y * size + x] ? "w" : ".";
    rows.push(r);
  }
  return { palette: WHITE, rows };
}

/**
 * White silhouettes dissolving from `from` into `to` in `steps` frames: the
 * first frame is `from`'s silhouette and the last is `to`'s. Pixels both
 * shapes share stay lit; the rest switch over in ordered-dither order, so
 * every in-between frame is a readable mix of the two outlines.
 */
export function morphFrames(from: SpriteDef, to: SpriteDef, steps = 6): SpriteDef[] {
  const size = Math.max(from.rows.length, from.rows[0].length, to.rows.length, to.rows[0].length);
  const a = mask(from, size);
  const b = mask(to, size);
  const out: SpriteDef[] = [];
  for (let s = 0; s < steps; s++) {
    const k = steps === 1 ? 1 : s / (steps - 1);
    const m = a.map((on, i) => {
      if (on === b[i]) return on;
      const t = (BAYER[Math.floor(i / size) & 3][i % size & 3] + 0.5) / 16;
      return t < k ? b[i] : on;
    });
    out.push(toSprite(m, size));
  }
  return out;
}

export interface EvolveStep {
  /** Which white silhouette to show. */
  sprite: SpriteDef;
  /** Seconds to hold it. */
  dur: number;
  /** A brief vertical stretch when the shape switches (1 = none). */
  stretch: number;
}

/**
 * The evolve sequence: the old form's silhouette pulses, the old and new
 * silhouettes swap faster and faster, then the shapes dissolve into each
 * other and the new silhouette holds before the colours come back.
 */
export function evolveSchedule(from: SpriteDef, to: SpriteDef): EvolveStep[] {
  const frames = morphFrames(from, to, 8);
  const a = frames[0];
  const b = frames[frames.length - 1];
  const steps: EvolveStep[] = [{ sprite: a, dur: 0.6, stretch: 1 }];
  const swaps = [0.34, 0.28, 0.22, 0.17, 0.13, 0.1, 0.08, 0.06, 0.05, 0.05];
  swaps.forEach((dur, i) => steps.push({ sprite: i % 2 ? a : b, dur, stretch: 1.06 }));
  for (const f of frames.slice(1, -1)) steps.push({ sprite: f, dur: 0.07, stretch: 1.03 });
  steps.push({ sprite: b, dur: 0.5, stretch: 1 });
  return steps;
}
