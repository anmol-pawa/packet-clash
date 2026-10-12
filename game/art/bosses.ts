import type { CreatureArt } from "./creature";
import { BRAIDWYRM } from "./creatures/braidwyrm";

/** Gym leaders' art by `Town.bossSprite` id. */
export const BOSS_ART: Record<string, CreatureArt> = {
  [BRAIDWYRM.id]: BRAIDWYRM,
};
