import type { SpriteDef } from "@/lib/pixel";

/** Every creature has these animations for both its front and back sprite. */
export const ANIMS = ["idle", "attack", "hurt", "faint"] as const;
export type AnimName = (typeof ANIMS)[number];

export type AnimSet = Record<AnimName, SpriteDef[]>;

export interface CreatureArt {
  id: string;
  name: string;
  /** Width and height of every frame (64 for regular creatures, 96 for bosses). */
  size: number;
  /** Seen by the player: used when the creature is the foe. */
  front: AnimSet;
  /** Seen from behind: used when the creature is on the player's side. */
  back: AnimSet;
  /** Frames per second of the idle loop. */
  idleFps: number;
  /** One-line flavour text for the Packetdex / sprite viewer. */
  blurb: string;
}
