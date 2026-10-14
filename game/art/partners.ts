import type { CreatureArt } from "./creature";
import { PINGKIT } from "./creatures/pingkit";
import { TRACEVIX } from "./creatures/tracevix";

/** Art for every creature that can be the player's partner, by species id (see `PARTNER_NAMES`). */
export const PARTNER_ART: Record<string, CreatureArt> = {
  [PINGKIT.id]: PINGKIT,
  [TRACEVIX.id]: TRACEVIX,
};
