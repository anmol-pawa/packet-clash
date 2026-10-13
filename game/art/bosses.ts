import type { CreatureArt } from "./creature";
import { BRAIDWYRM } from "./creatures/braidwyrm";
import { STACKADON } from "./creatures/stackadon";

/** Gym leaders' art by `Town.bossSprite` id. */
export const BOSS_ART: Record<string, CreatureArt> = {
  [STACKADON.id]: STACKADON,
  [BRAIDWYRM.id]: BRAIDWYRM,
};
