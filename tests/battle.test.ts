import { describe, expect, it } from "vitest";
import { foeDamage, initialState, playerDamage, reducer, type BattleState } from "@/game/engine/battle";

const start = (): BattleState =>
  reducer(reducer(initialState(), { type: "load", player: { name: "Bitling", level: 5, hp: 60, maxHp: 60 }, foe: { name: "Glitchling", level: 4, hp: 100, maxHp: 100 }, questionCount: 3 }), { type: "ready" });

describe("battle reducer", () => {
  it("starts in the menu on turn 1 after the intro", () => {
    const s = start();
    expect(s.phase).toBe("menu");
    expect(s.turn).toBe(1);
  });

  it("a right answer damages the foe and a wrong one damages the player", () => {
    const hit = reducer(start(), { type: "answer", correct: true, choice: 0 });
    expect(hit.phase).toBe("player-move");
    expect(hit.foe.hp).toBe(100 - playerDamage(5, 1).damage);
    const miss = reducer(start(), { type: "answer", correct: false, choice: 2 });
    expect(miss.phase).toBe("foe-move");
    expect(miss.player.hp).toBe(60 - foeDamage(4));
    expect(miss.stats.streak).toBe(0);
  });

  it("ignores answers outside the menu phase", () => {
    const s = reducer(start(), { type: "answer", correct: true, choice: 0 });
    expect(reducer(s, { type: "answer", correct: true, choice: 0 })).toBe(s);
  });

  it("advances the question (wrapping) after each turn", () => {
    let s = start();
    for (let i = 0; i < 3; i++) s = reducer(reducer(s, { type: "answer", correct: false, choice: 0 }), { type: "resolve" });
    expect(s.player.hp).toBe(60 - 3 * foeDamage(4));
    expect(s.turn).toBe(4);
    expect(s.questionIndex).toBe(0);
  });

  it("crits from the third right answer in a row and ends in victory", () => {
    let s = start();
    const seen: boolean[] = [];
    while (s.phase === "menu") {
      s = reducer(s, { type: "answer", correct: true, choice: 1 });
      seen.push(s.last!.crit);
      s = reducer(s, { type: "resolve" });
    }
    expect(s.phase).toBe("victory");
    expect(seen.slice(0, 2)).toEqual([false, false]);
    expect(seen[2]).toBe(true);
    expect(s.foe.hp).toBe(0);
    expect(s.stats.damageDealt).toBeGreaterThanOrEqual(100);
  });

  it("ends in defeat when the player's HP runs out", () => {
    let s = start();
    while (s.phase === "menu") s = reducer(reducer(s, { type: "answer", correct: false, choice: 0 }), { type: "resolve" });
    expect(s.phase).toBe("defeat");
    expect(s.player.hp).toBe(0);
  });

  it("scales damage with level and streak", () => {
    expect(playerDamage(5, 1)).toEqual({ damage: 24, crit: false });
    expect(playerDamage(5, 2)).toEqual({ damage: 26, crit: false });
    expect(playerDamage(5, 3)).toEqual({ damage: 43, crit: true });
    expect(foeDamage(4)).toBe(18);
  });
});
