import { describe, expect, it } from "vitest";
import { DEBUG_BANK } from "@/content/questions/debugBank";
import { DEBUG_GENERATORS } from "@/content/questions/debugGenerators";
import { SYSDESIGN_GENERATORS } from "@/content/questions/sysdesignGenerators";
import { SYSDESIGN_BANK } from "@/content/questions/sysdesignBank";
import { cardKey } from "@/game/engine/leitner";
import { LOOP_LENGTH, ROUNDS, loopCard, loopDeck, opensRound, roundOf } from "@/game/engine/faangLoop";
import { MOCK_POOL } from "@/game/engine/mockInterview";
import { correctResponse, grade, type Question } from "@/game/engine/questions";
import type { Result } from "@/game/engine/mockInterview";

const mk = (q: Question, correct: boolean): Result => ({ q, correct, timedOut: false, seconds: 10 });

describe("FAANG loop deck", () => {
  it("deals three rounds of unique, answerable cards, deterministic per seed", () => {
    for (const seed of [1, 2, 99, 12345]) {
      const deck = loopDeck(seed);
      expect(deck).toHaveLength(LOOP_LENGTH);
      expect(new Set(deck.map((q) => cardKey(q.id))).size).toBe(LOOP_LENGTH);
      for (const q of deck) expect(grade(q, correctResponse(q))).toBe(true);
      expect(loopDeck(seed).map((q) => q.prompt)).toEqual(deck.map((q) => q.prompt));
    }
    expect(loopDeck(1).map((q) => q.prompt)).not.toEqual(loopDeck(2).map((q) => q.prompt));
  });

  it("round 2 is debugging and round 3 is design, round 1 is neither", () => {
    const deck = loopDeck(5);
    const debugIds = new Set([...DEBUG_BANK, ...DEBUG_GENERATORS].map((q) => q.id));
    const designIds = new Set([...SYSDESIGN_BANK, ...SYSDESIGN_GENERATORS].map((q) => q.id));
    const [r1, r2, r3] = ROUNDS.map((_, k) => deck.filter((_, n) => ROUNDS.indexOf(roundOf(n)) === k));
    expect(r1.some((q) => debugIds.has(cardKey(q.id)) || designIds.has(cardKey(q.id)))).toBe(false);
    expect(r2.every((q) => debugIds.has(cardKey(q.id)))).toBe(true);
    expect(r3.length).toBe(ROUNDS[2].count);
    const ds = r1.map((q) => q.difficulty);
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
  });

  it("marks round boundaries", () => {
    const opens = Array.from({ length: LOOP_LENGTH }, (_, n) => n).filter(opensRound);
    expect(opens).toEqual([0, 6, 10]);
  });
});

describe("loop scorecard", () => {
  const deck = loopDeck(3);
  const all = (f: (n: number) => boolean) => deck.map((q, n) => mk(q, f(n)));

  it("hires a clean sweep and rejects a blank sheet", () => {
    expect(loopCard(all(() => true)).verdict).toBe("STRONG HIRE");
    expect(loopCard(all(() => false)).verdict).toBe("NO HIRE");
  });

  it("caps the verdict when one round is under 40%", () => {
    const card = loopCard(all((n) => roundOf(n).id !== "debug"));
    expect(card.overall.percent).toBeGreaterThanOrEqual(65);
    expect(card.redFlags.map((r) => r.id)).toEqual(["debug"]);
    expect(card.verdict).toBe("LEAN NO HIRE");
    expect(card.rounds.map((x) => x.card.total)).toEqual(ROUNDS.map((r) => r.count));
  });

  it("interview deck pool covers the new banks with unique ids", () => {
    expect(new Set(MOCK_POOL.map((q) => q.id)).size).toBe(MOCK_POOL.length);
    expect(MOCK_POOL.some((q) => q.id.startsWith("dbg-"))).toBe(true);
    expect(MOCK_POOL.some((q) => q.id.startsWith("websec-"))).toBe(true);
  });
});
