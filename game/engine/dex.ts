/**
 * The Packetdex (pure, no rendering): which creatures the player has seen and
 * caught, in dex order.
 *
 * - Seen: met in a battle, or offered on the starter pedestals.
 * - Caught: the partner, every form it has evolved through, and every gym
 *   leader beaten (a beaten leader registers its full data).
 *
 * Saves from before the dex kept `seen`/`caught` empty, so `dexRecord` also
 * rebuilds what a save must already have seen from its partner and badges.
 */
import { TOWNS } from "@/content/world";
import { EVOLVE_MILESTONES, STARTERS, needsStarter } from "./party";

export interface DexRecord {
  seen: string[];
  caught: string[];
}

/** Each starter line (base form, then its evolution), in pedestal order. */
const STARTER_LINES = STARTERS.flatMap((s) => [s, ...EVOLVE_MILESTONES.filter((m) => m.from === s).map((m) => m.to)]);

/** Every creature in dex order: the starter lines, then the gym leaders in gym order. */
export const DEX: readonly string[] = [...STARTER_LINES, ...TOWNS.flatMap((t) => (t.bossSprite ? [t.bossSprite] : []))];

/** A creature's dex number (1-based), or 0 if it isn't in the dex. */
export const dexNumber = (id: string): number => DEX.indexOf(id) + 1;

/** "No. 007" */
export const dexLabel = (id: string): string => `No. ${String(dexNumber(id)).padStart(3, "0")}`;

/** `ids` kept in dex order, without duplicates or unknown ids. */
const inDex = (ids: Iterable<string>): string[] => {
  const set = new Set(ids);
  return DEX.filter((id) => set.has(id));
};

/** `species` and every form it evolved from. */
export function lineUpTo(species: string): string[] {
  const from = EVOLVE_MILESTONES.find((m) => m.to === species)?.from;
  return from ? [...lineUpTo(from), species] : [species];
}

/** Adds sightings (and catches, which are sightings too). */
export function record(rec: DexRecord, seen: readonly string[], caught: readonly string[] = []): DexRecord {
  return { seen: inDex([...rec.seen, ...seen, ...caught]), caught: inDex([...rec.caught, ...caught]) };
}

/** A gym battle begins: the leader is seen, and so is the partner. */
export const recordEncounter = (rec: DexRecord, foe: string, partner: string): DexRecord => record(rec, [foe], lineUpTo(partner));

/** A gym battle is won: the leader is caught, and so is the partner's (maybe new) form. */
export const recordWin = (rec: DexRecord, foe: string, partner: string): DexRecord => record(rec, [], [foe, ...lineUpTo(partner)]);

/** The starter is chosen: all three were seen on the pedestals, the chosen one is caught. */
export const recordStarter = (rec: DexRecord, starter: string): DexRecord => record(rec, STARTERS, [starter]);

/** A save's dex: what it recorded, plus what its partner and badges imply it has seen and caught. */
export function dexRecord(s: { seen?: unknown; caught?: unknown; partner: { species?: unknown } | null; badges: readonly number[] }): DexRecord {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  let rec: DexRecord = record({ seen: [], caught: [] }, list(s.seen), list(s.caught));
  if (!needsStarter(s)) {
    // Saves from before the starter choice played as Pingkit.
    const species = typeof s.partner?.species === "string" ? s.partner.species : "pingkit";
    rec = record(rec, s.partner ? STARTERS : [], lineUpTo(species));
  }
  const beaten = TOWNS.filter((t) => t.bossSprite && s.badges.includes(t.gym)).map((t) => t.bossSprite!);
  return record(rec, [], beaten);
}

export type DexStatus = "unseen" | "seen" | "caught";

export const dexStatus = (rec: DexRecord, id: string): DexStatus => (rec.caught.includes(id) ? "caught" : rec.seen.includes(id) ? "seen" : "unseen");
