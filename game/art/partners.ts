import type { CreatureArt } from "./creature";
import { ACKORN } from "./creatures/ackorn";
import { FRAMADILLO } from "./creatures/framadillo";
import { OAKWIND } from "./creatures/oakwind";
import { PINGKIT } from "./creatures/pingkit";
import { TRACEVIX } from "./creatures/tracevix";
import { TRUNKADILLO } from "./creatures/trunkadillo";

/** Art for every creature that can be the player's partner, by species id (see `PARTNER_NAMES`). */
export const PARTNER_ART: Record<string, CreatureArt> = {
  [PINGKIT.id]: PINGKIT,
  [TRACEVIX.id]: TRACEVIX,
  [FRAMADILLO.id]: FRAMADILLO,
  [TRUNKADILLO.id]: TRUNKADILLO,
  [ACKORN.id]: ACKORN,
  [OAKWIND.id]: OAKWIND,
};
