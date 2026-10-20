import { describe, expect, it } from "vitest";
import { DECK_SIZE, GYM_TOPICS, demoDeck, gymDeck } from "@/content/questions/decks";
import { BANK } from "@/content/questions/bank";
import { GENERATORS } from "@/content/questions/generators";
import { EMPTY_LEITNER, cardKey, review, startSession } from "@/game/engine/leitner";
import { correctResponse, grade } from "@/game/engine/questions";

const keys = (qs: { id: string }[]) => qs.map((q) => cardKey(q.id));

describe("battle decks", () => {
  it("a gym deck is full, has no repeated card, and is seeded", () => {
    for (let gym = 1; gym <= 9; gym++) {
      const s = startSession(EMPTY_LEITNER);
      const deck = gymDeck(s, gym, 42);
      expect(deck).toHaveLength(DECK_SIZE);
      expect(new Set(keys(deck)).size).toBe(DECK_SIZE);
      expect(keys(gymDeck(s, gym, 42))).toEqual(keys(deck));
      for (const q of deck) expect(grade(q, correctResponse(q))).toBe(true);
    }
  });

  it("a gym asks its own chapter first", () => {
    const own = (gym: number) => {
      const topics = GYM_TOPICS[gym];
      return BANK.filter((q) => topics.includes(q.topic)).length + GENERATORS.filter((g) => topics.includes(g.topic)).length;
    };
    for (const gym of [1, 3, 5]) {
      const deck = gymDeck(startSession(EMPTY_LEITNER), gym, 9);
      const n = Math.min(DECK_SIZE, own(gym));
      expect(n).toBeGreaterThan(0);
      expect(deck.filter((q) => GYM_TOPICS[gym].includes(q.topic)).length).toBe(n);
    }
  });

  it("a missed card comes back in its gym's next battle", () => {
    let s = startSession(EMPTY_LEITNER);
    // Miss one network card and pass the rest: the miss is due again next session.
    const first = gymDeck(s, 3, 1);
    const missed = first.find((q) => q.topic === "network")!;
    for (const q of first) s = review(s, q.id, q !== missed);
    s = startSession(s);
    expect(keys(gymDeck(s, 3, 2))).toContain(cardKey(missed.id));
  });

  it("the demo opens with one question of each kind and covers the whole bank", () => {
    const deck = demoDeck(7);
    expect(deck.slice(0, 4).map((q) => q.kind)).toEqual(["mcq", "multi", "numeric", "order"]);
    expect(deck).toHaveLength(BANK.length + GENERATORS.length);
    expect(keys(demoDeck(7))).toEqual(keys(deck));
  });
});
