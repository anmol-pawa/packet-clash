import type { CreatureArt } from "./creature";
import { BRAIDWYRM } from "./creatures/braidwyrm";
import { FETCHIMERA } from "./creatures/fetchimera";
import { GIGAROC } from "./creatures/gigaroc";
import { CIDRAB } from "./creatures/cidrab";
import { HOOTPATH } from "./creatures/hootpath";
import { KEYVERN } from "./creatures/keyvern";
import { ORACLYNX } from "./creatures/oraclynx";
import { STACKADON } from "./creatures/stackadon";
import { SPANTOISE } from "./creatures/spantoise";
import { AREADON } from "./creatures/areadon";
import { NATTOPUS } from "./creatures/nattopus";
import { ACLAW } from "./creatures/aclaw";
import { HASHORN } from "./creatures/hashorn";
import { SPINEBACK } from "./creatures/spineback";
import { SYNACKLE } from "./creatures/synackle";

/** Gym leaders' art by `Town.bossSprite` id. */
export const BOSS_ART: Record<string, CreatureArt> = {
  [STACKADON.id]: STACKADON,
  [BRAIDWYRM.id]: BRAIDWYRM,
  [CIDRAB.id]: CIDRAB,
  [HOOTPATH.id]: HOOTPATH,
  [SYNACKLE.id]: SYNACKLE,
  [ORACLYNX.id]: ORACLYNX,
  [KEYVERN.id]: KEYVERN,
  [FETCHIMERA.id]: FETCHIMERA,
  [GIGAROC.id]: GIGAROC,
  [SPANTOISE.id]: SPANTOISE,
  [AREADON.id]: AREADON,
  [NATTOPUS.id]: NATTOPUS,
  [ACLAW.id]: ACLAW,
  [HASHORN.id]: HASHORN,
  [SPINEBACK.id]: SPINEBACK,
};
