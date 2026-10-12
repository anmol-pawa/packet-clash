import { TOWNS, type Town } from "./world";
import type { Fighter } from "@/game/engine/battle";

/**
 * Gym battles: each town's leader is a boss fight. Winning earns the gym's
 * badge, which opens the next town (see `isUnlocked` in ./world).
 *
 * Until the chapter question banks land (2.x), every gym asks the demo set.
 */

/** The town whose gym is number `n`, or null for anything else (e.g. a bad `?n=`). */
export function gymTown(n: number | string | null | undefined): Town | null {
  const gym = typeof n === "string" ? Number(n) : n;
  return TOWNS.find((t) => t.gym === gym) ?? null;
}

/** The leader's fighter stats: later gyms are tougher. Gym 2 is the Lv 8, 100 HP Braidwyrm of the demo. */
export function gymFoe(t: Town): Fighter {
  const hp = 80 + 10 * t.gym;
  return { name: t.boss, level: 4 + 2 * t.gym, hp, maxHp: hp };
}

/** A gym can be challenged once its boss has art (the other leaders are still being drawn). */
export const gymOpen = (t: Town): boolean => t.bossSprite !== null;

/** Badges after winning gym `gym`: no duplicates, in gym order. */
export function winBadge(badges: readonly number[], gym: number): number[] {
  return [...new Set([...badges, gym])].sort((a, b) => a - b);
}

/** The town a gym's badge unlocks (null after the last gym). */
export function unlockedBy(gym: number): Town | null {
  return TOWNS.find((t) => t.gym === gym + 1) ?? null;
}
