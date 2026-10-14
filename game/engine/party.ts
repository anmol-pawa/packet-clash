/**
 * The player's partner creature (pure, no rendering): its species, level and
 * total XP, the fighter it battles as, what a win pays, and when it evolves.
 *
 * Evolution happens at gym milestones: winning a milestone gym's badge
 * evolves the partner (and a partner that already holds that badge evolves
 * after its next win, so older saves catch up).
 */
import type { Fighter } from "./battle";
import { typesOf } from "./types";
import { gainXp, levelFor, xpReward, xpTotal, type XpGain } from "./xp";

export interface Partner {
  /** Creature id, e.g. "pingkit". */
  species: string;
  level: number;
  /** Total XP (see ./xp: reaching level L takes L³). */
  xp: number;
}

/** Display names of the creatures that can be partners. */
export const PARTNER_NAMES: Record<string, string> = { pingkit: "Pingkit", tracevix: "Tracevix" };

/** The partner every new save starts with: Pingkit at Lv 5. */
export const STARTER: Partner = { species: "pingkit", level: 5, xp: xpTotal(5) };

/** Who evolves into whom, and which gym's badge sets it off. */
export const EVOLVE_MILESTONES: { from: string; to: string; badge: number }[] = [{ from: "pingkit", to: "tracevix", badge: 3 }];

/** A saved partner, repaired if the save was edited or is from an older version. */
export function validPartner(p: unknown): Partner {
  const o = p as Partial<Partner> | null;
  if (!o || typeof o.species !== "string" || !(o.species in PARTNER_NAMES) || !Number.isFinite(o.xp)) return { ...STARTER };
  const xp = Math.max(0, Math.floor(o.xp!));
  return { species: o.species, xp, level: levelFor(xp) };
}

/** Max HP grows with level: 60 at Lv 5 (the demo's Pingkit). */
export const partnerMaxHp = (level: number): number => 35 + 5 * level;

/** The partner as a full-HP battle fighter. */
export function partnerFighter(p: Partner): Fighter {
  const hp = partnerMaxHp(p.level);
  return { name: PARTNER_NAMES[p.species] ?? p.species, level: p.level, hp, maxHp: hp, types: typesOf(p.species) };
}

/** What `species` evolves into once the player holds `badges`, or null. */
export function evolutionDue(species: string, badges: readonly number[]): string | null {
  return EVOLVE_MILESTONES.find((m) => m.from === species && badges.includes(m.badge))?.to ?? null;
}

export interface Win {
  /** The partner after the win (new level, XP and maybe species). */
  partner: Partner;
  reward: number;
  gain: XpGain;
  /** The species it evolved into, or null. */
  evolvedTo: string | null;
}

/** Beating a foe of `foeLevel` with `badges` held afterwards (including any badge just won). */
export function winBattle(p: Partner, foeLevel: number, boss: boolean, badges: readonly number[]): Win {
  const reward = xpReward(foeLevel, boss);
  const gain = gainXp(p.level, p.xp, reward);
  const evolvedTo = evolutionDue(p.species, badges);
  return { partner: { species: evolvedTo ?? p.species, level: gain.level, xp: gain.xp }, reward, gain, evolvedTo };
}
