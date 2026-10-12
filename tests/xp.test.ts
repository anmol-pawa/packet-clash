import { describe, expect, it } from "vitest";
import { gainXp, levelFor, MAX_LEVEL, xpProgress, xpReward, xpTotal } from "@/game/engine/xp";

describe("xp and levels", () => {
  it("needs level³ total XP to reach a level", () => {
    expect(xpTotal(1)).toBe(0);
    expect(xpTotal(2)).toBe(8);
    expect(xpTotal(5)).toBe(125);
    expect(xpTotal(10)).toBe(1000);
    // Each level costs more than the one before.
    for (let l = 2; l < MAX_LEVEL; l++) expect(xpTotal(l + 1) - xpTotal(l)).toBeGreaterThan(xpTotal(l) - xpTotal(l - 1));
  });

  it("levelFor inverts xpTotal", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(7)).toBe(1);
    expect(levelFor(8)).toBe(2);
    expect(levelFor(215)).toBe(5);
    expect(levelFor(216)).toBe(6);
    expect(levelFor(10 ** 9)).toBe(MAX_LEVEL);
    for (let l = 1; l <= MAX_LEVEL; l++) expect(levelFor(xpTotal(l))).toBe(l);
  });

  it("pays more for higher-level foes and half again for bosses", () => {
    expect(xpReward(7)).toBe(64);
    expect(xpReward(8, true)).toBe(205);
    expect(xpReward(9)).toBeGreaterThan(xpReward(8));
  });

  it("tracks progress through the current level", () => {
    expect(xpProgress(5, 125)).toBe(0);
    expect(xpProgress(5, 125 + 91 / 2)).toBeCloseTo(0.5);
    expect(xpProgress(5, 1000)).toBe(1);
    expect(xpProgress(MAX_LEVEL, 0)).toBe(1);
  });

  it("gains levels one at a time and lists each", () => {
    // The demo: Lv 5 Pingkit with 150 XP beats the Lv 8 boss.
    expect(gainXp(5, 150, xpReward(8, true))).toEqual({ level: 7, xp: 355, levelsGained: [6, 7] });
    expect(gainXp(5, 150, 10)).toEqual({ level: 5, xp: 160, levelsGained: [] });
    expect(gainXp(5, 150, -10).xp).toBe(150);
  });
});
