import type { SpriteDef } from "@/lib/pixel";

/** A battle platform: a pixel ellipse (stage coordinates) a creature stands on. */
export interface PlatformSpot {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * An illustrated battle background for one area. `image` covers the stage
 * (256×192 logical pixels) plus a margin on every side, because wide or tall
 * screens and camera shake show more than the 256×192 frame; it is drawn with
 * its top-left corner at (`x`, `y`) in stage coordinates.
 */
export interface BattleBackground {
  id: string;
  name: string;
  x: number;
  y: number;
  image: SpriteDef;
  /** Small drifting cloud sprites, animated by the stage. */
  clouds: SpriteDef[];
  /** Blinking signal lights (stage coordinates), animated by the stage. */
  lights: { x: number; y: number; color: number }[];
  platforms: { player: PlatformSpot; foe: PlatformSpot };
}
