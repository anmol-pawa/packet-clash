/**
 * The battle state machine: a pure reducer with no rendering code.
 *
 *   intro → menu → (answer) → player-move | foe-move → resolve → menu … → victory | defeat
 *
 * Each turn the player answers one question. A right answer lets their
 * creature use a move on the foe; a wrong one gives the foe a free hit.
 * Moves are typed (see ./types): the player's move has the question's type,
 * the foe's has its own first type, and the type chart scales the damage.
 */
import { effectiveness, type PacketType } from "./types";

export type Phase = "loading" | "intro" | "menu" | "player-move" | "foe-move" | "victory" | "defeat";

export interface Fighter {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  /** One or two types; untyped fighters take neutral damage. */
  types?: readonly PacketType[];
}

export interface BattleStats {
  correct: number;
  wrong: number;
  streak: number;
  bestStreak: number;
  crits: number;
  damageDealt: number;
  damageTaken: number;
}

export interface BattleState {
  phase: Phase;
  turn: number;
  questionCount: number;
  questionIndex: number;
  player: Fighter;
  foe: Fighter;
  last?: { kind: "correct" | "wrong"; damage: number; crit: boolean; choice: number; moveType?: PacketType; effect: number };
  stats: BattleStats;
}

export type Action =
  | { type: "load"; player: Fighter; foe: Fighter; questionCount: number }
  | { type: "ready" }
  /** `moveType` is the question's type: the type of the player's move if the answer is right. */
  | { type: "answer"; correct: boolean; choice: number; moveType?: PacketType }
  | { type: "resolve" };

export const emptyStats = (): BattleStats => ({ correct: 0, wrong: 0, streak: 0, bestStreak: 0, crits: 0, damageDealt: 0, damageTaken: 0 });

export function initialState(): BattleState {
  return {
    phase: "loading",
    turn: 0,
    questionCount: 0,
    questionIndex: 0,
    player: { name: "", level: 1, hp: 1, maxHp: 1 },
    foe: { name: "", level: 1, hp: 1, maxHp: 1 },
    stats: emptyStats(),
  };
}

/** Damage of the player's move. The third right answer in a row (and every one after) is a critical hit. */
export function playerDamage(level: number, streak: number): { damage: number; crit: boolean } {
  const crit = streak >= 3;
  const base = 14 + level * 2;
  const streakBonus = 1 + 0.1 * Math.min(Math.max(streak - 1, 0), 4);
  return { damage: Math.round(base * streakBonus * (crit ? 1.5 : 1)), crit };
}

/** A move's type multiplier against a fighter (neutral if either is untyped). */
export function moveEffect(moveType: PacketType | undefined, target: Fighter): number {
  return moveType && target.types?.length ? effectiveness(moveType, target.types) : 1;
}

/** Damage of the foe's free hit after a wrong answer. */
export function foeDamage(level: number): number {
  return 10 + level * 2;
}

export function reducer(s: BattleState, a: Action): BattleState {
  switch (a.type) {
    case "load":
      return { ...initialState(), phase: "intro", player: a.player, foe: a.foe, questionCount: a.questionCount };
    case "ready":
      return s.phase === "intro" ? { ...s, phase: "menu", turn: 1 } : s;
    case "answer": {
      if (s.phase !== "menu") return s;
      if (a.correct) {
        const streak = s.stats.streak + 1;
        const hit = playerDamage(s.player.level, streak);
        const effect = moveEffect(a.moveType, s.foe);
        const damage = Math.max(1, Math.round(hit.damage * effect));
        const crit = hit.crit;
        return {
          ...s,
          phase: "player-move",
          foe: { ...s.foe, hp: Math.max(0, s.foe.hp - damage) },
          last: { kind: "correct", damage, crit, choice: a.choice, moveType: a.moveType, effect },
          stats: {
            ...s.stats,
            correct: s.stats.correct + 1,
            streak,
            bestStreak: Math.max(s.stats.bestStreak, streak),
            crits: s.stats.crits + (crit ? 1 : 0),
            damageDealt: s.stats.damageDealt + damage,
          },
        };
      }
      const moveType = s.foe.types?.[0];
      const effect = moveEffect(moveType, s.player);
      const damage = Math.max(1, Math.round(foeDamage(s.foe.level) * effect));
      return {
        ...s,
        phase: "foe-move",
        player: { ...s.player, hp: Math.max(0, s.player.hp - damage) },
        last: { kind: "wrong", damage, crit: false, choice: a.choice, moveType, effect },
        stats: { ...s.stats, wrong: s.stats.wrong + 1, streak: 0, damageTaken: s.stats.damageTaken + damage },
      };
    }
    case "resolve": {
      if (s.phase !== "player-move" && s.phase !== "foe-move") return s;
      if (s.foe.hp <= 0) return { ...s, phase: "victory" };
      if (s.player.hp <= 0) return { ...s, phase: "defeat" };
      const next = s.questionCount > 0 ? (s.questionIndex + 1) % s.questionCount : 0;
      return { ...s, phase: "menu", turn: s.turn + 1, questionIndex: next };
    }
  }
}
