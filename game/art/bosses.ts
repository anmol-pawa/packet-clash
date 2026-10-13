import type { CreatureArt } from "./creature";
import { BRAIDWYRM } from "./creatures/braidwyrm";
import { CIDRAB } from "./creatures/cidrab";
import { HOOTPATH } from "./creatures/hootpath";
import { ORACLYNX } from "./creatures/oraclynx";
import { STACKADON } from "./creatures/stackadon";
import { SYNACKLE } from "./creatures/synackle";

/** Gym leaders' art by `Town.bossSprite` id. */
export const BOSS_ART: Record<string, CreatureArt> = {
  [STACKADON.id]: STACKADON,
  [BRAIDWYRM.id]: BRAIDWYRM,
  [CIDRAB.id]: CIDRAB,
  [HOOTPATH.id]: HOOTPATH,
  [SYNACKLE.id]: SYNACKLE,
  [ORACLYNX.id]: ORACLYNX,
};
