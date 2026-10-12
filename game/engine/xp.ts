/**
 * Experience points and levels (pure, no rendering).
 *
 * Total XP needed to *reach* a level is cubic (level³, with level 1 at 0),
 * so each level asks for a bit more than the last. Beating a foe pays XP
 * that scales with its level; bosses pay half as much again.
 */

export const MAX_LEVEL = 50;

/** Total XP needed to reach `level`. */
export function xpTotal(level: number): number {
  return level <= 1 ? 0 : Math.min(level, MAX_LEVEL) ** 3;
}

/** XP paid for beating a foe of `foeLevel`. */
export function xpReward(foeLevel: number, boss = false): number {
  const base = Math.floor((boss ? 120 : 64) * foeLevel / 7);
  return boss ? Math.floor(base * 1.5) : base;
}

/** How far through the current level `xp` is, from 0 to 1 (1 at the level cap). */
export function xpProgress(level: number, xp: number): number {
  if (level >= MAX_LEVEL) return 1;
  const lo = xpTotal(level);
  const hi = xpTotal(level + 1);
  return Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
}

/** The level a creature with `xp` total XP is at. */
export function levelFor(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpTotal(level + 1)) level++;
  return level;
}

export interface XpGain {
  level: number;
  xp: number;
  /** Every level reached on the way, in order (empty if none). */
  levelsGained: number[];
}

/** Adds `gain` XP to a creature at `level` with `xp` total XP. */
export function gainXp(level: number, xp: number, gain: number): XpGain {
  const total = xp + Math.max(0, gain);
  const to = Math.max(level, levelFor(total));
  const levelsGained: number[] = [];
  for (let l = level + 1; l <= to; l++) levelsGained.push(l);
  return { level: to, xp: total, levelsGained };
}
